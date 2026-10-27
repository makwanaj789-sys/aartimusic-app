const test = require('node:test');
const assert = require('node:assert/strict');
const mem = new Map();
globalThis.localStorage = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)) };
const L = require('../www/listening.js');
const day = Date.UTC(2026, 9, 5, 12);
const a = { id: 'a', title: 'Alpha', artist: 'Singer One - Topic', duration: 200 };
const b = { id: 'b', title: 'Bravo', artist: 'Singer Two', duration: 200 };

test('plays, seconds and artists add up', () => {
  mem.clear();
  for (let i = 0; i < 7; i++) L.add(a, 10, i === 3, day);
  assert.equal(L.summary(day).topSongs[0].plays, 1);
  const s = L.summary(day);
  assert.equal(s.topSongs[0].plays, 1);
  assert.equal(s.topArtists[0].name, 'Singer One');
  assert.equal(s.topArtists[0].minutes, 1);
});

test('jumps and nonsense are not listening', () => {
  mem.clear();
  L.add(a, 90, true, day);        // a seek forward, not a listen
  L.add(a, -3, false, day);
  L.add(null, 1, false, day);
  assert.equal(L.summary(day).totalMinutes, 0);
});

test('week covers seven days, daily has seven bars', () => {
  mem.clear();
  for (let i = 0; i < 12; i++) L.add(b, 10, false, day);             // today: 2 min
  for (let i = 0; i < 6; i++) L.add(b, 10, false, day - 3 * 864e5);  // 3 days ago: 1 min
  for (let i = 0; i < 6; i++) L.add(b, 10, false, day - 9 * 864e5);  // outside the week
  const s = L.summary(day);
  assert.equal(s.weekMinutes, 3);
  assert.equal(s.totalMinutes, 4);
  assert.equal(s.daily.length, 7);
  assert.equal(s.daily[6].minutes, 2);
  assert.equal(s.daily[3].minutes, 1);
});

test('daily mix: most played and favourites, no repeats, same all day', () => {
  mem.clear();
  L.add(a, 10, true, day);
  const favs = [b, a, { id: 'c', title: 'Charlie' }];
  const m1 = L.dailyMix(favs, day), m2 = L.dailyMix(favs, day + 3600e3);
  assert.deepEqual(m1.map(x => x.id).sort(), ['a', 'b', 'c']);
  assert.deepEqual(m1.map(x => x.id), m2.map(x => x.id));
});

test('moment of day', () => {
  assert.equal(L.moment(7, 'Gujarati').name, 'Morning');
  assert.match(L.moment(7, 'Gujarati').query, /^Gujarati /);
  assert.equal(L.moment(13).name, 'Afternoon');
  assert.equal(L.moment(19).name, 'Evening');
  assert.equal(L.moment(23).name, 'Night');
  assert.equal(L.moment(2).name, 'Night');
});
