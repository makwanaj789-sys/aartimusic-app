/* ============================================================
   CANVAS
   A slow, living picture behind the player, painted from the
   cover's own colours, so the screen moves with the song without
   showing the cover itself. Each song gets one of three moods
   (aurora, waves, bokeh), chosen from its id so a song always
   looks the same.

   Cheap on purpose: drawn at a quarter of the screen's size (the
   shapes are soft, so the browser's upscale is invisible), at
   most 30 frames a second, and not at all while the player is
   closed, the app is in the background, or motion is reduced.
   ============================================================ */
(function (root) {
  'use strict';

  const SCALE = 0.25, FPS = 30;

  // Up to three colours that carry the picture, most present first.
  function paletteOf(data) {
    const bins = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
      if (hi < 28) continue;
      const sat = hi ? (hi - lo) / hi : 0;
      let h = 0;
      if (hi !== lo) {
        h = hi === r ? (g - b) / (hi - lo) : hi === g ? 2 + (b - r) / (hi - lo) : 4 + (r - g) / (hi - lo);
        h = (h * 60 + 360) % 360;
      }
      const key = sat < 0.15 ? 'grey' : Math.floor(h / 30);
      const w = (sat < 0.15 ? 0.15 : sat) * (hi / 255);
      const bin = bins.get(key) || { r: 0, g: 0, b: 0, w: 0 };
      bin.r += r * w; bin.g += g * w; bin.b += b * w; bin.w += w;
      bins.set(key, bin);
    }
    return [...bins.values()].sort((a, b) => b.w - a.w).slice(0, 3)
      .map(c => [c.r / c.w, c.g / c.w, c.b / c.w].map(Math.round));
  }

  const cache = new Map();
  function paletteFrom(src) {
    if (!src) return Promise.resolve(null);
    if (cache.has(src)) return Promise.resolve(cache.get(src));
    return new Promise((done) => {
      const finish = (v) => { cache.set(src, v); done(v); };
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onerror = () => finish(null);
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = c.height = 24;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0, 24, 24);
          const p = paletteOf(g.getImageData(0, 0, 24, 24).data);
          finish(p.length ? p : null);
        } catch (_) { finish(null); }
      };
      img.src = src;
    });
  }

  /* Covers are often dull (brown, grey, letterboxed in black), and
     their average colour looks like an empty screen. Push each colour
     away from grey and out of the dark before painting with it. */
  function vivid(c) {
    const grey = (c[0] + c[1] + c[2]) / 3;
    let v = c.map(x => grey + (x - grey) * 1.6);
    const hi = Math.max(...v);
    if (hi < 150) v = v.map(x => x * 150 / Math.max(1, hi));
    return v.map(x => Math.max(0, Math.min(255, Math.round(x))));
  }

  function hash(s) { let h = 2166136261; for (const ch of String(s || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  function parseColour(s) {
    s = String(s || '').trim();
    const m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) return [0, 2, 4].map(i => parseInt(m[1].substr(i, 2), 16));
    const n = s.match(/\d+(\.\d+)?/g);
    return n && n.length >= 3 ? n.slice(0, 3).map(Number) : [10, 9, 8];
  }

  function create(canvas, opts = {}) {
    const g = canvas.getContext('2d');
    const reduced = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    let colours = [[120, 90, 200], [200, 90, 120], [60, 140, 200]], from = colours, blend = 1;
    let mood = 0, seed = 0, visible = false, playing = false, speed = 0.2, t = 0;
    let frame = 0, last = 0, drawn = 0, w = 0, h = 0, bg = [10, 9, 8], light = false;

    function size() {
      const r = canvas.getBoundingClientRect();
      const W = Math.max(8, Math.round(r.width * SCALE)), H = Math.max(8, Math.round(r.height * SCALE));
      if (W !== w || H !== h) { canvas.width = w = W; canvas.height = h = H; }
      bg = parseColour(getComputedStyle(document.documentElement).getPropertyValue('--bg'));
      light = (bg[0] * 0.3 + bg[1] * 0.59 + bg[2] * 0.11) > 140;
    }

    function colour(i) { const k = i % 3; return mix(from[k] || from[0], colours[k] || colours[0], blend); }

    function aurora() {
      for (let i = 0; i < 5; i++) {
        const k = seed % 97 + i * 1.7, s = 0.06 + i * 0.013;
        const x = w * (0.5 + 0.42 * Math.sin(t * s + k)), y = h * (0.42 + 0.36 * Math.cos(t * s * 0.8 + k * 1.3));
        const r = Math.max(w, h) * (0.45 + 0.12 * Math.sin(t * 0.05 + i));
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, rgba(colour(i), light ? 0.45 : 0.55)); grad.addColorStop(1, rgba(colour(i), 0));
        g.fillStyle = grad; g.fillRect(0, 0, w, h);
      }
    }
    function waves() {
      for (let i = 0; i < 4; i++) {
        const base = h * (0.3 + i * 0.16), amp = h * (0.06 + 0.02 * i), len = w * (0.8 + 0.3 * i), ph = t * (0.12 + i * 0.03) + seed % 13 + i;
        g.beginPath(); g.moveTo(0, h);
        for (let x = 0; x <= w; x += 2) g.lineTo(x, base + Math.sin(x / len * 6.283 + ph) * amp + Math.sin(x / len * 2.1 - ph * 0.7) * amp * 0.6);
        g.lineTo(w, h); g.closePath();
        const grad = g.createLinearGradient(0, base - amp, 0, h);
        grad.addColorStop(0, rgba(colour(i), light ? 0.35 : 0.42)); grad.addColorStop(1, rgba(colour(i + 1), 0.05));
        g.fillStyle = grad; g.fill();
      }
    }
    function bokeh() {
      const glow = g.createRadialGradient(w / 2, h * 0.35, 0, w / 2, h * 0.35, Math.max(w, h) * 0.8);
      glow.addColorStop(0, rgba(colour(0), light ? 0.3 : 0.4)); glow.addColorStop(1, rgba(colour(0), 0));
      g.fillStyle = glow; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 16; i++) {
        const k = (seed >>> (i % 16)) % 1000 / 1000, rise = (k + t * (0.008 + (i % 5) * 0.003)) % 1;
        const x = w * ((k * 7.3 + i * 0.137) % 1) + Math.sin(t * 0.2 + i) * w * 0.03, y = h * (1.1 - rise * 1.2);
        const r = Math.max(2, w * (0.03 + (i % 4) * 0.018));
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        const a = (light ? 0.35 : 0.5) * Math.sin(rise * Math.PI);
        grad.addColorStop(0, rgba(colour(i), a)); grad.addColorStop(1, rgba(colour(i), 0));
        g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
      }
    }

    function draw() {
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = rgba(mix(bg, colour(0), light ? 0.12 : 0.18), 1); g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = light ? 'source-over' : 'lighter';
      [aurora, waves, bokeh][mood]();
      // Keep the words and controls readable over the lower half.
      g.globalCompositeOperation = 'source-over';
      const shade = g.createLinearGradient(0, h * 0.35, 0, h);
      shade.addColorStop(0, rgba(bg, 0)); shade.addColorStop(1, rgba(bg, light ? 0.75 : 0.85));
      g.fillStyle = shade; g.fillRect(0, 0, w, h);
      drawn++;
    }

    function tick(now) {
      frame = 0;
      if (!visible) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      if (last && now - last < 1000 / FPS - 2) { frame = requestAnimationFrame(tick); return; }
      last = now;
      speed += ((playing ? 1 : 0.15) - speed) * Math.min(1, dt * 1.5);
      t += dt * speed;
      if (blend < 1) blend = Math.min(1, blend + dt / 1.2);
      draw();
      if (!reduced.matches) frame = requestAnimationFrame(tick);
    }
    function start() { if (!frame && visible) { size(); last = 0; frame = requestAnimationFrame(tick); } }
    function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; }

    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
    root.addEventListener('resize', () => { if (visible) { size(); draw(); } });
    if (reduced.addEventListener) reduced.addEventListener('change', () => { stop(); start(); });

    return {
      song(id, palette) {
        const nextSeed = hash(id);
        if (palette && palette.length) {
          const full = [0, 1, 2].map(i => vivid(palette[i] || mix(palette[0], light ? [255, 255, 255] : [0, 0, 0], 0.35 * i)));
          from = [0, 1, 2].map(colour); colours = full; blend = visible ? 0 : 1;
        }
        if (nextSeed !== seed) { seed = nextSeed; mood = seed % 3; t = (seed % 1000) / 10; }
        if (visible) { size(); draw(); start(); }
      },
      show(on) { visible = !!on && !document.hidden; if (visible) { size(); draw(); start(); } else stop(); },
      playing(on) { playing = !!on; if (playing) start(); },
      get running() { return !!frame; },
      get frames() { return drawn; },
      get mood() { return ['aurora', 'waves', 'bokeh'][mood]; },
    };
  }

  const api = { create, paletteFrom, paletteOf, vivid };
  root.AartiCanvas = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
