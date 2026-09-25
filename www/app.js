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
    /* Removals are remembered, not just applied. Without a record
       that a song was un-favourited, the next sync sees it missing
       locally, present on the server, and helpfully puts it back —
       the classic deleted-thing-returns bug. id -> removal time. */
    gone: {},
    link: null,          // { token, userId, name } once connected
    syncedAt: 0,
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
    b.addEventListener("click", () => { buzzPick(); tab(b.dataset.tab); })
  );

  /* ---------- rows ------------------------------------------ */

  const isFav = (id) => store.favs.some((s) => s.id === id);

  /* ---------- the heart -------------------------------------
     Filling one is the single most satisfying thing in the app,
     so it gets a pop and a burst. Emptying one does not — an
     undo should feel quieter than the thing it undoes.

     Only a real tap pops. paintFavButtons runs on every track
     change too, and popping there would fire the burst every time
     a song that happens to be a favourite comes on. */
  function sparkle(btn) {
    if (REDUCED) return;
    let layer = btn.querySelector(":scope > .spark-layer");
    if (!layer) {
      layer = document.createElement("span");
      layer.className = "spark-layer";
      btn.appendChild(layer);
    }
    for (let i = 0; i < 7; i++) {
      const dot = document.createElement("i");
      dot.className = "spark";
      dot.style.setProperty("--a", (i * (360 / 7) + Math.random() * 18) + "deg");
      dot.style.setProperty("--d", (13 + Math.random() * 9).toFixed(1) + "px");
      dot.style.animationDelay = (Math.random() * 40).toFixed(0) + "ms";
      layer.appendChild(dot);
      dot.addEventListener("animationend", () => dot.remove(), { once: true });
      setTimeout(() => dot.remove(), 1100);
    }
  }

  function markFav(btn, on, pop) {
    if (!btn) return;
    btn.classList.toggle("fav", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    if (!pop || !on) return;
    btn.classList.remove("popping");
    void btn.offsetWidth;                 // restart the animation mid-flight
    btn.classList.add("popping");
    sparkle(btn);
  }

  function heart(song) {
    const b = document.createElement("button");
    b.className = "icon" + (isFav(song.id) ? " fav" : "");
    b.setAttribute("aria-label", "Favourite");
    b.setAttribute("aria-pressed", isFav(song.id) ? "true" : "false");
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.5-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.5-7 9-7 9z"/></svg>';
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFav(song);
      markFav(b, isFav(song.id), true);
    });
    return b;
  }

  function rowFor(song, list, i) {
    const row = document.createElement("div");
    row.className = "row";
    if (queue[index] && queue[index].id === song.id) row.classList.add("on");

    const img = document.createElement("img");
    img.loading = "lazy"; img.src = song.thumb;

    /* Sits over the artwork and only shows on the playing row, so
       the list says which track is live without a second column
       that is empty for every other row. */
    const eq = document.createElement("span");
    eq.className = "eq";
    eq.setAttribute("aria-hidden", "true");
    eq.innerHTML = "<i></i><i></i><i></i><i></i>";

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

    row.append(img, eq, info, heart(song), more);

    const play = () => { queue = list.slice(); playAt(i); };
    img.addEventListener("click", play);
    info.addEventListener("click", play);

    return row;
  }

  /* Rows arrive one after another rather than all at once. The
     delay is capped, because a 30-row library staggered at the
     full rate would still be arriving a second later.

     The class is stripped once the animation ends. animation-fill-
     mode:both keeps the final transform applied, and an applied
     transform outranks the press-scale — leaving it on would mean
     a row could never be pressed again. */
  function stagger(row, i) {
    if (REDUCED) return row;
    row.style.setProperty("--i", Math.min(i, 12));
    row.classList.add("stagger");
    row.addEventListener("animationend", function done(e) {
      if (e.animationName !== "rowIn") return;
      row.classList.remove("stagger");
      row.style.removeProperty("--i");
      row.removeEventListener("animationend", done);
    });
    return row;
  }

  function fill(box, list) {
    box.innerHTML = "";
    list.forEach((song, i) => box.appendChild(stagger(rowFor(song, list, i), i)));
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
      stagger(card, i);
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
    accState();
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
    const now = Date.now();
    if (isFav(song.id)) {
      store.favs = store.favs.filter((s) => s.id !== song.id);
      store.gone[song.id] = now;
      buzz("light");
      toast("Removed");
    } else {
      delete store.gone[song.id];
      store.favs.unshift(Object.assign({}, song, { at: now }));
      buzzDone("success");
      toast("Saved to favourites");
    }
    save();
    pushSoon();
    paintFavButtons();
    if (!pages.Lib.hidden) drawLib();
    if (!pages.Home.hidden) drawHome();
  }

  function addRecent(song) {
    store.recents = [song, ...store.recents.filter((s) => s.id !== song.id)].slice(0, 30);
    save();
  }

  function paintFavButtons(pop) {
    const song = queue[index];
    if (!song) return;
    const on = isFav(song.id);
    markFav($("mFav"), on, pop);
    markFav($("nFav"), on, pop);
  }

  const tapFav = (e) => {
    if (e) e.stopPropagation();
    if (!queue[index]) return;
    toggleFav(queue[index]);
    paintFavButtons(true);
  };
  $("mFav").addEventListener("click", tapFav);
  $("nFav").addEventListener("click", tapFav);

  /* ==========================================================
     ACCOUNT AND SYNC

     Favourites live on the phone and always have. This adds a
     copy on the server so they survive a new phone, and so the
     bot and the app agree about what is saved. Nothing here is
     required: every endpoint below may be missing, and the app
     carries on exactly as it did before.

     Identity comes from Telegram, which already knows who this
     is — no password, no email, nothing new to remember. Inside
     Telegram the signed initData is enough on its own. The
     standalone APK has no Telegram around it, so it opens the bot
     with a one-time nonce and waits for the bot to claim it.
     ========================================================== */

  let syncOff = false;          // set once the server says it cannot
  let pushTimer = 0;

  const linked = () => !!(store.link && store.link.token) || !!INIT;

  function authHeaders() {
    const h = headers();
    if (store.link && store.link.token) h["Authorization"] = "Bearer " + store.link.token;
    return h;
  }

  /* Two different kinds of "no", and telling them apart is the
     difference between a message that helps and one that does not.

       unreachable   nothing answered — the phone is offline, or the
                     address the app was handed has moved. Temporary,
                     so sync stays on and the next change tries again.

       syncOff       something answered, and it has never heard of
                     these routes. Permanent for this session; asking
                     again on every favourite would be pointless.   */
  let unreachable = false;
  let lastStatus = 0;       // what the server actually said, for the message

  async function sync(path, opts) {
    if (syncOff) return null;
    await ready;

    let res;
    try {
      res = await fetch(SERVER + path, Object.assign({
        headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
      }, opts || {}));
      unreachable = false;
      lastStatus = res.status;
    } catch (e) {
      unreachable = true;
      lastStatus = 0;
      return null;
    }

    /* A server that has not learned these routes yet answers 404,
       and one built before accounts existed may answer 501. Either
       way, stop asking for the rest of the session rather than
       retrying on every favourite. */
    if (res.status === 404 || res.status === 501) { syncOff = true; accState(); return null; }
    if (res.status === 401) { unlink(true); return null; }
    if (!res.ok) return null;
    try { return await res.json(); } catch (e) { lastStatus = -1; return null; }
  }

  /* What went wrong, in words that say what to do about it — and,
     when the server answered with something unexpected, what it
     actually said. A number in the message is not pretty, but it is
     the difference between "it didn't work" and knowing whether the
     bot is down, rate limiting, or erroring. */
  function whyNot() {
    if (unreachable) return "Can't reach the server — check your connection";
    if (syncOff)     return "This server doesn't do accounts yet";
    if (lastStatus === 429) return "Too many tries — wait a minute";
    if (lastStatus === -1)  return "The server sent something unreadable";
    if (lastStatus >= 500)  return "The server had a problem (" + lastStatus + ") — try again";
    if (lastStatus > 0)     return "The server said " + lastStatus + " — try again";
    return "Couldn't start — try again";
  }

  /* ---------- merging ---------------------------------------
     Last write wins, per song. Each side brings its favourites
     with the time they were added and its tombstones with the
     time they were removed; for any one id the later of the two
     decides whether it is saved. That way a removal on one phone
     survives a sync with a phone that still has the song, and
     neither side has to be treated as the truth. */
  function mergeFavs(local, remote) {
    const at = {}, gone = {}, song = {};

    const take = (side) => {
      (side.favs || []).forEach((s) => {
        if (!s || !s.id) return;
        const t = s.at || 1;
        if (!at[s.id] || t > at[s.id]) { at[s.id] = t; song[s.id] = s; }
      });
      Object.entries(side.gone || {}).forEach(([id, t]) => {
        if (!gone[id] || t > gone[id]) gone[id] = t;
      });
    };
    take(local); take(remote);

    const favs = Object.keys(at)
      .filter((id) => !gone[id] || at[id] > gone[id])
      .sort((a, b) => at[b] - at[a])
      .map((id) => Object.assign({}, song[id], { at: at[id] }));

    // Tombstones for songs that came back are dead weight.
    Object.keys(gone).forEach((id) => { if (at[id] > gone[id]) delete gone[id]; });
    return { favs, gone };
  }

  async function pull() {
    if (!linked()) return;
    const remote = await sync("/api/favs");
    if (!remote) return;
    const merged = mergeFavs(store, remote);
    const changed = merged.favs.length !== store.favs.length ||
      merged.favs.some((s, i) => !store.favs[i] || store.favs[i].id !== s.id);
    store.favs = merged.favs;
    store.gone = merged.gone;
    save();
    if (changed) {
      paintFavButtons();
      if (!pages.Lib.hidden) drawLib();
      if (!pages.Home.hidden) drawHome();
    }
    // Hand the merge straight back, so the server ends up agreeing.
    await push();
  }

  async function push() {
    if (!linked()) return;
    accState("syncing");
    const r = await sync("/api/favs", {
      method: "POST",
      body: JSON.stringify({ favs: store.favs, gone: store.gone }),
    });
    if (r) { store.syncedAt = Date.now(); save(); }
    accState();
  }

  /* Favouriting a whole album one tap at a time should not be a
     request each. Collect for a moment, then send once. */
  function pushSoon() {
    if (!linked() || syncOff) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => push().catch(() => {}), 1200);
  }

  /* ---------- connecting ------------------------------------ */

  let pollTimer = 0, pollStop = 0;

  function unlink(silent) {
    store.link = null; save();
    clearTimeout(pollTimer);
    accState();
    if (!silent) toast("Disconnected");
  }

  /* ---------- getting to Telegram --------------------------
     Inside Telegram the bridge opens the chat properly. The
     standalone APK has no bridge: the tg:// scheme reaches the
     installed app directly through an Android intent, and if
     nothing answers it the https link — which the system gives to
     a browser, and the browser gives back to Telegram — is the
     second try. The two are attempted in that order rather than
     together, because firing both opens two things.

     If neither lands the sheet still offers the link to copy, so
     a phone without Telegram installed is never a dead end. */

  let lastLink = "";

  function openTelegram(url, bot, start) {
    try { tg.openTelegramLink(url); return; } catch (e) {}

    let gone = false;
    const leaving = () => { gone = true; };
    document.addEventListener("visibilitychange", leaving, { once: true });
    window.addEventListener("pagehide", leaving, { once: true });

    try {
      window.location.href = "tg://resolve?domain=" + encodeURIComponent(bot) +
        "&start=" + encodeURIComponent(start);
    } catch (e) {}

    setTimeout(() => {
      document.removeEventListener("visibilitychange", leaving);
      if (gone || document.hidden) return;   // Telegram took it
      try { window.open(url, "_blank"); }
      catch (e) { try { window.location.href = url; } catch (e2) {} }
    }, 800);
  }

  async function copyLink() {
    if (!lastLink) return;
    try {
      await navigator.clipboard.writeText(lastLink);
      buzzDone("success");
      toast("Link copied — paste it in any browser");
      return;
    } catch (e) {}
    /* No clipboard permission in this WebView. A selected, readable
       link the person can long-press is still better than nothing. */
    $("linkCopy").textContent = lastLink;
    try {
      const rng = document.createRange();
      rng.selectNodeContents($("linkCopy"));
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(rng);
    } catch (e) {}
    toast("Long-press the link to copy it");
  }

  async function startLink() {
    const r = await sync("/api/link/start", { method: "POST" });
    if (!r || !r.nonce) {
      toast(whyNot());
      accState();
      sheet($("linkSheet"), false);
      return;
    }
    const named = /t\.me\/([A-Za-z0-9_]+)/.exec(r.url || "");
    const bot = r.bot || (named && named[1]) || "AartiMusic_bot";
    const start = "link_" + r.nonce;
    const url = r.url || ("https://t.me/" + bot + "?start=" + encodeURIComponent(start));
    $("linkWait").hidden = false;
    $("linkGo").textContent = "Open Telegram again";
    $("linkCopy").textContent = "Waiting for Telegram. Tap Start in the chat, then come back.";

    openTelegram(url, bot, start);
    lastLink = url;
    $("linkAlt").hidden = false;

    // Poll rather than hold a socket open: the round trip is a
    // person switching apps, and this has to survive the app being
    // backgrounded and brought back.
    clearTimeout(pollTimer);
    pollStop = Date.now() + 120000;
    const beat = async () => {
      if (Date.now() > pollStop) {
        $("linkWait").hidden = true;
        $("linkCopy").textContent = "That took too long. Try again when you're ready.";
        return;
      }
      const p = await sync("/api/link/poll?nonce=" + encodeURIComponent(r.nonce));
      if (p && p.token) {
        store.link = { token: p.token, userId: p.userId, name: p.name || "" };
        save();
        buzzDone("success");
        sheet($("linkSheet"), false);
        $("linkWait").hidden = true;
        accState();
        toast("Connected");
        pull().catch(() => {});
        return;
      }
      pollTimer = setTimeout(beat, 1800);
    };
    pollTimer = setTimeout(beat, 1800);
  }

  /* ---------- the strip ------------------------------------- */

  function accState(mode) {
    const box = $("account");
    if (!box) return;
    box.classList.toggle("syncing", mode === "syncing");

    if (INIT && !store.link) {
      // Running inside Telegram: already identified, nothing to do.
      box.classList.add("linked");
      $("accState").textContent = "Synced through Telegram";
      $("accSub").textContent = "Your favourites match the bot";
      $("accBtn").hidden = true;
      return;
    }
    if (syncOff && !store.link) {
      // Answered, and it has no idea what an account is. Saying so
      // beats a Connect button that can only ever fail.
      box.classList.remove("linked");
      $("accState").textContent = "Saved on this phone";
      $("accSub").textContent = "This server doesn't do accounts yet — favourites stay here";
      $("accBtn").hidden = true;
      return;
    }

    $("accBtn").hidden = false;
    if (store.link) {
      box.classList.add("linked");
      $("accState").textContent = store.link.name
        ? "Connected as " + store.link.name : "Connected to Telegram";
      $("accSub").textContent = store.syncedAt
        ? "Last synced " + new Date(store.syncedAt).toLocaleTimeString("en-IN",
            { hour: "2-digit", minute: "2-digit" })
        : "Favourites will follow you to any phone";
      $("accBtn").textContent = "Disconnect";
    } else {
      box.classList.remove("linked");
      $("accState").textContent = "Saved on this phone";
      $("accSub").textContent = "Connect Telegram to keep these if you change phones";
      $("accBtn").textContent = "Connect";
    }
  }

  $("accBtn").addEventListener("click", () => {
    buzz();
    if (store.link) { unlink(); return; }
    $("linkWait").hidden = true;
    $("linkAlt").hidden = true;
    $("linkGo").textContent = "Open Telegram";
    $("linkCopy").textContent =
      "Your favourites will follow you to any phone, and match what the bot already knows.";
    sheet($("linkSheet"), true);
  });
  $("linkGo").addEventListener("click", () => { buzz(); startLink().catch(() => {}); });
  $("linkAlt").addEventListener("click", () => { buzz(); copyLink(); });
  $("linkCancel").addEventListener("click", () => {
    clearTimeout(pollTimer);
    sheet($("linkSheet"), false);
  });
  $("linkSheet").addEventListener("click", (e) => {
    if (e.target === $("linkSheet")) { clearTimeout(pollTimer); sheet($("linkSheet"), false); }
  });

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

    setProgress(0);
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

  audio.addEventListener("playing", () => {
    waiting(false); icons(true);
    document.body.classList.add("playing");
  });
  audio.addEventListener("pause", () => {
    icons(false);
    document.body.classList.remove("playing");
  });
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

  function setProgress(p) {
    p = p < 0 ? 0 : p > 1 ? 1 : p;
    const v = p.toFixed(5);
    $("miniFill").style.setProperty("--p", v);
    $("seekFill").style.setProperty("--p", v);
    $("seekRail").style.setProperty("--p", v);
  }

  /* The morph is a CSS `d` transition. Where `d` is not an
     animatable property the stylesheet's rules are simply
     ignored, so the shape would stay stuck as a triangle — the
     attribute gets written directly in that case, which lands on
     the right shape without the travel. */
  const CAN_MORPH = window.CSS && CSS.supports && CSS.supports("d", 'path("M0 0Z")');
  const SHAPE = {
    paused:  { l: "M7 4.2L13.2 8L13.2 16L7 19.8Z", r: "M13.2 8L19.6 11.8L19.6 12.2L13.2 16Z" },
    playing: { l: "M6 4L10 4L10 20L6 20Z",         r: "M14 4L18 4L18 20L14 20Z" },
  };

  function icons(playing) {
    const state = playing ? "playing" : "paused";
    document.querySelectorAll(".play").forEach((btn) => {
      btn.dataset.state = state;
      btn.setAttribute("aria-label", playing ? "Pause" : "Play");
      if (CAN_MORPH) return;
      const l = btn.querySelector(".mp.l"), r = btn.querySelector(".mp.r");
      if (l) l.setAttribute("d", SHAPE[state].l);
      if (r) r.setAttribute("d", SHAPE[state].r);
    });
  }

  audio.addEventListener("timeupdate", () => {
    told.position();
    const d = audio.duration;
    if (!d || !isFinite(d)) return;
    // --p is a plain 0..1 number the stylesheet turns into a
    // transform; nothing here touches width or left.
    setProgress(audio.currentTime / d);
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
    const p = Math.min(1, Math.max(0, (x - box.left) / box.width));
    setProgress(p);                      // move with the finger
    audio.currentTime = p * d;
  };
  rail.addEventListener("click", (e) => seekTo(e.clientX));
  let dragging = false;
  rail.addEventListener("touchstart", () => {
    dragging = true;
    document.body.classList.add("seeking");
  }, { passive: true });
  rail.addEventListener("touchmove", (e) => dragging && seekTo(e.touches[0].clientX), { passive: true });
  rail.addEventListener("touchend", () => {
    dragging = false;
    document.body.classList.remove("seeking");
  });
  rail.addEventListener("touchcancel", () => {
    dragging = false;
    document.body.classList.remove("seeking");
  });

  /* ---------- what Back means -------------------------------
     Telegram draws its own back button, wired below. In the Android
     app Back is the system gesture, and by default it leaves the
     app — mid-song, from the full screen, which is not what anyone
     means by pressing it.

     So everything that opens over the screen adds a history entry.
     Back closes that first and only leaves the app once nothing is
     open. The browser gets the same behaviour for free.

     The stack is kept in step by hand rather than by routing every
     close through history.back(), because closing by tap, by drag
     and by Back all have to keep working, and each has to know
     whether the entry it is unwinding is already gone.          */

  const overlays = [];    // { el, close }, innermost last
  let unwinding = false;  // inside a close that Back itself started
  let ourPops = 0;        // popstate events we asked for and must swallow

  function opened(el, close) {
    overlays.push({ el, close });
    try { history.pushState({ aarti: overlays.length }, ""); } catch (e) {}
  }

  function closed(el) {
    const i = overlays.map((o) => o.el).lastIndexOf(el);
    if (i < 0) return;            // never opened through here, or already gone
    overlays.splice(i, 1);
    if (unwinding) return;        // Back has already spent the entry
    ourPops++;
    try { history.back(); } catch (e) { ourPops--; }
  }

  window.addEventListener("popstate", () => {
    if (ourPops > 0) { ourPops--; return; }   // our own tidying up
    const top = overlays.pop();
    if (!top) return;                         // nothing of ours left: let it go
    unwinding = true;
    try { top.close(); } finally { unwinding = false; }
  });

  /* ---------- sheets ---------------------------------------- */

  const sheet = (el, on) => {
    // Opening what is open, or closing what is shut, would push or
    // spend a history entry for nothing.
    if (!!on === el.classList.contains("open")) return;

    el.classList.toggle("open", on);
    el.setAttribute("aria-hidden", on ? "false" : "true");
    if (on) {
      // A sheet dragged halfway and released leaves --veil part-faded;
      // without this the next open would start dim.
      el.style.setProperty("--veil", "1");
      opened(el, () => sheet(el, false));
    } else {
      closed(el);
    }
  };

  // full screen
  const now = $("now");
  const openNow = () => {
    if (now.classList.contains("open")) return;
    now.classList.add("open");
    now.setAttribute("aria-hidden", "false");
    document.body.classList.add("locked");
    try { tg.BackButton.show(); } catch (e) {}
    opened(now, closeNow);
  };
  const closeNow = () => {
    if (!now.classList.contains("open")) return;
    now.classList.remove("open");
    now.setAttribute("aria-hidden", "true");
    document.body.classList.remove("locked");
    try { tg.BackButton.hide(); } catch (e) {}
    closed(now);
  };
  $("miniOpen").addEventListener("click", openNow);
  $("mArt").addEventListener("click", openNow);
  $("nowClose").addEventListener("click", closeNow);
  try { tg.BackButton.onClick(closeNow); } catch (e) {}

  /* ---------- dragging the full screen down -----------------
     It used to compare two touch points and close if the second
     was 90px lower — the sheet never moved under the finger, so a
     drag felt like a gesture being graded rather than a thing
     being held.

     Now it follows. Release decides by distance OR by speed, so a
     short flick closes it and a slow pull most of the way down
     does too, which is what the hand expects of both.

     Drags that begin on a control are left alone: the seek rail
     has its own touch handling, and a scrollable list needs its
     own vertical movement. */
  const DRAG_SKIP = "button,input,.seek-rail,.rows,.rail";

  function draggable(el, onClose, opts) {
    const o = opts || {};
    const surface = o.surface || el;
    let id = null, y0 = 0, t0 = 0, dy = 0, live = false;

    const setY = (v) => { surface.style.transform = "translateY(" + v.toFixed(1) + "px)"; };
    const clear = () => {
      el.classList.remove("dragging");
      surface.style.transform = "";
    };

    // -webkit-user-drag is not honoured everywhere; refusing the
    // dragstart outright is what actually keeps the gesture alive.
    el.addEventListener("dragstart", (e) => e.preventDefault());

    el.addEventListener("pointerdown", (e) => {
      if (!el.classList.contains("open")) return;
      if (e.target.closest && e.target.closest(DRAG_SKIP)) return;
      id = e.pointerId; y0 = e.clientY; t0 = e.timeStamp; dy = 0; live = false;
    }, { passive: true });

    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      dy = e.clientY - y0;
      // Wait for a clear vertical intent before taking the gesture,
      // so a tap that wobbles a pixel is still a tap.
      if (!live) {
        if (dy < 6) return;
        live = true;
        el.classList.add("dragging");
      }
      // Upward is resisted rather than blocked — the surface is
      // already as far up as it goes.
      const shown = dy < 0 ? dy / 4 : dy;
      setY(shown);
      if (o.onDrag) o.onDrag(shown);
    }, { passive: true });

    const finish = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      if (!live) return;
      const dt = Math.max(1, e.timeStamp - t0);
      const speed = dy / dt;                      // px per ms
      const far = dy > (o.threshold || 110);
      const flung = speed > 0.55 && dy > 24;
      el.classList.remove("dragging");
      surface.style.transform = "";
      if (o.onDrag) o.onDrag(0);
      live = false;
      if (far || flung) onClose();
    };
    el.addEventListener("pointerup", finish, { passive: true });
    el.addEventListener("pointercancel", (e) => {
      if (e.pointerId !== id) return;
      id = null; live = false; clear();
      if (o.onDrag) o.onDrag(0);
    }, { passive: true });
  }

  draggable(now, closeNow, { threshold: 120 });

  /* The sheets drag on their own panel rather than the whole
     overlay, and the backdrop thins as the panel goes down — the
     screen behind it coming back is what tells you the gesture is
     working before you have committed to it. A shorter threshold
     than the full screen, because a sheet is shorter. */
  [["queueSheet", 90], ["actionSheet", 80], ["sleepSheet", 80]].forEach(([id, threshold]) => {
    const el = $(id);
    const panel = el.querySelector(".sheet-in");
    draggable(el, () => sheet(el, false), {
      surface: panel,
      threshold: threshold,
      onDrag: (dy) => {
        const fade = dy > 0 ? Math.max(0, 1 - dy / (threshold * 2.4)) : 1;
        el.style.setProperty("--veil", fade.toFixed(3));
      },
    });
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
      paint(queue[index]); buzzDone("success"); toast("Playing next");
    }
    if (act === "queue" && actionSong) {
      queue.push(actionSong); buzzDone("success"); toast("Added to queue");
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

  /* ---------- what the phone shows while it plays ------------
     The notification, the lock screen, and on phones that have one
     the capsule in the status bar, are all the same thing: a media
     session the system knows about.

     In a browser or inside Telegram the Media Session API provides
     it. In the Android app it does not exist — the WebView has no
     implementation, so an <audio> tag playing in here is invisible
     to the system: no notification, nothing on the lock screen, and
     Android is free to stop the audio the moment the app goes to
     the background. The native plugin supplies both halves, the
     session and the foreground service that keeps playback alive.

     Same five actions either way. The rest of the file calls `told`
     and does not have to know which one answered.               */

  /* Capacitor does not hand the page its plugins. Capacitor.Plugins
     is filled in by registerPlugin(), which is normally called by the
     plugin's own JavaScript — and importing that needs a bundler,
     which this app deliberately does not have. So reading
     Capacitor.Plugins.MediaSession finds nothing, for ever, in
     silence. The global registerPlugin is the same function and asks
     the native side for the method signatures, which is what makes a
     callback method like setActionHandler work at all.

     isPluginAvailable checks the headers the native bridge injects,
     so this is a real answer about this build rather than a guess. */
  function nativePlugin(name) {
    try {
      const c = window.Capacitor;
      if (!c || !c.isNativePlatform || !c.isNativePlatform()) return null;
      if (c.Plugins && c.Plugins[name]) return c.Plugins[name];
      if (!c.isPluginAvailable || !c.isPluginAvailable(name)) return null;
      return c.registerPlugin ? c.registerPlugin(name) : null;
    } catch (e) { return null; }
  }

  const nativeMS = nativePlugin("MediaSession");
  const webMS = "mediaSession" in navigator ? navigator.mediaSession : null;

  const told = {
    /* Native side needs the handlers before it will draw any
       controls, and they never change, so they are set once. */
    wired: false,

    actions() {
      if (this.wired) return;
      this.wired = true;

      const acts = {
        play: () => audio.play().catch(() => {}),
        pause: () => audio.pause(),
        nexttrack: () => next(),
        previoustrack: () => playAt(index - 1),
        stop: () => { audio.pause(); audio.currentTime = 0; },
        seekto: (d) => { if (d && d.seekTime != null) audio.currentTime = d.seekTime; },
      };

      for (const name in acts) {
        if (nativeMS) {
          try { nativeMS.setActionHandler({ action: name }, acts[name]); } catch (e) {}
        } else if (webMS) {
          // A browser that has never heard of an action throws rather
          // than ignoring it, so each one stands alone.
          try { webMS.setActionHandler(name, acts[name]); } catch (e) {}
        }
      }
    },

    metadata(song) {
      if (!song) return;
      const m = {
        title: song.title || "Aarti Music",
        artist: song.artist || "Aarti Music",
        album: "Aarti Music",
        artwork: [{ src: song.thumb, sizes: "480x360", type: "image/jpeg" }],
      };
      if (nativeMS) { try { nativeMS.setMetadata(m); } catch (e) {} return; }
      if (webMS && window.MediaMetadata) {
        try { webMS.metadata = new MediaMetadata(m); } catch (e) {}
      }
    },

    /* The notification only appears once the session says it is
       playing, so this is not decoration — it is what puts it on
       screen and what takes it away again. */
    state(playbackState) {
      if (nativeMS) { try { nativeMS.setPlaybackState({ playbackState }); } catch (e) {} return; }
      if (webMS) { try { webMS.playbackState = playbackState; } catch (e) {} }
    },

    /* Moves the seek bar in the notification. timeupdate fires four
       times a second and this crosses the bridge, so it is sent at
       most once a second and whenever the position jumps. */
    sent: 0,
    position(force) {
      const d = audio.duration;
      if (!isFinite(d) || d <= 0) return;
      const now = Date.now();
      if (!force && now - this.sent < 1000) return;
      this.sent = now;

      const p = { duration: d, position: Math.min(audio.currentTime, d), playbackRate: audio.playbackRate || 1 };
      if (nativeMS) { try { nativeMS.setPositionState(p); } catch (e) {} return; }
      if (webMS && webMS.setPositionState) { try { webMS.setPositionState(p); } catch (e) {} }
    },
  };

  /* Android 13 hides every notification, a foreground service's
     included, until notifications are allowed. Asked on the first
     song rather than at startup, so the prompt turns up when it
     means something — and never on a platform that has no such
     permission to ask about. Declining costs nothing but the
     notification; the music plays either way. */
  let askedToNotify = false;
  async function mayNotify() {
    if (askedToNotify || !nativeMS) return;
    askedToNotify = true;
    try {
      const ln = nativePlugin("LocalNotifications");
      if (!ln) return;
      const now = await ln.checkPermissions();
      if (now && /^prompt/.test(now.display || "")) await ln.requestPermissions();
    } catch (e) {}
  }

  audio.addEventListener("loadedmetadata", () => {
    told.actions();
    told.metadata(queue[index]);
    told.position(true);
  });
  audio.addEventListener("playing", () => {
    told.state("playing"); told.position(true); mayNotify();
  });
  audio.addEventListener("pause", () => { told.state("paused"); told.position(true); });
  audio.addEventListener("seeked", () => told.position(true));
  audio.addEventListener("ratechange", () => told.position(true));

  /* ---------- start ----------------------------------------- */

  paintModes();
  accState();
  // One attempt at startup. It fails quietly on a server that has
  // never heard of these routes, which is every server today.
  pull().catch(() => {});
  tab("Home");

  /* ---------- putting the lamp away -------------------------
     The first screen is drawn by the time this runs, so the only
     thing worth waiting for is the frame that shows it. A floor of
     roughly a second keeps the lamp from blinking past on a fast
     phone; the timeout is a promise that nothing here can ever
     leave someone staring at it.                                */
  (function dismissBoot() {
    const boot = $("boot");
    if (!boot) return;

    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      boot.classList.add("gone");                 // taps pass through now
      setTimeout(() => { boot.hidden = true; }, 500);
    };

    const LEAST = REDUCED ? 0 : 900;
    const start = performance.now();
    const settled = () => setTimeout(go, Math.max(0, LEAST - (performance.now() - start)));

    // Two frames: one to lay the home screen out, one to paint it.
    requestAnimationFrame(() => requestAnimationFrame(settled));
    setTimeout(go, 4000);

    // Someone who has already decided what they want should not have
    // to watch the lamp finish. A touch anywhere skips it.
    boot.addEventListener("pointerdown", go);
  })();
})();
