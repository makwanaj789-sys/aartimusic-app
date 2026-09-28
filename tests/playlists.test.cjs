const { test } = require('node:test');
const assert = require('node:assert/strict');
const { id, create } = require('../www/playlists.js');
const ID = 'PL1234567890abcd';
const response = (status, body) => ({ status, ok: status < 400, json: async () => body });
test('normalizes all five requested input forms', () => {
  for (const value of [`youtube.com/playlist?list=${ID}`, `https://youtube.com/watch?v=X&list=${ID}`, `https://youtu.be/X?list=${ID}`, `music.youtube.com/playlist?list=${ID}`, ID]) assert.equal(id(value, true), ID);
  assert.equal(id('abcdefghijklmnop', true), 'abcdefghijklmnop');
  assert.equal(id('https://example.com/?list='+ID), '');
  assert.equal(id('Arijit Singh'), '');
});
test('distinguishes empty, failed, unauthorized, missing route and malformed', async () => {
  for (const [status, body, expected] of [[401, {error:'unauthorised'}, 'unauthorised'], [403, null, 'forbidden'], [404, null, 'unsupported'], [200, {error:'extractor failed', results:[]}, 'failed'], [200, {}, 'malformed'], [502, {error:'upstream'}, 'failed']]) {
    const client = create(async () => response(status,body));
    await assert.rejects(client.search('test'), e => e.kind === expected);
  }
  const client = create(async () => response(200, {results:[],kind:'empty',error:'zero entries'}));
  assert.deepEqual((await client.open(ID)).results, []);
});
test('deduplicates concurrent requests, caches success, expires cache', async () => {
  let calls=0, now=0;
  const client=create(async () => { calls++; return response(200,{results:[{id:'song'}]}); }, {now:()=>now,ttl:100});
  await Promise.all([client.open(ID),client.open(ID)]); assert.equal(calls,1);
  await client.open('https://youtu.be/X?list='+ID); assert.equal(calls,1);
  now=101; await client.open(ID); assert.equal(calls,2);
});
test('does not cache errors and permits retry',async()=>{
  let calls=0; const client=create(async()=>response(++calls===1?502:200,{results:[]}));
  await assert.rejects(client.open(ID)); await client.open(ID); assert.equal(calls,2);
});
test('times out a stalled request',async()=>{
  const client=create(()=>new Promise(()=>{}),{timeout:10});
  await assert.rejects(client.open(ID),e=>e.kind==='timeout');
});
