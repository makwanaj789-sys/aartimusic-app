/* ============================================================
   SOUND PRESETS
   Applied to the song itself, inside the app, with Web Audio:
   the <audio> element runs through four filters and a limiter.

   The phone's own equalizer on the output mix (session 0) was the
   first try; most current phones ignore it for other apps, so a
   preset changed nothing. Here the change is part of the song's
   own signal, heard at once, while it plays, on every phone.

   The graph is only built the first time a preset other than
   Normal is wanted, so someone who never touches Sound keeps the
   untouched path. Once built it stays, and Normal sets every band
   flat, which sounds the same as not being there.
   ============================================================ */
(function (root) {
  'use strict';

  // dB per band. low: shelf at 110 Hz, mid: 900 Hz, presence: 3 kHz, high: shelf at 8 kHz.
  const PRESETS = {
    normal: { low: 0, mid: 0, presence: 0, high: 0 },
    bass:   { low: 9, mid: -1, presence: 0, high: 1 },
    vocal:  { low: -4, mid: 2, presence: 5, high: 1 },
    treble: { low: -1, mid: 0, presence: 3, high: 8 },
    party:  { low: 7, mid: -3, presence: 2, high: 5 },
  };
  const BANDS = [
    ['low', 'lowshelf', 110, 0.7],
    ['mid', 'peaking', 900, 0.9],
    ['presence', 'peaking', 3000, 1.0],
    ['high', 'highshelf', 8000, 0.7],
  ];

  /* Boosting adds level, and a louder preset always sounds "better"
     for a moment and then clips. Half the biggest boost comes off
     the top; the limiter catches what is left. */
  function preamp(name) {
    const p = PRESETS[name] || PRESETS.normal;
    const boost = Math.max(0, p.low, p.mid, p.presence, p.high);
    return Math.pow(10, -boost / 2 / 20);
  }

  function create(audio) {
    let ctx = null, filters = {}, gain = null, current = 'normal';
    const Ctx = root.AudioContext || root.webkitAudioContext;

    function build() {
      if (ctx) return true;
      if (!Ctx || !audio) return false;
      try {
        ctx = new Ctx();
        const source = ctx.createMediaElementSource(audio);
        let node = source;
        BANDS.forEach(([band, type, hz, q]) => {
          const f = ctx.createBiquadFilter();
          f.type = type; f.frequency.value = hz; f.Q.value = q; f.gain.value = 0;
          node.connect(f); node = f; filters[band] = f;
        });
        gain = ctx.createGain();
        const limit = ctx.createDynamicsCompressor();
        limit.threshold.value = -1; limit.knee.value = 0; limit.ratio.value = 20;
        limit.attack.value = 0.003; limit.release.value = 0.25;
        node.connect(gain); gain.connect(limit); limit.connect(ctx.destination);
        // A context made outside a tap, or paused by the phone, starts
        // or stops silent while the song runs on: keep it going with
        // the song.
        audio.addEventListener('play', wake);
        ctx.addEventListener('statechange', () => { if (!audio.paused) wake(); });
        return true;
      } catch (e) {
        ctx = null;
        return false;
      }
    }

    function wake() {
      if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
    }

    function set(name, glide) {
      if (!PRESETS[name]) name = 'normal';
      if (name !== 'normal' && !build()) return false;
      current = name;
      if (!ctx) return true;               // Normal and never built: nothing to do
      const p = PRESETS[name], t = ctx.currentTime, tc = glide === false ? 0.001 : 0.08;
      BANDS.forEach(([band]) => filters[band].gain.setTargetAtTime(p[band], t, tc));
      gain.gain.setTargetAtTime(preamp(name), t, tc);
      wake();
      return true;
    }

    return {
      set,
      get preset() { return current; },
      get active() { return !!ctx; },
      get state() { return ctx ? ctx.state : 'none'; },
      supported: !!Ctx,
    };
  }

  const api = { PRESETS, BANDS, preamp, create };
  root.AartiSound = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
