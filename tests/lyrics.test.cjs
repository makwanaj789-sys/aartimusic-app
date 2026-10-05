const test = require('node:test');
const assert = require('node:assert/strict');

// lyrics.js reads localStorage for its cache; a small in-memory one stands in.
const mem = new Map();
globalThis.localStorage = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)) };
const L = require('../www/lyrics.js');

test('queries clean YouTube noise and try both sides of a dash', () => {
  const q = L.queries({ title: 'Jeena Jeena (Official Lyrical Video) | Badlapur | Varun Dhawan', artist: 'Sony Music India' });
  assert.equal(q[0], 'Jeena Jeena');                 // a label channel is not added
  const q2 = L.queries({ title: 'Sachin Jigar & Atif Aslam - Jeena Jeena (Lyrics)', artist: 'Indie India' });
  assert(q2.includes('Jeena Jeena'));
  const q3 = L.queries({ title: 'Kamariya 🌙 Slowed + Reverb', artist: 'Arijit Singh' });
  assert.deepEqual(q3, ['Kamariya Arijit Singh', 'Kamariya']);
  assert(q2.includes('Sachin Jigar Atif Aslam'));
});

test('parse reads stamps, multi-stamps and drops tags', () => {
  const lines = L.parse('[ar:Atif]\n[00:12.50]Jeena jeena\n[00:15.00][01:15.00]Aaya hoon\n[00:20.00]\n[00:21.00]\n[00:22.1]Next');
  assert.deepEqual(lines.map(l => [l.t, l.text]), [[12.5, 'Jeena jeena'], [15, 'Aaya hoon'], [20, ''], [22.1, 'Next'], [75, 'Aaya hoon']]);
});

test('lineAt finds the line playing', () => {
  const lines = L.parse('[00:10.00]a\n[00:20.00]b\n[00:30.00]c');
  assert.equal(L.lineAt(lines, 5), -1);
  assert.equal(L.lineAt(lines, 10), 0);
  assert.equal(L.lineAt(lines, 25), 1);
  assert.equal(L.lineAt(lines, 99), 2);
});

test('pick prefers the matching length and timed lines, rejects other songs', () => {
  const song = { title: 'Jeena Jeena | Badlapur', artist: 'Sony Music India', duration: 230 };
  const results = [
    { trackName: 'Jeena Jeena', artistName: 'Atif Aslam', duration: 320, syncedLyrics: '[00:01.00]x' },   // other recording
    { trackName: 'Tera Ban Jaunga', artistName: 'Akhil', duration: 231, syncedLyrics: '[00:01.00]x' },   // other song
    { trackName: 'Jeena Jeena', artistName: 'Atif Aslam', duration: 232, plainLyrics: 'x' },
    { trackName: 'Jeena Jeena', artistName: 'Atif Aslam', duration: 229, syncedLyrics: '[00:01.00]x' },
  ];
  assert.equal(L.pick(results, song).duration, 229);
  assert.equal(L.pick([results[1]], song), null);
});

test('find searches, caches hits, remembers misses, and reports outages', async () => {
  const calls = [];
  const ok = (body) => ({ ok: true, json: async () => body });
  const song = { id: 'abc', title: 'Jeena Jeena | Badlapur', artist: 'Sony Music India', duration: 230 };
  const found = await L.find(song, async (url) => { calls.push(url); return ok([{ trackName: 'Jeena Jeena', artistName: 'Atif Aslam', duration: 231, syncedLyrics: '[00:05.00]Jeena' }]); });
  assert.equal(found.synced[0].text, 'Jeena');
  assert.match(calls[0], /lrclib\.net\/api\/search\?q=Jeena%20Jeena/);
  await L.find(song, async () => { throw new Error('should be cached'); });

  const miss = await L.find({ id: 'none1', title: 'Unknown Thing', artist: 'X' }, async () => ok([]));
  assert.equal(miss.none, true);
  await L.find({ id: 'none1', title: 'Unknown Thing', artist: 'X' }, async () => { throw new Error('miss is cached'); });

  await assert.rejects(L.find({ id: 'down', title: 'Some Song', artist: 'Y' }, async () => { throw new Error('offline'); }));
  // an outage is not cached: the next try asks again
  const later = await L.find({ id: 'down', title: 'Some Song', artist: 'Y' }, async () => ok([{ trackName: 'Some Song', artistName: 'Y', plainLyrics: 'la la' }]));
  assert.equal(later.plain, 'la la');
});
