/* ============================================================
   LISTENING
   What has actually been listened to, kept on the phone: seconds
   per song, per artist and per day. From it come the stats in the
   library and the mixes on the home screen. Nothing leaves the
   phone.
   ============================================================ */
(function (root) {
  'use strict';
  const KEY = 'aarti.stats.v1';
  const PLAY_AFTER = 30;            // seconds before a listen counts as a play

  const empty = () => ({ songs: {}, artists: {}, days: {} });
  function read() {
    try { const s = JSON.parse(root.localStorage.getItem(KEY)); return s && s.songs ? s : empty(); }
    catch (_) { return empty(); }
  }
  function write(s) { try { root.localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
  const artistOf = (song) => String(song.artist || 'Unknown').replace(/\s*-\s*topic$/i, '').trim() || 'Unknown';
  const dayOf = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* Adds listened seconds to a song, and one play when `newPlay` —
     the app says so once per play, when that play passes thirty
     seconds. Seconds arrive in batches of up to about ten. */
  function add(song, secs, newPlay, now) {
    if (!song || !song.id || !(secs > 0) || secs > 20) return;
    const s = read(), t = now || Date.now();
    const e = s.songs[song.id] || (s.songs[song.id] = { title: song.title, artist: artistOf(song), thumb: song.thumb, duration: song.duration, secs: 0, plays: 0, last: 0 });
    e.secs += secs; e.last = t; e.title = song.title; e.thumb = song.thumb || e.thumb;
    if (newPlay) e.plays++;
    const a = artistOf(song);
    s.artists[a] = (s.artists[a] || 0) + secs;
    const d = dayOf(t);
    s.days[d] = (s.days[d] || 0) + secs;
    // Keep the store small: the 400 most recent songs, 120 days.
    const ids = Object.keys(s.songs);
    if (ids.length > 400) ids.sort((x, y) => s.songs[x].last - s.songs[y].last).slice(0, ids.length - 400).forEach(k => delete s.songs[k]);
    const days = Object.keys(s.days).sort();
    if (days.length > 120) days.slice(0, days.length - 120).forEach(k => delete s.days[k]);
    write(s);
  }

  function summary(now) {
    const s = read(), t = now || Date.now();
    let week = 0, total = 0;
    for (let i = 0; i < 7; i++) week += s.days[dayOf(t - i * 864e5)] || 0;
    Object.values(s.days).forEach(v => { total += v; });
    const topSongs = Object.entries(s.songs).filter(([, e]) => e.plays > 0)
      .sort((a, b) => b[1].plays - a[1].plays || b[1].secs - a[1].secs).slice(0, 5)
      .map(([id, e]) => ({ id, title: e.title, artist: e.artist, thumb: e.thumb, duration: e.duration, plays: e.plays }));
    const topArtists = Object.entries(s.artists).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, secs]) => ({ name, minutes: Math.round(secs / 60) }));
    // The last seven days, oldest first, for the little bar chart.
    const daily = [];
    for (let i = 6; i >= 0; i--) { const d = dayOf(t - i * 864e5); daily.push({ day: d, minutes: Math.round((s.days[d] || 0) / 60) }); }
    return { weekMinutes: Math.round(week / 60), totalMinutes: Math.round(total / 60), topSongs, topArtists, daily, songCount: Object.keys(s.songs).length };
  }

  // A shuffle that is the same all day: seeded by the date.
  function seeded(list, seedText) {
    let h = 2166136261;
    for (const c of seedText) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    const rand = () => { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return h / 4294967296; };
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }

  /* Today's mix: the songs listened to most and the favourites,
     without repeats, in an order fixed for the day. */
  function dailyMix(favs, now) {
    const s = read(), seen = new Set(), out = [];
    const most = Object.entries(s.songs).sort((a, b) => b[1].plays - a[1].plays || b[1].secs - a[1].secs).slice(0, 25)
      .map(([id, e]) => ({ id, title: e.title, artist: e.artist, thumb: e.thumb, duration: e.duration }));
    for (const song of [...most, ...(favs || [])]) if (song && song.id && !seen.has(song.id)) { seen.add(song.id); out.push(song); }
    return seeded(out, dayOf(now || Date.now())).slice(0, 20);
  }

  // Which part of the day it is, and what to search for it.
  function moment(hour, language) {
    const lang = language || 'Hindi';
    if (hour >= 5 && hour < 11) return { name: 'Morning', query: lang + ' morning fresh songs' };
    if (hour >= 11 && hour < 17) return { name: 'Afternoon', query: lang + ' upbeat songs' };
    if (hour >= 17 && hour < 21) return { name: 'Evening', query: lang + ' evening chill songs' };
    return { name: 'Night', query: lang + ' night romantic lofi songs' };
  }

  const api = { add, summary, dailyMix, moment, seeded, PLAY_AFTER };
  root.AartiListening = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
