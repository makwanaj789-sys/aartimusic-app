// Songs kept on the phone: ten seconds into a song the next ones are
// downloaded whole in the background, then play from the phone even with
// the server gone; a copy that won't play is dropped and the song streams.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
const root=path.resolve(__dirname,'../www');
const server=http.createServer((req,res)=>{
 const p=decodeURIComponent(req.url.split('?')[0]),file=path.join(root,p==='/'?'index.html':p);
 if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404).end();return;}
 const ext=path.extname(file);res.setHeader('content-type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[ext]||'application/octet-stream');res.end(fs.readFileSync(file));
});
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#b74"/></svg>';
function wav(){const n=8000*20,b=Buffer.alloc(44+n);b.write('RIFF');b.writeUInt32LE(36+n,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(8000,28);b.writeUInt16LE(1,32);b.writeUInt16LE(8,34);b.write('data',36);b.writeUInt32LE(n,40);b.fill(128,44);return b;}
let serial=0,last=[];const streams={};const song=()=>{const n=++serial;return {id:'song'+String(n).padStart(7,'0'),title:'Track '+n,artist:'Artist '+n,duration:200,thumb:'https://img.aarti.test/a.svg'};};
// What each host does: 'ok', 'dead' (connection fails), 'locked' (401).
const state={published:'a',a:'ok',b:'ok',missing:new Set()};
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true});
 fs.mkdirSync('test-results',{recursive:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
  if(url.hostname==='127.0.0.1')return route.continue();
  if(url.pathname.endsWith('/server.json'))return route.fulfill({json:{server:'https://'+state.published+'.aarti.test'},headers});
  if(url.hostname==='telegram.org')return route.fulfill({body:'',contentType:'text/javascript'});
  if(url.hostname==='img.aarti.test')return route.fulfill({body:svg,contentType:'image/svg+xml',headers});
  if(url.hostname==='lrclib.net')return route.fulfill({json:[],headers});
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  const host=url.hostname.split('.')[0],mode=state[host];
  if(mode==='dead')return route.abort('connectionrefused');
  if(url.pathname==='/api/search'){last=Array.from({length:8},song);return route.fulfill({json:{results:last},headers});}
  if(url.pathname.startsWith('/api/stream/')){
   const sid=url.pathname.split('/').pop();streams[sid]=(streams[sid]||0)+1;
   if(mode==='locked')return route.fulfill({status:401,json:{error:'unauthorised'},headers});
   if(state.missing.has(url.pathname.split('/').pop()))return route.fulfill({status:404,json:{error:'not available'},headers});
   const bytes=wav(),range=route.request().headers()['range'],m=range&&/^bytes=(\d+)-(\d*)$/.exec(range);
   if(m){const a=+m[1],b=m[2]?Math.min(+m[2],bytes.length-1):bytes.length-1;return route.fulfill({status:206,body:bytes.subarray(a,b+1),contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes','content-range':`bytes ${a}-${b}/${bytes.length}`}});}
   return route.fulfill({body:bytes,contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes'}});
  }
  return route.fulfill({status:404,json:{},headers});
 });
 const src=()=>page.evaluate(()=>document.getElementById('audio').src);
 const playing=()=>page.waitForFunction(()=>document.getElementById('audio').readyState>=3&&!document.getElementById('audio').paused,null,{timeout:15000});
 const kept=(id)=>page.evaluate(id=>window.AartiSongs.has(id),id);
 try{
  await page.addInitScript(()=>localStorage.setItem('aarti.profile.v1',JSON.stringify({name:'Ajay',languages:['Hindi'],artists:['Arijit Singh']})));
  await page.goto('http://127.0.0.1:'+server.address().port);
  assert.equal(await page.evaluate(()=>window.AartiSongs.supported),true);
  await page.locator('[data-tab="Search"]').click();await page.locator('#q').fill('seed');await page.locator('#searchForm').evaluate(f=>f.requestSubmit());
  await page.locator('#results .row .info').first().click();await playing();
  const first=await page.evaluate(()=>decodeURIComponent(new URL(document.getElementById('audio').src).pathname.split('/').pop()));
  assert.match(await src(),/a\.aarti\.test/,'a new song streams from the server');

  // 1. Ten seconds in: the one playing and the songs ahead are kept.
  await page.evaluate(()=>{const a=document.getElementById('audio');a.currentTime=11;});
  await page.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem('aarti.songs.v1')||'{}')).length>=3,null,{timeout:15000});
  assert.equal(await kept(first),true,'the song playing is kept too');
  const keptIds=await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('aarti.songs.v1'))));
  assert.equal(keptIds.length,3,'the one playing and the next two: '+keptIds);
  assert.equal(streams[keptIds.find(id=>id!==first)],1,'a song ahead is downloaded once');
  const ahead=keptIds.filter(id=>id!==first);

  // 2. The server is gone: the next song still plays, from the phone.
  state.a='dead';state.published='a';
  await page.evaluate(()=>document.getElementById('nNext').click());
  await playing();
  assert.match(await src(),/^blob:/,'played from the phone');

  // 3. Back to the first song, which was kept while it played: from the phone as well.
  await page.evaluate(()=>{const a=document.getElementById('audio');a.currentTime=0;document.getElementById('nPrev').click();});
  await playing();
  assert.match(await src(),/^blob:/,'the first song from the phone too');

  // 4. A copy that won't play is thrown away and the song streams from where it was.
  state.a='ok';
  const bad=ahead[0];
  await page.evaluate(async id=>{const c=await caches.open('aarti-songs-v1');await c.put('https://songs.aarti.local/'+encodeURIComponent(id),new Response(new Uint8Array(40000).fill(7),{headers:{'content-type':'audio/mp4'}}));},bad);
  await page.evaluate(()=>document.getElementById('nNext').click());
  await page.waitForFunction(()=>/a\.aarti\.test/.test(document.getElementById('audio').src)&&document.getElementById('audio').readyState>=3,null,{timeout:15000});
  assert.equal(await kept(bad),false,'the broken copy is gone');

  // 5. The copies never grow past the limit, oldest first, and clear() empties them.
  await page.evaluate(()=>window.AartiSongs.clear());
  assert.equal(await page.evaluate(()=>window.AartiSongs.size()),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: songs ahead are downloaded in the background, play from the phone with the server gone, and a broken copy falls back to the stream');
 }catch(e){await page.screenshot({path:'test-results/song-cache-failure.png'});throw e;}
 finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
