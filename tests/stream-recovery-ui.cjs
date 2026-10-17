// When a song won't load: follow a server that moved, say why when the
// server refuses or is gone (and stop there), and skip a single missing song.
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
  if(url.pathname==='/api/search')return route.fulfill({json:{results:Array.from({length:8},song)},headers});
  if(url.pathname.startsWith('/api/stream/')){
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
  await page.locator('[data-tab="Search"]').click();await page.locator('#q').fill('seed');await page.locator('#searchForm').evaluate(f=>f.requestSubmit());
  await page.locator('#results .row .info').first().click();await playing();
  assert.match(await src(),/a\.aarti\.test/);

  // 1. The tunnel restarted: the old address is dead and server.json has the new one.
  state.a='dead';state.published='b';
  await page.evaluate(()=>{document.getElementById('audio').pause();document.getElementById('nNext').click();});
  await toastSays('Server moved — reconnecting');
  await playing();
  assert.match(await src(),/b\.aarti\.test/,'the same song now comes from the new address');

  // 2. The server refuses the app's key: say so, and don't skip through the queue.
  state.b='locked';
  await page.evaluate(()=>{document.getElementById('audio').pause();document.getElementById('nNext').click();});
  await toastSays('The server refused this app (key mismatch)');
  const lockedOn=await src();await page.waitForTimeout(1500);
  assert.equal(await src(),lockedOn,'no skipping when the key is refused');

  // 3. The server is down and server.json has nothing newer: say so and stop.
  state.b='dead';
  await page.evaluate(()=>document.getElementById('nNext').click());
  await toastSays("Can't reach the music server");
  const deadOn=await src();await page.waitForTimeout(1500);
  assert.equal(await src(),deadOn,'no skipping when the server is gone');

  // 4. Server fine, one song missing: say so and move on to the next one.
  state.b='ok';
  await page.evaluate(()=>document.getElementById('nNext').click());await playing();
  const nextId=await page.evaluate(()=>decodeURIComponent(new URL(document.getElementById('audio').src).pathname.split('/').pop()));
  // the song after this one will be missing
  await page.evaluate(()=>document.getElementById('audio').pause());
  const before=await src();
  await page.route('**/api/stream/**',route=>{const id=new URL(route.request().url()).pathname.split('/').pop();if(id!==nextId&&!state.missing.size){state.missing.add(id);}return route.fallback();});
  await page.evaluate(()=>document.getElementById('nNext').click());
  await toastSays("This song isn't available");
  await page.waitForFunction(b=>document.getElementById('audio').src!==b&&document.getElementById('audio').readyState>=3,before,{timeout:15000});
  assert.notEqual(await src(),before,'skipped past the missing song');
  assert.deepEqual(errors,[]);
  console.log('PASS: follows a moved server, names a refused key and a dead server without skipping, skips one missing song');
 }catch(e){await page.screenshot({path:'test-results/stream-recovery-failure.png'});throw e;}
 finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
