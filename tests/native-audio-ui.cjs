// Native sound presets and the lock-screen like, through a stand-in for the Android plugin.
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
function wav(){const n=8000*60,b=Buffer.alloc(44+n);b.write('RIFF');b.writeUInt32LE(36+n,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(8000,28);b.writeUInt16LE(1,32);b.writeUInt16LE(8,34);b.write('data',36);b.writeUInt32LE(n,40);b.fill(128,44);return b;}
const song=(n,t,artist)=>({id:'song'+String(n).padStart(7,'0'),title:t,artist:artist||'Artist '+n,duration:200,thumb:'https://img.aarti.test/a.svg'});
const results=['Alpha','Bravo','Charlie','Delta'].map((t,i)=>song(i+1,t+' Song','Kirtidan Gadhvi'));
let radio=100;const searches=[];
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
  if(url.pathname.endsWith('/server.json'))return route.fulfill({json:{server:'https://api.aarti.test'}});
  if(url.hostname==='telegram.org')return route.fulfill({body:'',contentType:'text/javascript'});
  if(url.hostname==='img.aarti.test')return route.fulfill({body:svg,contentType:'image/svg+xml',headers});
  if(url.hostname==='lrclib.net')return route.fulfill({json:[],headers});
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/playlists')return route.fulfill({json:{results:[]},headers});
  if(url.pathname==='/api/search'){
   const q=url.searchParams.get('q');searches.push(q);
   if(q==='alphabet')return route.fulfill({json:{results},headers});
   return route.fulfill({json:{results:Array.from({length:10},()=>song(++radio,'Radio pick '+radio))},headers});
  }
  if(url.pathname.startsWith('/api/stream/')){
   const bytes=wav(),range=route.request().headers()['range'],m=range&&/^bytes=(\d+)-(\d*)$/.exec(range);
   if(m){const a=+m[1],b=m[2]?Math.min(+m[2],bytes.length-1):bytes.length-1;return route.fulfill({status:206,body:bytes.subarray(a,b+1),contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes','content-range':`bytes ${a}-${b}/${bytes.length}`}});}
   return route.fulfill({body:bytes,contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes'}});
  }
  return route.fulfill({status:404,json:{},headers});
 });
 const fake=()=>{window.__calls=[];window.__fx={preset:'normal',supported:true};window.__listeners={};
   const plugin={setLike:o=>{__calls.push([o.liked,o.available]);return Promise.resolve();},
    fxStatus:()=>Promise.resolve({supported:__fx.supported,preset:__fx.preset,error:__fx.supported?'':'This phone does not allow sound effects for this app.'}),
    fxSet:({preset})=>__fx.supported?(__fx.preset=preset,Promise.resolve({preset})):Promise.reject(new Error('This phone does not allow sound effects for this app.')),
    addListener:(ev,cb)=>{__listeners[ev]=cb;return Promise.resolve({remove(){}});}};
   window.Capacitor={isNativePlatform:()=>true,isPluginAvailable:n=>n==='AartiAudio',Plugins:{AartiAudio:plugin}};};
 try{
  await page.addInitScript(()=>localStorage.setItem('aarti.profile.v1',JSON.stringify({name:'Ajay',languages:['Hindi'],artists:['Arijit Singh']})));
  await page.addInitScript(fake);
  await page.goto('http://127.0.0.1:'+server.address().port);
  const last=()=>page.evaluate(()=>__calls[__calls.length-1]);
  const favIds=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('aarti.v1')).favs.map(s=>s.id));
  await page.locator('[data-tab="Search"]').click();await page.locator('#q').fill('alphabet');await page.locator('#searchForm').evaluate(f=>f.requestSubmit());
  await page.locator('#results .row .info').first().click();await page.waitForFunction(()=>document.getElementById('audio').readyState>=3);
  // 1. the lock-screen heart follows the song
  assert.deepEqual(await last(),[false,true]);
  await page.locator('#mFav').click();
  assert.deepEqual(await last(),[true,true]);
  // 2. a tap on the lock-screen heart toggles the favourite
  await page.evaluate(()=>__listeners.like());await page.waitForTimeout(100);
  assert.deepEqual(await last(),[false,true]);assert.deepEqual(await favIds(),[]);
  await page.evaluate(()=>__listeners.like());await page.waitForTimeout(100);
  assert.deepEqual(await last(),[true,true]);assert.equal((await favIds()).length,1);
  assert.equal(await page.locator('#mFav').getAttribute('aria-pressed'),'true','the app heart follows too');
  // 3. sound presets
  await page.locator('#miniOpen').click();await page.waitForFunction(()=>document.getElementById('now').dataset.progress==='1.0000');
  await page.locator('#nowMenu').click();await page.waitForFunction(()=>!document.getElementById('fxRow').hidden);
  assert.equal(await page.locator('[data-fx="normal"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-fx="bass"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-fx="bass"]').getAttribute('aria-pressed')==='true');
  assert.equal(await page.locator('#toast').textContent(),'Sound: Bass boost');
  assert.equal(await page.evaluate(()=>__fx.preset),'bass');
  await page.screenshot({path:'test-results/sound.png'});
  await page.locator('#sleepSheet').click({position:{x:10,y:10}});await page.waitForTimeout(400);
  // 4. a phone that refuses: greyed out, with the reason
  await page.evaluate(()=>{__fx.supported=false;__fx.preset='normal';});
  await page.locator('#nowMenu').click();
  await page.waitForFunction(()=>!document.getElementById('fxNote').hidden);
  assert.match(await page.locator('#fxNote').textContent(),/does not allow sound effects/);
  assert(await page.locator('[data-fx="bass"]').isDisabled());
  // 5. outside the Android app there is no Sound section and nothing breaks
  const web=await browser.newPage({viewport:{width:390,height:844}});
  await web.route('**/*',r=>{const u=new URL(r.request().url());return u.hostname==='127.0.0.1'?r.continue():r.fulfill({status:404,body:''});});
  await web.goto('http://127.0.0.1:'+server.address().port);await web.waitForTimeout(500);
  assert.equal(await web.evaluate(()=>document.getElementById('fxRow').hidden),true);
  await web.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: lock-screen heart follows the song and toggles favourites, presets apply, refused phones say so, hidden on web');
 }catch(e){await page.screenshot({path:'test-results/sound-failure.png'});throw e;}
 finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
