// A stream that breaks part-way resumes where it was instead of skipping;
// the song restored at launch loads on Play even if the server was away
// then; the next song is asked for ahead of time; an old search answer
// never replaces a newer one.
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
let serial=0;const song=()=>{const n=++serial;return {id:'song'+String(n).padStart(7,'0'),title:'Track '+n,artist:'Artist '+n,duration:200,thumb:'https://img.aarti.test/a.svg'};};
// What each host does: 'ok', 'dead' (connection fails), 'locked' (401).
const state={published:'a',a:'ok',b:'ok',missing:new Set()};const asked=[];let slowSearch=null;
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
  if(url.pathname==='/api/search'){const q=url.searchParams.get('q');const reply=()=>route.fulfill({json:{results:Array.from({length:3},()=>({...song(),title:q+' result'}))},headers}).catch(()=>{});
   if(q==='slow'){slowSearch=reply;return;}return reply();}
  if(url.pathname.startsWith('/api/stream/')){
   asked.push({id:url.pathname.split('/').pop(),range:route.request().headers()['range']||''});
   if(mode==='locked')return route.fulfill({status:401,json:{error:'unauthorised'},headers});
   if(state.missing.has(url.pathname.split('/').pop()))return route.fulfill({status:404,json:{error:'not available'},headers});
   const bytes=wav(),range=route.request().headers()['range'],m=range&&/^bytes=(\d+)-(\d*)$/.exec(range);
   if(m){const a=+m[1],b=m[2]?Math.min(+m[2],bytes.length-1):bytes.length-1;return route.fulfill({status:206,body:bytes.subarray(a,b+1),contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes','content-range':`bytes ${a}-${b}/${bytes.length}`}});}
   return route.fulfill({body:bytes,contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes'}});
  }
  return route.fulfill({status:404,json:{},headers});
 });
 const src=()=>page.evaluate(()=>document.getElementById('audio').src);
 const playing=()=>page.waitForFunction(()=>document.getElementById('audio').readyState>=3,null,{timeout:15000});
 const toastSays=(text)=>page.waitForFunction(t=>document.getElementById('toast').textContent===t,text,{timeout:15000});
 try{
  await page.addInitScript(()=>localStorage.setItem('aarti.profile.v1',JSON.stringify({name:'Ajay',languages:['Hindi'],artists:['Arijit Singh']})));
  await page.goto('http://127.0.0.1:'+server.address().port);
  const toast=()=>page.locator('#toast').textContent();
  // 1. A slow first search answers after a second one: the second stays.
  await page.locator('[data-tab="Search"]').click();
  await page.locator('#q').fill('slow');await page.locator('#searchForm').evaluate(f=>f.requestSubmit());
  await page.waitForFunction(()=>true);while(!slowSearch)await page.waitForTimeout(50);
  await page.locator('#q').fill('seed');await page.locator('#searchForm').evaluate(f=>f.requestSubmit());
  await page.locator('#results .row').first().waitFor();
  slowSearch();await page.waitForTimeout(400);
  assert.equal(await page.locator('#results .row .title').first().textContent(),'seed result');

  // 2. The next song is asked for once this one is ten seconds in.
  await page.locator('#results .row .info').first().click();await playing();
  const ids=await page.evaluate(()=>JSON.parse(localStorage.getItem('aarti.playback.v1')).queue.map(s=>s.id));
  assert(!asked.some(a=>a.id===ids[1]),'not asked for straight away');
  await page.evaluate(()=>{document.getElementById('audio').currentTime=11;});
  await page.waitForFunction(()=>document.getElementById('audio').currentTime>11.2);
  await page.waitForTimeout(300);
  assert.deepEqual(asked.filter(a=>a.id===ids[1]).map(a=>a.range),['bytes=0-1'],'the next song is warmed once, two bytes only');

  // 3. The stream breaks part-way: the same song carries on from there.
  const id=()=>page.evaluate(()=>decodeURIComponent(new URL(document.getElementById('audio').src).pathname.split('/').pop()));
  const at=await page.evaluate(()=>document.getElementById('audio').currentTime);
  await page.evaluate(()=>{const a=document.getElementById('audio');a.src='https://a.aarti.test/broken';a.load();});
  await page.waitForFunction(()=>/\/api\/stream\//.test(document.getElementById('audio').src)&&document.getElementById('audio').readyState>=3&&!document.getElementById('audio').paused,null,{timeout:15000});
  assert.equal(await id(),ids[0],'the same song, not the next one');
  assert(await page.evaluate(()=>document.getElementById('audio').currentTime)>=at-1,'from where it stopped');
  assert.notEqual(await toast(),"Couldn't play that one");

  // 4. Launch with the server away: no error shown, and Play loads the song once it is back.
  await page.evaluate(()=>document.getElementById('audio').pause());await page.waitForTimeout(300);
  state.a='dead';
  await page.reload();
  await page.waitForFunction(()=>!document.getElementById('mini').hidden,null,{timeout:15000});
  await page.waitForTimeout(1500);
  assert.equal(await toast(),'','a song nobody asked for fails quietly');
  state.a='ok';
  await page.locator('#mPlay').click();
  await playing();
  await page.waitForFunction(()=>!document.getElementById('audio').paused&&document.getElementById('audio').currentTime>10,null,{timeout:15000});
  assert.equal(await id(),ids[0]);
  assert.deepEqual(errors,[]);
  console.log('PASS: newer search wins, next song warmed ahead, broken stream resumes in place, restored song loads on Play');
 }catch(e){await page.screenshot({path:'test-results/playback-resilience-failure.png'});throw e;}
 finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
