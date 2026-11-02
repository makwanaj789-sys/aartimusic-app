// Sound presets change the song itself, live, while it plays: measured
// on the real signal. A preset left on the old phone equalizer is
// carried over and the old equalizer is let go.
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
// 60 seconds of a 60 Hz tone: what a bass boost should make louder.
function wav(){const rate=8000,n=rate*60,b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(36+n*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(2*Math.PI*60*i/rate)*0.25*32767),44+i*2);return b;}
const song=(n)=>({id:'song'+String(n).padStart(7,'0'),title:'Track '+n,artist:'Artist '+n,duration:200,thumb:'https://img.aarti.test/a.svg'});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 fs.mkdirSync('test-results',{recursive:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const bytes=wav();
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
  if(url.hostname==='127.0.0.1')return route.continue();
  if(url.pathname.endsWith('/server.json'))return route.fulfill({json:{server:'https://api.aarti.test'},headers});
  if(url.hostname==='telegram.org')return route.fulfill({body:'',contentType:'text/javascript'});
  if(url.hostname==='img.aarti.test')return route.fulfill({body:svg,contentType:'image/svg+xml',headers});
  if(url.hostname==='lrclib.net')return route.fulfill({json:[],headers});
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/search'||url.pathname==='/api/playlists')return route.fulfill({json:{results:Array.from({length:4},(_, i)=>song(i+1))},headers});
  if(url.pathname.startsWith('/api/stream/')){
   const range=route.request().headers()['range'],m=range&&/^bytes=(\d+)-(\d*)$/.exec(range);
   if(m){const a=+m[1],b=m[2]?Math.min(+m[2],bytes.length-1):bytes.length-1;return route.fulfill({status:206,body:bytes.subarray(a,b+1),contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes','content-range':`bytes ${a}-${b}/${bytes.length}`}});}
   return route.fulfill({body:bytes,contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes'}});
  }
  return route.fulfill({status:404,json:{},headers});
 });
 // The old Android equalizer, left on "bass" by the previous version.
 const fake=()=>{window.__native={preset:'bass',sets:[]};
   const plugin={fxStatus:()=>Promise.resolve({supported:true,preset:__native.preset,error:''}),
    fxSet:({preset})=>{__native.sets.push(preset);__native.preset=preset;return Promise.resolve({preset});},
    setLike:()=>Promise.resolve(),addListener:()=>Promise.resolve({remove(){}})};
   window.Capacitor={isNativePlatform:()=>true,isPluginAvailable:n=>n==='AartiAudio',Plugins:{AartiAudio:plugin}};
   // Listen to what leaves the limiter, as the speaker would hear it.
   const make=AudioContext.prototype.createDynamicsCompressor;
   AudioContext.prototype.createDynamicsCompressor=function(){const c=make.call(this);const an=this.createAnalyser();an.fftSize=2048;c.connect(an);window.__out=an;return c;};
   window.__level=()=>{const d=new Float32Array(__out.fftSize);__out.getFloatTimeDomainData(d);let s=0;for(const v of d)s+=v*v;return Math.sqrt(s/d.length);};};
 const level=async()=>{const v=[];for(let i=0;i<8;i++){v.push(await page.evaluate(()=>__level()));await page.waitForTimeout(60);}v.sort((a,b)=>a-b);return v[4];};
 try{
  await page.addInitScript(()=>localStorage.setItem('aarti.profile.v1',JSON.stringify({name:'Ajay',languages:['Hindi'],artists:['Arijit Singh']})));
  await page.addInitScript(fake);
  await page.goto('http://127.0.0.1:'+server.address().port);
  // 1. The old preset is carried over and the old equalizer released.
  await page.waitForFunction(()=>__native.sets.includes('normal'));
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('aarti.v1')).fx),'bass');
  assert.equal(await page.evaluate(()=>document.getElementById('audio').crossOrigin),'anonymous');

  // 2. It applies once a song plays, and the song really plays through it.
  await page.locator('[data-tab="Search"]').click();await page.locator('#q').fill('tone');await page.locator('#searchForm').evaluate(f=>f.requestSubmit());
  await page.locator('#results .row .info').first().click();
  await page.waitForFunction(()=>window.__out&&!document.getElementById('audio').paused&&document.getElementById('audio').currentTime>1,null,{timeout:15000});
  await page.waitForTimeout(400);
  const bass=await level();
  assert(bass>0.05,'sound comes out of the preset chain: '+bass);

  // 3. Live: switching while it plays changes what is heard.
  await page.locator('#miniOpen').click();await page.waitForFunction(()=>document.getElementById('now').dataset.progress==='1.0000');
  await page.locator('#nowMenu').click();await page.waitForFunction(()=>!document.getElementById('fxRow').hidden);
  assert.equal(await page.locator('[data-fx="bass"]').getAttribute('aria-pressed'),'true');
  assert(!(await page.locator('[data-fx="vocal"]').isDisabled()));
  await page.locator('[data-fx="normal"]').click();
  assert.equal(await page.locator('#toast').textContent(),'Sound: normal');
  await page.waitForTimeout(700);
  const flat=await level();
  assert(bass/flat>1.4,`bass boost is louder in the bass than normal: ${bass.toFixed(3)} vs ${flat.toFixed(3)}`);
  await page.locator('[data-fx="vocal"]').click();await page.waitForTimeout(700);
  const vocal=await level();
  assert(vocal<flat*0.8,`vocal takes the low end down: ${vocal.toFixed(3)} vs ${flat.toFixed(3)}`);
  assert.equal(await page.locator('[data-fx="vocal"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>document.getElementById('audio').paused),false,'the song never stopped');
  await page.screenshot({path:'test-results/sound.png'});

  // 4. The choice survives a restart.
  await page.reload();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('aarti.v1')).fx),'vocal');
  // 5. A fresh install playing on Normal: Bass boost tapped mid-song takes effect at once.
  const fresh=await browser.newContext({viewport:{width:390,height:844}});const p2=await fresh.newPage();
  p2.on('pageerror',e=>errors.push(e.message));
  await p2.route('**/*',async route=>{const url=new URL(route.request().url());const headers={'access-control-allow-origin':'*'};
   if(url.hostname==='127.0.0.1')return route.continue();
   if(url.pathname.endsWith('/server.json'))return route.fulfill({json:{server:'https://api.aarti.test'},headers});
   if(url.pathname==='/api/search')return route.fulfill({json:{results:[song(9)]},headers});
   if(url.pathname.startsWith('/api/stream/')){const range=route.request().headers()['range'],m=range&&/^bytes=(\d+)-(\d*)$/.exec(range);
    if(m){const a=+m[1],b=m[2]?Math.min(+m[2],bytes.length-1):bytes.length-1;return route.fulfill({status:206,body:bytes.subarray(a,b+1),contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes','content-range':`bytes ${a}-${b}/${bytes.length}`}});}
    return route.fulfill({body:bytes,contentType:'audio/wav',headers});}
   return route.fulfill({status:404,json:{},headers});});
  await p2.addInitScript(()=>localStorage.setItem('aarti.profile.v1',JSON.stringify({name:'Ajay',languages:['Hindi'],artists:['Arijit Singh']})));
  await p2.addInitScript(fake);await p2.addInitScript(()=>{__native.preset='normal';});
  await p2.goto('http://127.0.0.1:'+server.address().port);
  await p2.locator('[data-tab="Search"]').click();await p2.locator('#q').fill('tone');await p2.locator('#searchForm').evaluate(f=>f.requestSubmit());
  await p2.locator('#results .row .info').first().click();
  await p2.waitForFunction(()=>!document.getElementById('audio').paused&&document.getElementById('audio').currentTime>1,null,{timeout:15000});
  assert.equal(await p2.evaluate(()=>!!window.__out),false,'Normal leaves the song on its untouched path');
  await p2.locator('#miniOpen').click();await p2.waitForFunction(()=>document.getElementById('now').dataset.progress==='1.0000');
  await p2.locator('#nowMenu').click();await p2.waitForFunction(()=>!document.getElementById('fxRow').hidden);
  await p2.locator('[data-fx="bass"]').click();await p2.waitForTimeout(700);
  const live=[];for(let i=0;i<8;i++){live.push(await p2.evaluate(()=>__level()));await p2.waitForTimeout(60);}live.sort((a,b)=>a-b);
  assert(Math.abs(live[4]-bass)/bass<0.25,`bass boost tapped mid-song sounds like bass boost: ${live[4].toFixed(3)} vs ${bass.toFixed(3)}`);
  assert.equal(await p2.evaluate(()=>document.getElementById('audio').paused),false);
  await fresh.close();
  assert.deepEqual(errors,[]);
  console.log('levels',bass.toFixed(3),flat.toFixed(3),vocal.toFixed(3));
  console.log('PASS: presets change the real signal live while playing, old equalizer preset carried over and released, choice kept');
 }catch(e){await page.screenshot({path:'test-results/sound-failure.png'});throw e;}
 finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
