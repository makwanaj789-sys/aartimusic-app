/* ============================================================
   LYRICS
   Found on LRCLIB (lrclib.net) — free, no key, and most entries
   carry time-stamped lines. Nothing here touches the page: it
   turns a song into lyrics, and the app decides how to show them.

   The songs come from YouTube, so a title is rarely just a title:
   "Jeena Jeena (Official Lyrical Video) | Badlapur | Varun Dhawan".
   The title is cleaned, tried a few ways, and the result whose
   length matches the song's is the one kept.
   ============================================================ */
(function (root) {
  'use strict';
  const API = 'https://lrclib.net/api';
  const CACHE = 'aarti.lyrics.v1';
  const NOISE = /\b(official|lyrical|lyrics?|full|audio|video|song|hd|4k|8d|slowed|reverb|lofi|lo-fi|remix|mix|cover|uncut|status|ringtone|version|reprise|unplugged|visualiser|visualizer|music|new|latest|hit|hits|bass boosted|jukebox)\b/gi;

  const strip = (s) => String(s || '')
    .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ')
    .replace(/[🌙✨💕❤️🔥🎵🎶]/gu, ' ')
    .replace(/\b(feat|ft)\.?\s.*$/i, ' ')
    .replace(NOISE, ' ')
    .replace(/["“”'’`|#@*_~]+/g, ' ')
    .replace(/(^|\s)[^\p{L}\p{N}\s]+(?=\s|$)/gu, ' ')   // a lone "+" or "&" left behind
    .replace(/\s+/g, ' ').trim();

  const norm = (s) => strip(s).toLocaleLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();

  /* The searches worth trying for one song, best guess first. A
     " - " splits artist from title, but either side can be which,
     so both are tried. The channel joins the first query only when
     it reads like a person rather than a label. */
  function queries(song) {
    const first = String(song.title || '').split('|')[0];
    const halves = first.split(/\s+[-–—:]\s+/).map(strip).filter(h => h.length > 1);
    const whole = strip(first);
    const channel = strip(String(song.artist || '').replace(/\s*-\s*topic$/i, ''));
    const label = /\b(music|records|films|studios?|entertainment|series|official|tube|vibes|india|world|channel|tv)\b/i.test(channel);
    const out = [];
    const add = (q) => { q = q.trim(); if (q.length > 1 && !out.some(x => x.toLocaleLowerCase() === q.toLocaleLowerCase())) out.push(q); };
    if (channel && !label) add(whole + ' ' + channel);
    add(whole);
    halves.forEach(add);
    return out.slice(0, 4);
  }

  // How alike two titles are, by shared words: 0 to 1.
  function overlap(a, b) {
    const A = new Set(norm(a).split(' ').filter(Boolean)), B = new Set(norm(b).split(' ').filter(Boolean));
    if (!A.size || !B.size) return 0;
    let shared = 0; A.forEach(w => { if (B.has(w)) shared++; });
    return shared / Math.min(A.size, B.size);
  }

  /* Which result is this song. The length is the strongest clue —
     YouTube and LRCLIB agree to within a few seconds for the same
     recording — then the words, then whether the lines are timed. */
  function pick(results, song) {
    const title = String(song.title || '').split('|')[0];
    let best = null, bestScore = -Infinity;
    for (const r of results || []) {
      if (!r || r.instrumental || !(r.syncedLyrics || r.plainLyrics)) continue;
      const words = Math.max(overlap(r.trackName, title), overlap(r.trackName + ' ' + r.artistName, title + ' ' + (song.artist || '')));
      if (words < 0.5) continue;
      let score = words * 40 + (r.syncedLyrics ? 15 : 0);
      if (song.duration && r.duration) {
        const off = Math.abs(song.duration - r.duration);
        if (off > 20) continue;                      // a different recording
        score += Math.max(0, 30 - off * 2);
      }
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return best;
  }

  /* "[01:02.34] line" → { t: 62.34, text: "line" }. One line can carry
     several stamps; metadata tags ([ar:…]) and empty lines are kept
     out, except that a gap is kept as a blank so the screen breathes
     where the song does. */
  function parse(lrc) {
    const lines = [];
    String(lrc || '').split(/\r?\n/).forEach((raw) => {
      const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
      if (!stamps.length) return;
      const text = raw.replace(/\[[^\]]*\]/g, '').trim();
      stamps.forEach(m => lines.push({ t: (+m[1]) * 60 + parseFloat(m[2].replace(':', '.')), text }));
    });
    lines.sort((a, b) => a.t - b.t);
    // Collapse runs of blanks into one.
    return lines.filter((l, i) => l.text || (i > 0 && lines[i - 1].text));
  }

  // The line playing at time t: the last one that has started.
  function lineAt(lines, t) {
    let lo = 0, hi = lines.length - 1, at = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].t <= t + 0.15) { at = mid; lo = mid + 1; } else hi = mid - 1; }
    return at;
  }

  function readCache() { try { return JSON.parse(localStorage.getItem(CACHE)) || {}; } catch (_) { return {}; } }
  function writeCache(id, value) {
    try {
      const c = readCache(); c[id] = { ...value, at: Date.now() };
      const keys = Object.keys(c);
      if (keys.length > 150) keys.sort((a, b) => c[a].at - c[b].at).slice(0, keys.length - 150).forEach(k => delete c[k]);
      localStorage.setItem(CACHE, JSON.stringify(c));
    } catch (_) {}
  }

  const inflight = new Map();
  /* Resolves to { synced: [{t,text}], plain: "…", source } or
     { none: true }. A "none" is remembered for a day, so a song
     without lyrics is not searched for on every play; a network
     failure is not remembered at all. */
  function find(song, fetcher) {
    if (!song || !song.id) return Promise.resolve({ none: true });
    const hit = readCache()[song.id];
    if (hit && (!hit.none || Date.now() - hit.at < 864e5)) return Promise.resolve(hit);
    if (inflight.has(song.id)) return inflight.get(song.id);
    const get = fetcher || ((url) => fetch(url, { headers: { Accept: 'application/json' } }));
    const job = (async () => {
      let failed = 0;
      for (const q of queries(song)) {
        let list;
        try {
          const r = await get(API + '/search?q=' + encodeURIComponent(q));
          if (!r.ok) { failed++; continue; }
          list = await r.json();
        } catch (_) { failed++; continue; }
        const best = pick(list, song);
        if (best) {
          const value = { synced: best.syncedLyrics ? parse(best.syncedLyrics) : [], plain: best.plainLyrics || '',
                          source: best.trackName + ' · ' + best.artistName };
          writeCache(song.id, value);
          return value;
        }
      }
      if (failed && failed === queries(song).length) throw new Error('Lyrics service unreachable');
      writeCache(song.id, { none: true });
      return { none: true };
    })().finally(() => inflight.delete(song.id));
    inflight.set(song.id, job);
    return job;
  }

  const api = { queries, pick, parse, lineAt, find, strip };
  root.AartiLyrics = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
