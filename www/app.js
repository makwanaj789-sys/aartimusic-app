/* ============================================================
   AARTI MUSIC
   ============================================================ */
(function () {
  "use strict";

  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready(); tg.expand();
    try { tg.setHeaderColor("#0A0908"); tg.setBackgroundColor("#0A0908"); } catch (e) {}
  }

  const INIT = (tg && tg.initData) || "";
  const DEV_KEY = window.AARTI_KEY || "";

  let SERVER = window.AARTI_SERVER || "";
  let found = false;

  const $ = (id) => document.getElementById(id);
  const audio = $("audio");

  /* ---------- what the app remembers ------------------------
     Kept on the phone, not the server: favourites, history and
     what was playing last. The backend only knows how to search
     and how to stream, and keeping it that way means none of
     this depends on being signed in to anything.            */

  const KEY = "aarti.v1";
  const store = {
    favs: [], recents: [], history: [], repeat: "off", shuffle: false,
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(store, JSON.parse(raw));
    } catch (e) {}
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
  }
  load();

  /* ---------- state ----------------------------------------- */

  let queue = [];        // what plays next, in order
  let index = -1;
  let results = [];      // last search, shown on the Search tab
  let token = 0;         // guards against two plays racing
  let sleepAt = 0;       // timestamp, or -1 for "end of this track"
  let actionSong = null;

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

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- haptics ---------------------------------------
     Telegram's bridge where there is one; silence everywhere
     else. Every call is wrapped because the bridge exists but
     throws on desktop clients that have no haptic hardware. */
  const buzz = (k) => {
    try { tg.HapticFeedback.impactOccurred(k || "light"); } catch (e) {}
  };
  const buzzDone = (type) => {
    try { tg.HapticFeedback.notificationOccurred(type || "success"); } catch (e) {}
  };
  const buzzPick = () => {
    try { tg.HapticFeedback.selectionChanged(); } catch (e) {}
  };

  /* ---------- press and ripple ------------------------------
     Delegated, so anything added to the DOM later is covered
     without being registered. Everything here is decoration: it
     runs on pointerdown, after the browser has already decided
     which element the tap belongs to, and the ripple lives in a
     pointer-events:none layer inside the target. A second tap
     during an animation hits the element, not the ripple. */
  const PRESSABLE = "button,.row,.card,.chip,.act,.queue-open,[data-press]";

  function ripple(el, e) {
    if (REDUCED) return;
    let layer = el.querySelector(":scope > .rip-layer");
    if (!layer) {
      layer = document.createElement("span");
      layer.className = "rip-layer";
      el.appendChild(layer);
    }
    const box = el.getBoundingClientRect();
    const size = Math.max(box.width, box.height) * 2.1;
    const dot = document.createElement("span");
    dot.className = "rip";
    dot.style.setProperty("--r", size + "px");
    dot.style.setProperty("--x", ((e.clientX || box.left + box.width / 2) - box.left) + "px");
    dot.style.setProperty("--y", ((e.clientY || box.top + box.height / 2) - box.top) + "px");
    layer.appendChild(dot);
    dot.addEventListener("animationend", () => dot.remove(), { once: true });
    // A dropped animationend (backgrounded tab, mid-flight removal)
    // would otherwise leave the node behind for good.
    setTimeout(() => dot.remove(), 900);
  }

  let pressed = null;
  const release = () => {
    if (pressed) pressed.classList.remove("pressing");
    pressed = null;
  };

  document.addEventListener("pointerdown", (e) => {
    const el = e.target.closest && e.target.closest(PRESSABLE);
    if (!el || el.disabled) return;
    el.classList.add("pressable", "pressing");
    pressed = el;
    ripple(el, e);
  }, { passive: true });

  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) =>
    document.addEventListener(ev, release, { passive: true })
  );
  // Scrolling away from a press should let go of it too.
  document.addEventListener("scroll", release, { passive: true, capture: true });
  /* Window-level blur only. A capture-phase blur listener fires
     whenever focus moves between elements — including the blur the
     press itself causes — which cancelled every press the moment
     it started. */
  window.addEventListener("blur", release);

  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1900);
  }

  /* ---------- finding the server ---------------------------- */

  async function findServer(force) {
    if (!window.AARTI_DISCOVERY) return;
    if (found && !force) return;
    try {
      const r = await fetch(window.AARTI_DISCOVERY + "?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      if (j && j.server) { SERVER = j.server.replace(/\/$/, ""); found = true; }
    } catch (e) {
      // offline, or the file isn't there — carry on with what was
      // built in rather than refusing to start
    }
  }
  const ready = findServer();

  async function api(path) {
    await ready;
    try {
      return await fetch(SERVER + path, { headers: headers() });
    } catch (first) {
      // The server has most likely moved since the app opened.
      await findServer(true);
      return await fetch(SERVER + path, { headers: headers() });
    }
  }

  /* ---------- tabs ------------------------------------------ */

  const pages = { Home: $("pHome"), Search: $("pSearch"), Lib: $("pLib") };

  function tab(name) {
    Object.entries(pages).forEach(([k, el]) => (el.hidden = k !== name));
    [...$("nav").children].forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
    if (name === "Home") drawHome();
    if (name === "Lib") drawLib();
    if (name === "Search") drawHistory();
    window.scrollTo(0, 0);
  }
  [...$("nav").children].forEach((b) =>
    b.addEventListener("click", () => { buzz(); tab(b.dataset.tab); })
  );

  /* ---------- rows ------------------------------------------ */

  const isFav = (id) => store.favs.some((s) => s.id === id);

  function heart(song) {
    const b = document.createElement("button");
    b.className = "icon" + (isFav(song.id) ? " fav" : "");
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.5-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.5-7 9-7 9z"/></svg>';
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFav(song);
      b.classList.toggle("fav", isFav(song.id));
    });
    return b;
  }

  function rowFor(song, list, i) {
    const row = document.createElement("div");
    row.className = "row";
    if (queue[index] && queue[index].id === song.id) row.classList.add("on");

    const img = document.createElement("img");
    img.loading = "lazy"; img.src = song.thumb;

    const info = document.createElement("div");
    info.className = "info";
    const t = document.createElement("div");
    t.className = "title";
    t.textContent = song.title;                 // arbitrary text — never innerHTML
    const s = document.createElement("div");
    s.className = "sub";
    s.textContent = song.artist || "Unknown";
    info.append(t, s);

    const more = document.createElement("button");
    more.className = "icon";
    more.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>';
    more.addEventListener("click", (e) => { e.stopPropagation(); openActions(song); });

    row.append(img, info, heart(song), more);

    const play = () => { queue = list.slice(); playAt(i); };
    img.addEventListener("click", play);
    info.addEventListener("click", play);

    return row;
  }

  function fill(box, list) {
    box.innerHTML = "";
    list.forEach((song, i) => box.appendChild(rowFor(song, list, i)));
  }

  /* ---------- home ------------------------------------------ */

  function drawHome() {
    const hour = new Date().getHours();
    $("pHome").querySelector("h1").textContent =
      hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

    const hasRecent = store.recents.length > 0;
    const hasFavs = store.favs.length > 0;

    $("recentBlock").hidden = !hasRecent;
    $("favBlock").hidden = !hasFavs;
    $("homeEmpty").hidden = hasRecent || hasFavs;
    $("greetSub").textContent = hasRecent ? "Pick up where you left off" : "Let's find something";

    const rail = $("recentRail");
    rail.innerHTML = "";
    store.recents.slice(0, 12).forEach((song, i) => {
      const card = document.createElement("div");
      card.className = "card";
      const img = document.createElement("img");
      img.loading = "lazy"; img.src = song.thumb;
      const t = document.createElement("div");
      t.className = "t"; t.textContent = song.title;
      card.append(img, t);
      card.addEventListener("click", () => {
        queue = store.recents.slice();
        playAt(i);
      });
      rail.appendChild(card);
    });

    fill($("favRows"), store.favs.slice(0, 6));
  }

  $("playFavs").addEventListener("click", () => {
    if (!store.favs.length) return;
    queue = shuffled(store.favs);
    store.shuffle = true; save(); paintModes();
    playAt(0);
  });

  /* ---------- search ---------------------------------------- */

  $("searchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const term = $("q").value.trim();
    if (!term) return;
    search(term);
  });

  async function search(term) {
    $("q").value = term;
    $("q").blur();
    $("searchEmpty").hidden = true;
    $("histBlock").hidden = true;
    $("results").innerHTML = "";
    $("loading").hidden = false;

    try {
      const r = await api("/api/search?q=" + encodeURIComponent(term));

      if (r.status === 401) return empty("Locked", "This copy can't reach the server.");
      if (!r.ok) return empty("Hmm", "Search failed. Try again.");

      results = (await r.json()).results || [];
      if (!results.length) return empty("Nothing found", "Try a different spelling.");

      remember(term);
      fill($("results"), results);
    } catch (err) {
      empty("Offline", "Can't reach the server right now.");
    } finally {
      $("loading").hidden = true;
    }
  }

  function empty(head, msg) {
    const box = $("searchEmpty");
    box.hidden = false;
    box.querySelector("h3").textContent = head;
    box.querySelector("p").textContent = msg;
  }

  function remember(term) {
    store.history = [term, ...store.history.filter((h) => h !== term)].slice(0, 10);
    save();
  }

  function drawHistory() {
    const has = store.history.length > 0 && !$("results").children.length;
    $("histBlock").hidden = !has;
    if (!has) return;

    const box = $("histChips");
    box.innerHTML = "";
    store.history.forEach((term) => {
      const c = document.createElement("button");
      c.className = "chip";
      c.textContent = term;
      c.addEventListener("click", () => search(term));
      box.appendChild(c);
    });
  }

  $("clearHist").addEventListener("click", () => {
    store.history = []; save(); drawHistory(); toast("Cleared");
  });

  /* ---------- library --------------------------------------- */

  let libView = "favs";
  [...document.querySelectorAll("[data-lib]")].forEach((b) =>
    b.addEventListener("click", () => {
      libView = b.dataset.lib;
      document.querySelectorAll("[data-lib]").forEach((x) => x.classList.toggle("on", x === b));
      drawLib();
    })
  );

  function drawLib() {
    const list = libView === "favs" ? store.favs : store.recents;
    $("libEmpty").hidden = list.length > 0;
    $("libEmpty").querySelector("h3").textContent =
      libView === "favs" ? "Nothing saved" : "Nothing played yet";
    $("libEmpty").querySelector("p").textContent =
      libView === "favs" ? "Tap the heart on any song to keep it here."
                         : "Songs you play show up here.";
    fill($("libRows"), list);
  }

  /* ---------- favourites and history ------------------------ */

  function toggleFav(song) {
    if (isFav(song.id)) {
      store.favs = store.favs.filter((s) => s.id !== song.id);
      toast("Removed");
    } else {
      store.favs.unshift(song);
      toast("Saved to favourites");
    }
    save();
    paintFavButtons();
    if (!pages.Lib.hidden) drawLib();
    if (!pages.Home.hidden) drawHome();
  }

  function addRecent(song) {
    store.recents = [song, ...store.recents.filter((s) => s.id !== song.id)].slice(0, 30);
    save();
  }

  function paintFavButtons() {
    const song = queue[index];
    if (!song) return;
    $("mFav").classList.toggle("fav", isFav(song.id));
    $("nFav").classList.toggle("fav", isFav(song.id));
  }

  $("mFav").addEventListener("click", (e) => { e.stopPropagation(); if (queue[index]) toggleFav(queue[index]); });
  $("nFav").addEventListener("click", () => { if (queue[index]) toggleFav(queue[index]); });

  /* ---------- playing --------------------------------------- */

  function streamUrl(id) {
    let url = SERVER + "/api/stream/" + encodeURIComponent(id);
    const auth = [];
    // An <audio src> can't carry a header — the browser makes that
    // request itself — so the proof of identity rides in the address.
    if (INIT) auth.push("initData=" + encodeURIComponent(INIT));
    if (DEV_KEY) auth.push("devKey=" + encodeURIComponent(DEV_KEY));
    return auth.length ? url + "?" + auth.join("&") : url;
  }

  async function playAt(i) {
    if (i < 0 || i >= queue.length) return;

    await ready;
    const mine = ++token;                 // anything older is now stale
    const song = queue[i];
    index = i;

    buzz("light");
    $("mini").hidden = false;
    waiting(true);
    paint(song);
    addRecent(song);

    audio.src = streamUrl(song.id);
    audio.load();

    const go = () => {
      if (mine !== token) return;
      audio.play().catch(() => {});
    };
    // A song nobody has asked for before is fetched from YouTube
    // first, so the file may not exist yet when the tap happens.
    audio.addEventListener("canplay", go, { once: true });
    go();

    markRows();
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
    $("upNextLabel").textContent = nxt ? "Up next · " + nxt.title : "Queue";
    paintFavButtons();
  }

  function markRows() {
    const id = queue[index] && queue[index].id;
    document.querySelectorAll(".row").forEach((row) => {
      const t = row.querySelector(".title");
      row.classList.toggle("on", !!id && t && t.textContent === (queue[index] || {}).title);
    });
  }

  const waiting = (on) => {
    $("mPlay").classList.toggle("wait", on);
    $("nPlay").classList.toggle("wait", on);
  };

  const toggle = () => {
    if (!audio.src) return;
    buzz();
    audio.paused ? audio.play().catch(() => {}) : audio.pause();
  };
  $("mPlay").addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
  $("nPlay").addEventListener("click", toggle);

  function nextIndex() {
    if (store.repeat === "one") return index;
    if (index < queue.length - 1) return index + 1;
    return store.repeat === "all" ? 0 : -1;
  }

  const next = () => { const i = nextIndex(); if (i >= 0) playAt(i); };
  $("nNext").addEventListener("click", next);
  $("nPrev").addEventListener("click", () => {
    // Part-way in, "previous" restarts the song — as everywhere else.
    if (audio.currentTime > 4) { audio.currentTime = 0; return; }
    playAt(index - 1);
  });

  audio.addEventListener("playing", () => { waiting(false); icons(true); });
  audio.addEventListener("pause", () => icons(false));
  audio.addEventListener("waiting", () => waiting(true));

  audio.addEventListener("ended", () => {
    if (sleepAt === -1) { sleepAt = 0; toast("Sleep timer — stopping"); return; }
    if (store.repeat === "one") { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    next();
  });

  audio.addEventListener("error", () => {
    waiting(false);
    toast("Couldn't play that one");
    // One dead track shouldn't end the session.
    setTimeout(next, 800);
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

    if (sleepAt > 0 && Date.now() > sleepAt) {
      audio.pause(); sleepAt = 0; toast("Sleep timer — paused");
    }
  });

  /* ---------- shuffle and repeat ---------------------------- */

  function shuffled(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  $("bShuffle").addEventListener("click", () => {
    store.shuffle = !store.shuffle;
    save(); paintModes(); buzz();

    if (store.shuffle && queue.length > 1) {
      // Keep the current song where it is and shuffle what's left, so
      // turning it on doesn't interrupt what's playing.
      const current = queue[index];
      const rest = shuffled(queue.filter((_, i) => i !== index));
      queue = [current, ...rest];
      index = 0;
      paint(current);
    }
    toast(store.shuffle ? "Shuffle on" : "Shuffle off");
  });

  $("bRepeat").addEventListener("click", () => {
    store.repeat = store.repeat === "off" ? "all" : store.repeat === "all" ? "one" : "off";
    save(); paintModes(); buzz();
    toast(store.repeat === "off" ? "Repeat off"
        : store.repeat === "all" ? "Repeat queue" : "Repeat one");
  });

  function paintModes() {
    $("bShuffle").classList.toggle("on", store.shuffle);
    $("bRepeat").classList.toggle("on", store.repeat !== "off");
    $("bRepeat").querySelector(".one").hidden = store.repeat !== "one";
  }

  /* ---------- seeking --------------------------------------- */

  const rail = $("seekRail");
  const seekTo = (x) => {
    const d = audio.duration;
    if (!d || !isFinite(d)) return;
    const box = rail.getBoundingClientRect();
    audio.currentTime = Math.min(1, Math.max(0, (x - box.left) / box.width)) * d;
  };
  rail.addEventListener("click", (e) => seekTo(e.clientX));
  let dragging = false;
  rail.addEventListener("touchstart", () => (dragging = true), { passive: true });
  rail.addEventListener("touchmove", (e) => dragging && seekTo(e.touches[0].clientX), { passive: true });
  rail.addEventListener("touchend", () => (dragging = false));

  /* ---------- sheets ---------------------------------------- */

  const sheet = (el, on) => {
    el.classList.toggle("open", on);
    el.setAttribute("aria-hidden", on ? "false" : "true");
  };

  // full screen
  const now = $("now");
  const openNow = () => {
    now.classList.add("open");
    now.setAttribute("aria-hidden", "false");
    document.body.classList.add("locked");
    try { tg.BackButton.show(); } catch (e) {}
  };
  const closeNow = () => {
    now.classList.remove("open");
    now.setAttribute("aria-hidden", "true");
    document.body.classList.remove("locked");
    try { tg.BackButton.hide(); } catch (e) {}
  };
  $("miniOpen").addEventListener("click", openNow);
  $("mArt").addEventListener("click", openNow);
  $("nowClose").addEventListener("click", closeNow);
  try { tg.BackButton.onClick(closeNow); } catch (e) {}

  let startY = null;
  now.addEventListener("touchstart", (e) => (startY = e.touches[0].clientY), { passive: true });
  now.addEventListener("touchend", (e) => {
    if (startY !== null && e.changedTouches[0].clientY - startY > 90) closeNow();
    startY = null;
  });

  // queue
  $("queueOpen").addEventListener("click", () => {
    const box = $("queueRows");
    box.innerHTML = "";
    queue.forEach((song, i) => {
      const row = rowFor(song, queue, i);
      if (i < index) row.style.opacity = ".45";
      box.appendChild(row);
    });
    sheet($("queueSheet"), true);
  });
  $("queueClose").addEventListener("click", () => sheet($("queueSheet"), false));
  $("queueSheet").addEventListener("click", (e) => {
    if (e.target === $("queueSheet")) sheet($("queueSheet"), false);
  });

  // per-song actions
  function openActions(song) {
    actionSong = song;
    $("actSong").textContent = song.title;
    $("actFav").textContent = isFav(song.id) ? "Remove from favourites" : "Add to favourites";
    sheet($("actionSheet"), true);
  }
  $("actionSheet").addEventListener("click", (e) => {
    const act = e.target.dataset && e.target.dataset.act;
    if (!act) { if (e.target === $("actionSheet")) sheet($("actionSheet"), false); return; }

    if (act === "next" && actionSong) {
      queue.splice(index + 1, 0, actionSong);
      paint(queue[index]); toast("Playing next");
    }
    if (act === "queue" && actionSong) {
      queue.push(actionSong); toast("Added to queue");
    }
    if (act === "fav" && actionSong) {
      toggleFav(actionSong);
      document.querySelectorAll(".row").forEach(() => {});
      drawHome();
    }
    sheet($("actionSheet"), false);
  });

  // sleep timer
  $("nowMenu").addEventListener("click", () => sheet($("sleepSheet"), true));
  $("sleepSheet").addEventListener("click", (e) => {
    const v = e.target.dataset && e.target.dataset.sleep;
    if (v === undefined) { if (e.target === $("sleepSheet")) sheet($("sleepSheet"), false); return; }

    if (v === "track") { sleepAt = -1; toast("Stopping after this track"); }
    else if (v === "0") { sleepAt = 0; toast("Sleep timer off"); }
    else { sleepAt = Date.now() + parseInt(v, 10) * 60000; toast(`Sleeping in ${v} minutes`); }

    sheet($("sleepSheet"), false);
  });

  /* ---------- lock screen -----------------------------------
     Puts the track on the phone's own media controls, so playback
     survives the screen going off and the notification shows the
     right song.                                                */
  audio.addEventListener("loadedmetadata", () => {
    const song = queue[index];
    if (!song || !("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist || "Aarti Music",
      album: "Aarti Music",
      artwork: [{ src: song.thumb, sizes: "480x360", type: "image/jpeg" }],
    });
    navigator.mediaSession.setActionHandler("play", () => audio.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("nexttrack", next);
    navigator.mediaSession.setActionHandler("previoustrack", () => playAt(index - 1));
    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (d.seekTime != null) audio.currentTime = d.seekTime;
    });
  });

  /* ---------- start ----------------------------------------- */

  paintModes();
  tab("Home");
})();
