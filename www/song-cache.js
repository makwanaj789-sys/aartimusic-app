/* Songs kept on the phone.

   A song played from the server is a stream: the WebView asks for
   it a piece at a time, and when the phone is busy for a moment
   (another app opened or closed, Wi-Fi handing over to mobile data)
   the next piece can come late and the song stutters or stops.

   So the songs about to be played are downloaded whole, in the
   background, into the app's own storage (the Cache API: it lives in
   the app's data, not the gallery or Downloads), and played from
   there. A song played from the phone has nothing left to wait for.

     AartiSongs.local(id)          -> a playable address, or null
     AartiSongs.keep(id, url)      -> download it in the background
     AartiSongs.forget(id)         -> drop a copy that would not play
     AartiSongs.release()          -> free the address handed out last

   One download at a time, so a song that is playing never shares the
   line with more than one other. The oldest songs go first once the
   copies pass LIMIT_BYTES or LIMIT_SONGS. Anything that goes wrong
   here only means the song streams, as it always did. */
(function () {
  "use strict";
  const NAME = "aarti-songs-v1";
  const INDEX = "aarti.songs.v1";
  const LIMIT_BYTES = 400 * 1024 * 1024;
  const LIMIT_SONGS = 80;
  const SMALLEST = 16 * 1024;              // anything smaller is an error page, not a song
  const supported = typeof caches !== "undefined" && typeof fetch === "function" && !!(window.URL && URL.createObjectURL);

  const key = (id) => "https://songs.aarti.local/" + encodeURIComponent(id);

  // {id: {at: last played or kept, size: bytes}}
  function readIndex() {
    try { const v = JSON.parse(localStorage.getItem(INDEX)); return v && typeof v === "object" ? v : {}; } catch (_) { return {}; }
  }
  function writeIndex(v) { try { localStorage.setItem(INDEX, JSON.stringify(v)); } catch (_) {} }

  let store = null;
  const open = () => store || (store = caches.open(NAME).catch((e) => { store = null; throw e; }));

  let lent = null;                         // the blob: address handed to the player
  function release() {
    if (lent) { try { URL.revokeObjectURL(lent); } catch (_) {} lent = null; }
  }

  async function local(id) {
    if (!supported || !id) return null;
    const idx = readIndex();
    if (!idx[id]) return null;
    try {
      const res = await (await open()).match(key(id));
      if (!res) { delete idx[id]; writeIndex(idx); return null; }
      const blob = await res.blob();
      if (blob.size < SMALLEST) { forget(id); return null; }
      idx[id].at = Date.now(); writeIndex(idx);
      release();
      lent = URL.createObjectURL(blob);
      return lent;
    } catch (_) { return null; }
  }

  async function forget(id) {
    const idx = readIndex();
    delete idx[id]; writeIndex(idx);
    if (!supported) return;
    try { await (await open()).delete(key(id)); } catch (_) {}
  }

  async function trim() {
    const idx = readIndex();
    const ids = Object.keys(idx).sort((a, b) => idx[a].at - idx[b].at);   // oldest first
    let bytes = ids.reduce((n, id) => n + (idx[id].size || 0), 0);
    while (ids.length && (bytes > LIMIT_BYTES || ids.length > LIMIT_SONGS)) {
      const id = ids.shift();
      bytes -= idx[id].size || 0;
      await forget(id);
    }
  }

  // The line of songs to download, and the one being downloaded.
  const line = [];
  let busy = false;
  function keep(id, url) {
    if (!supported || !id || !url || readIndex()[id]) return;
    if (line.some((j) => j.id === id) || (busy && busy.id === id)) return;
    line.push({ id, url });
    pump();
  }

  async function pump() {
    if (busy || !line.length) return;
    const job = busy = line.shift();
    try {
      const res = await fetch(job.url, { cache: "no-store" });
      if (!res.ok) throw new Error("status " + res.status);
      const type = (res.headers.get("content-type") || "").toLowerCase();
      if (type.includes("json") || type.includes("html") || type.includes("text")) throw new Error("not audio: " + type);
      const blob = await res.blob();
      const told = +res.headers.get("content-length");
      if (blob.size < SMALLEST || (told && blob.size !== told)) throw new Error("incomplete");
      await (await open()).put(key(job.id), new Response(blob, {
        headers: { "content-type": type || "audio/mp4", "content-length": String(blob.size) },
      }));
      const idx = readIndex();
      idx[job.id] = { at: Date.now(), size: blob.size };
      writeIndex(idx);
      await trim();
    } catch (_) {
      // Not kept; the song streams when its turn comes.
    } finally {
      busy = false;
      pump();
    }
  }

  // Ask Android not to clear these when space runs low. A refusal is fine.
  try { if (supported && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (_) {}

  window.AartiSongs = {
    supported, local, keep, forget, release,
    has: (id) => !!readIndex()[id],
    size: () => Object.values(readIndex()).reduce((n, v) => n + (v.size || 0), 0),
    clear: async () => { release(); writeIndex({}); line.length = 0; if (supported) { try { await caches.delete(NAME); } catch (_) {} store = null; } },
  };
})();
