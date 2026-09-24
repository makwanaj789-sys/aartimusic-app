/* ============================================================
   AARTI MUSIC — Mini App
   ============================================================ */
(function () {
  "use strict";

  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor("#0A0908"); tg.setBackgroundColor("#0A0908"); } catch (e) {}
  }

  // Telegram signs this; the server checks it before serving any audio.
  const INIT = (tg && tg.initData) || "";

  // Only for opening the app in a plain browser while building it.
  // Match WEBAPP_DEV_KEY in .env — and empty it again before sharing.
  const DEV_KEY = "";

  // Inside Telegram this stays empty and relative paths work, because
  // the page and the API come from the same server. In the Android
  // build the page lives on the phone, so every call needs the full
  // address — looked up at startup, so a moved server doesn't mean a
  // new APK for everyone.
  let SERVER = window.AARTI_SERVER || "";

  async function findServer() {
    if (!window.AARTI_DISCOVERY) return;
    try {
      const r = await fetch(window.AARTI_DISCOVERY + "?t=" + Date.now(),
                            { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      if (j && j.server) SERVER = j.server.replace(/\/$/, "");
    } catch (e) {
      // no connection, or the file isn't there — carry on with what
      // was built in rather than refusing to start
    }
  }

  const $ = (id) => document.getElementById(id);
  const audio = $("audio");

  let queue = [];
  let index = -1;

  // Every play attempt gets a number. Tapping a second song while the
  // first is still loading used to leave two attempts racing, and the
  // loser would quietly stop the winner — which is why the title
  // changed but nothing played. Anything from an older attempt is now
  // ignored outright.
  let token = 0;

  const headers = () => {
    const h = {};
    if (INIT) h["X-Init-Data"] = INIT;
    if (DEV_KEY) h["X-Dev-Key"] = DEV_KEY;
    return h;
  };

  const time = (s) => {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    return m + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  };

  const buzz = (k) => { try { tg.HapticFeedback.impactOccurred(k || "light"); } catch (e) {} };

  /* ---------- search ---------------------------------------- */

  const ready = findServer();

  $("searchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const term = $("q").value.trim();
    if (!term) return;

    $("q").blur();
    $("hint").hidden = true;
    $("list").hidden = true;
    $("loading").hidden = false;

    try {
      await ready;
      const r = await fetch(SERVER + "/api/search?q=" + encodeURIComponent(term), { headers: headers() });
      if (r.status === 401) return say("Locked", "Open this from the bot to play music.");
      if (!r.ok) return say("Hmm", "Search failed. Try again.");
      queue = (await r.json()).results || [];
      render();
    } catch (err) {
      say("Offline", "No connection right now.");
    } finally {
      $("loading").hidden = true;
    }
  });

  function say(head, msg) {
    $("list").hidden = true;
    $("hint").hidden = false;
    $("hint").querySelector("h2").textContent = head;
    $("hint").querySelector("p").textContent = msg;
  }

  function render() {
    const list = $("list");
    list.innerHTML = "";

    if (!queue.length) return say("Nothing found", "Try a different spelling.");

    queue.forEach((song, i) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        '<img loading="lazy" alt="">' +
        '<div class="info"><div class="title"></div><div class="sub"></div></div>' +
        '<div class="len"></div>';

      // textContent, not innerHTML: titles are arbitrary text from
      // YouTube and would otherwise be read as markup.
      row.querySelector("img").src = song.thumb;
      row.querySelector(".title").textContent = song.title;
      row.querySelector(".sub").textContent = song.artist || "Unknown";
      row.querySelector(".len").textContent = time(song.duration);

      row.addEventListener("click", () => playAt(i));
      list.appendChild(row);
    });

    list.hidden = false;
  }

  /* ---------- playing --------------------------------------- */

  function mark(state) {
    [...$("list").children].forEach((row, i) => {
      row.classList.toggle("on", i === index);
      row.classList.toggle("busy", i === index && state === "busy");
      if (i === index && state !== "dead") row.classList.remove("dead");
      if (i === index && state === "dead") row.classList.add("dead");
    });
  }

  function waiting(on) {
    $("mPlay").classList.toggle("wait", on);
    $("nPlay").classList.toggle("wait", on);
  }

  function paint(song) {
    $("mArt").src = song.thumb;
    $("nArt").src = song.thumb;
    $("nowBg").style.backgroundImage = 'url("' + song.thumb + '")';

    $("mTitle").textContent = song.title;
    $("nTitle").textContent = song.title;
    $("mArtist").textContent = song.artist || "Unknown";
    $("nArtist").textContent = song.artist || "Unknown";
    $("nDur").textContent = time(song.duration);

    const nxt = queue[index + 1];
    $("upNext").textContent = nxt ? "Up next · " + nxt.title : "";
  }

  function streamUrl(id) {
    let url = SERVER + "/api/stream/" + encodeURIComponent(id);
    const auth = [];
    // An <audio src> can't carry a header — the browser makes that
    // request itself — so the proof of identity rides in the address.
    if (INIT) auth.push("initData=" + encodeURIComponent(INIT));
    if (DEV_KEY) auth.push("devKey=" + encodeURIComponent(DEV_KEY));
    return auth.length ? url + "?" + auth.join("&") : url;
  }

  function playAt(i) {
    if (i < 0 || i >= queue.length) return;

    const mine = ++token;
    const song = queue[i];
    index = i;

    buzz("light");
    mark("busy");
    waiting(true);
    $("mini").hidden = false;
    paint(song);

    audio.src = streamUrl(song.id);
    audio.load();

    const go = () => {
      if (mine !== token) return;        // a newer tap has taken over
      audio.play().catch(() => {});
    };

    // A song nobody has asked for before is fetched from YouTube first,
    // so the file may not exist yet when the tap happens. Try now, and
    // again the moment there is something to play.
    audio.addEventListener("canplay", go, { once: true });
    go();
  }

  const toggle = () => {
    if (!audio.src) return;
    buzz("light");
    audio.paused ? audio.play().catch(() => {}) : audio.pause();
  };

  $("mPlay").addEventListener("click", toggle);
  $("nPlay").addEventListener("click", toggle);
  $("mNext").addEventListener("click", () => playAt(index + 1));
  $("nNext").addEventListener("click", () => playAt(index + 1));
  $("nPrev").addEventListener("click", () => {
    // Part-way into a song, "previous" restarts it — as everywhere else.
    if (audio.currentTime > 4) { audio.currentTime = 0; return; }
    playAt(index - 1);
  });

  audio.addEventListener("playing", () => {
    waiting(false);
    mark("on");
    icons(true);
  });
  audio.addEventListener("pause", () => icons(false));
  audio.addEventListener("waiting", () => waiting(true));
  audio.addEventListener("ended", () => playAt(index + 1));

  audio.addEventListener("error", () => {
    waiting(false);
    mark("dead");
    // One dead track shouldn't end the listening session.
    setTimeout(() => { if (index < queue.length - 1) playAt(index + 1); }, 900);
  });

  function icons(playing) {
    document.querySelectorAll(".ic-play").forEach((s) => (s.hidden = playing));
    document.querySelectorAll(".ic-pause").forEach((s) => (s.hidden = !playing));
  }

  audio.addEventListener("timeupdate", () => {
    const d = audio.duration;
    if (!d || !isFinite(d)) return;
    const pct = (audio.currentTime / d) * 100;
    $("miniFill").style.width = pct + "%";
    $("seekFill").style.width = pct + "%";
    $("seekKnob").style.left = pct + "%";
    $("nCur").textContent = time(audio.currentTime);
    $("nDur").textContent = time(d);
  });

  /* ---------- seeking --------------------------------------- */

  const rail = document.querySelector(".seek-rail");
  const seekTo = (clientX) => {
    const d = audio.duration;
    if (!d || !isFinite(d)) return;
    const box = rail.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    audio.currentTime = p * d;
  };
  rail.addEventListener("click", (e) => seekTo(e.clientX));

  let dragging = false;
  rail.addEventListener("touchstart", () => { dragging = true; }, { passive: true });
  rail.addEventListener("touchmove", (e) => {
    if (dragging) seekTo(e.touches[0].clientX);
  }, { passive: true });
  rail.addEventListener("touchend", () => { dragging = false; });

  /* ---------- full screen ----------------------------------- */

  const now = $("now");
  const open = () => {
    now.classList.add("open");
    now.setAttribute("aria-hidden", "false");
    document.body.classList.add("locked");
    try { tg.BackButton.show(); } catch (e) {}
  };
  const close = () => {
    now.classList.remove("open");
    now.setAttribute("aria-hidden", "true");
    document.body.classList.remove("locked");
    try { tg.BackButton.hide(); } catch (e) {}
  };

  $("miniOpen").addEventListener("click", open);
  $("mArt").addEventListener("click", open);
  $("nowClose").addEventListener("click", close);

  // Telegram's own back button closes it, which is what a phone user
  // expects from a full-screen sheet.
  try { tg.BackButton.onClick(close); } catch (e) {}

  // …and so does a downward swipe.
  let startY = null;
  now.addEventListener("touchstart", (e) => { startY = e.touches[0].clientY; }, { passive: true });
  now.addEventListener("touchend", (e) => {
    if (startY === null) return;
    if (e.changedTouches[0].clientY - startY > 90) close();
    startY = null;
  });

  /* ---------- lock screen -----------------------------------
     Puts the track on the phone's own media controls, so playback
     survives the screen going off and the notification shows the
     right song. This is what makes it feel like a music app rather
     than a web page.                                             */
  audio.addEventListener("loadedmetadata", () => {
    const song = queue[index];
    if (!song || !("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist || "Aarti Music",
      artwork: [{ src: song.thumb, sizes: "480x360", type: "image/jpeg" }],
    });
    navigator.mediaSession.setActionHandler("play", () => audio.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("nexttrack", () => playAt(index + 1));
    navigator.mediaSession.setActionHandler("previoustrack", () => playAt(index - 1));
  });
})();
