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
  const CACHE = 'aarti.lyrics.v2';
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
    for (const r of Array.isArray(results) ? results : []) {
      if (!r || r.instrumental || !(r.syncedLyrics || r.plainLyrics)) continue;
      const titles = [title, ...title.split(/\s+[-–—:]\s+/)];
      const words = Math.max(...titles.map(t => {
        const a = norm(t), b = norm(r.trackName);
        return a === b ? 1 : overlap(a,b) * Math.min(a.split(' ').length,b.split(' ').length) / Math.max(a.split(' ').length,b.split(' ').length);
      }));
      // An artist name in common must never identify a different song.
      if (words < 0.65) continue;
      let score = words * 40 + (r.syncedLyrics ? 15 : 0);
      if (song.duration && r.duration) {
        const off = Math.abs(song.duration - r.duration);
        if (off > 20 && !/slowed|reverb|sped[ -]?up|nightcore/i.test(song.title)) continue;                      // a different recording
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
    const offset = Number(/\[offset:([+-]?\d+)\]/i.exec(String(lrc || ''))?.[1] || 0) / 1000;
    String(lrc || '').split(/\r?\n/).forEach((raw) => {
      const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
      if (!stamps.length) return;
      const text = raw.replace(/\[[^\]]*\]/g, '').replace(/<\d+:\d+(?:\.\d+)?>/g, '').trim();
      stamps.forEach(m => lines.push({ t: Math.max(0, (+m[1]) * 60 + parseFloat(m[2].replace(':', '.')) - offset), text }));
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
  function find(song, fetcher, options = {}) {
    if (!song || !song.id) return Promise.resolve({ none: true });
    const hit = readCache()[song.id];
    if (hit && Date.now() - hit.at < (hit.none ? 3600e3 : 30 * 864e5)) return Promise.resolve(hit);
    if (inflight.has(song.id)) return inflight.get(song.id);
    const get = fetcher || ((url, init) => fetch(url, init));
    async function request(url) {
      const controller = new AbortController(); let timer;
      try {
        return await Promise.race([(async () => {
          const r = await get(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
          if (!r.ok) throw new Error('Lyrics HTTP ' + r.status);
          const data = await r.json();
          if (!Array.isArray(data)) throw new Error('Invalid lyrics response');
          return data;
        })(), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Lyrics request timed out')); }, options.timeout || 6000); })]);
      } finally { clearTimeout(timer); }
    }
    const job = (async () => {
      let failed = 0;
      for (const q of queries(song)) {
        let list;
        try {
          list = await request(API + '/search?q=' + encodeURIComponent(q));
        } catch (_) { failed++; continue; }
        const best = pick(list, song);
        if (best) {
          const lines = best.syncedLyrics ? parse(best.syncedLyrics) : [];
          const mismatch = song.duration && best.duration && Math.abs(song.duration - best.duration) > 20;
          const value = { synced: mismatch ? [] : lines, plain: best.plainLyrics || lines.map(l => l.text).join('\n'),
                          timingUnavailable: !!mismatch, source: best.trackName + ' · ' + best.artistName };
          // A slowed/remixed upload can use the words, but the original timestamps are not trustworthy.
          writeCache(song.id, value);
          return value;
        }
      }
      if (failed) throw new Error('Lyrics service unreachable');
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
