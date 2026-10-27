const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
const root=path.resolve(__dirname,'../www');
const server=http.createServer((req,res)=>{
 const file=path.join(root,decodeURIComponent(req.url.split('?')[0])==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]));
 if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404).end();return;}
 const ext=path.extname(file);res.setHeader('content-type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[ext]||'application/octet-stream');res.end(fs.readFileSync(file));
});
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="a"><stop stop-color="#482715"/><stop offset="1" stop-color="#bd8047"/></linearGradient></defs><rect width="400" height="400" fill="url(#a)"/><circle cx="200" cy="170" r="80" fill="#f2c77d"/><text x="200" y="315" text-anchor="middle" font-size="34" fill="white">AARTI SESSIONS</text></svg>';
const songs=[{id:'abc12345678',title:'Dhoonde Akhiyaan',artist:'Yasser Desai',duration:180,thumb:'https://img.aarti.test/one.svg'},{id:'xyz12345678',title:'Girl I Need You',artist:'Arijit Singh',duration:180,thumb:'https://img.aarti.test/two.svg'}];
function wav(){const size=44100*2*5,b=Buffer.alloc(44+size);b.write('RIFF');b.writeUInt32LE(36+size,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(44100,24);b.writeUInt32LE(88200,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(size,40);return b;}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true});
 fs.mkdirSync('test-results',{recursive:true});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let playlistStatus=200, playlistSearches=0,serial=0,failRadio=false;
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1')return route.continue();
  if(url.pathname.endsWith('/server.json'))return route.fulfill({json:{server:'https://api.aarti.test'}});
  if(url.hostname==='telegram.org')return route.fulfill({body:'',contentType:'text/javascript'});
  if(url.hostname==='img.aarti.test'||url.hostname==='i.ytimg.com')return route.fulfill({body:svg,contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*'}});
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/playlists'){playlistSearches++;return route.fulfill({status:playlistStatus,json:playlistStatus===200?{results:[{id:'PL1234567890abcdef',title:'Late night Hindi',by:'Evening sessions',thumb:songs[0].thumb}]}:{error:'unauthorised'},headers});}
  if(url.pathname==='/api/playlist')return route.fulfill({json:{id:'PL1234567890abcdef',title:'Late night Hindi',results:songs},headers});
  if(url.pathname==='/api/search'){
   if(url.searchParams.get('q')==='seed')return route.fulfill({json:{results:[songs[0]]},headers});
   if(failRadio)return route.fulfill({status:503,json:{error:'offline'},headers});
   const results=Array.from({length:24},()=>{const n=++serial;return {id:String(n).padStart(11,'0'),title:'Melody of '+String(n).padStart(6,'0'),artist:'Radio artist',duration:180,thumb:songs[0].thumb};});
   return route.fulfill({json:{results},headers});
  }
  if(url.pathname.startsWith('/api/stream/')){
    const bytes=wav(),range=route.request().headers()['range'];
    const m=range && /^bytes=(\d+)-(\d*)$/.exec(range);
    if(m){const start=Number(m[1]),end=m[2]?Math.min(Number(m[2]),bytes.length-1):bytes.length-1;return route.fulfill({status:206,body:bytes.subarray(start,end+1),contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${bytes.length}`}});}
    return route.fulfill({body:bytes,contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes'}});
  }
  return route.fulfill({status:404,json:{error:'not configured'},headers});
 });
 try{
  await page.addInitScript(()=>localStorage.setItem('aarti.profile.v1',JSON.stringify({name:'Ajay',languages:['Hindi'],artists:['Arijit Singh']})));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('[data-tab="Search"]').click();await page.locator('#q').fill('seed');await page.locator('#searchForm').evaluate(f=>f.requestSubmit());
  await page.locator('#results .row .info').first().click();
  await page.waitForFunction(()=>document.getElementById('audio').readyState>=4);
  await page.evaluate(()=>{const a=document.getElementById('audio');a.pause();a.currentTime=2;});
  await page.locator('#miniOpen').click();await page.waitForFunction(()=>document.getElementById('now').dataset.progress==='1.0000');
  await page.locator('#queueOpen').click();
  const compositor=await page.evaluate(()=>{const a=document.querySelector('#queueSheet .sheet-in').getAnimations()[0];
   return !!a && a.effect.getKeyframes().every(k=>Object.keys(k).every(key=>['offset','computedOffset','easing','composite','transform'].includes(key)));});
  assert(compositor,'release/tap spring must use a native transform animation');
  assert.equal(await page.locator('#queueSheet').evaluate(e=>e.style.getPropertyValue('--queue-veil')),'','no inherited per-frame CSS variable');
  await page.waitForFunction(()=>document.getElementById('queueSheet').dataset.progress==='1.0000');
  await page.waitForFunction(()=>document.querySelectorAll('#queueRows .q-row').length>=21);
  await page.evaluate(()=>window.originalRow=document.querySelector('#queueRows .q-row'));
  let previous=await page.locator('#queueRows .q-row').count();
  // Scrolling fetches new batches, without replacing existing rows or resetting position.
  for(let i=0;i<3;i++){
   await page.locator('#queueRows').evaluate(b=>{b.scrollTop=b.scrollHeight;b.dispatchEvent(new Event('scroll'));});
   await page.waitForFunction(n=>document.querySelectorAll('#queueRows .q-row').length>n,previous);
   previous=await page.locator('#queueRows .q-row').count();
  }
  assert(previous>=81);assert(await page.evaluate(()=>window.originalRow===document.querySelector('#queueRows .q-row')));
  const titles=await page.locator('#queueRows .q-row .title').allTextContents();assert.equal(new Set(titles).size,titles.length);
  await page.waitForFunction(()=>!document.querySelector('.queue-status').disabled);
  // Cached results may still supply a few valid songs while the server is down.
  failRadio=true;
  for(let attempt=0;attempt<6;attempt++){
   await page.locator('#queueRows').evaluate(b=>{b.scrollTop=b.scrollHeight;b.dispatchEvent(new Event('scroll'));});
   await page.waitForFunction(()=>!document.querySelector('.queue-status').disabled);
   if((await page.locator('.queue-status').textContent()).includes('Could not load'))break;
  }
  assert.match(await page.locator('.queue-status').textContent(),/Could not load/);
  previous=await page.locator('#queueRows .q-row').count();
  failRadio=false;await page.locator('.queue-status').click();await page.waitForFunction(n=>document.querySelectorAll('#queueRows .q-row').length>n,previous);
  await page.locator('#queueRows').evaluate(b=>{b.scrollTop=0;b.dispatchEvent(new Event('scroll'));});
  // The sheet stays at its actual dragged position on release and can be grabbed mid-spring.
  const header=await page.locator('#queueSheet .sheet-head').boundingBox(),x=header.x+40,y=header.y+10;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+170,{steps:12});
  const partial=Number(await page.locator('#queueSheet').getAttribute('data-progress'));assert(partial>0&&partial<1);
  await page.screenshot({path:'test-results/queue-drag.png'});await page.mouse.up();
  const released=Number(await page.locator('#queueSheet').getAttribute('data-progress'));assert(released<.95,'Release must not reset sheet to open');
  await page.waitForTimeout(40);const rect=await page.locator('#queueSheet .sheet-in').boundingBox();
  await page.mouse.move(5,790);await page.mouse.down();const held=await page.locator('#queueSheet').getAttribute('data-progress');await page.waitForTimeout(100);assert.equal(await page.locator('#queueSheet').getAttribute('data-progress'),held);
  await page.mouse.move(5,380,{steps:12});await page.mouse.up();await page.waitForFunction(()=>document.getElementById('queueSheet').dataset.progress==='1.0000');
  assert(Math.abs(await page.locator('#audio').evaluate(a=>a.currentTime)-2)<.2,'Queue gestures must not seek');
  await page.screenshot({path:'test-results/queue-open.png'});
  // Actual touch scrolling works inside the sheet, with pull-down dismissal only at the top.
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  async function swipe(x,y,dy){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy*i/12}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  await swipe(210,650,-220);await page.waitForFunction(()=>document.getElementById('queueRows').scrollTop>30);
  assert.equal(await page.locator('#queueSheet').getAttribute('data-progress'),'1.0000');
  // Let the swipe's fling finish first; otherwise it carries on after the
  // reset below and the next pull lands on a list that is no longer at the top.
  await page.waitForTimeout(1500);
  await page.waitForFunction(()=>new Promise(r=>{const b=document.getElementById('queueRows'),t=b.scrollTop;setTimeout(()=>r(b.scrollTop===t),400);}));
  await page.locator('#queueRows').evaluate(b=>{b.scrollTop=0;b.dispatchEvent(new Event('scroll'));});await page.waitForTimeout(200);
  assert.equal(await page.locator('#queueRows').evaluate(b=>b.scrollTop),0,'list is at the top before the pull');
  await page.evaluate(()=>{window.queueTouch=[];for(const name of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])document.getElementById('queueSheet').addEventListener(name,e=>window.queueTouch.push({type:name,y:e.clientY,target:e.target.className,scroll:document.getElementById('queueRows').scrollTop,action:document.getElementById('queueRows').style.touchAction,p:document.getElementById('queueSheet').dataset.progress}),true);});
  const list=await page.locator('#queueRows').boundingBox();await swipe(160,list.y+65,300);await page.waitForFunction(()=>!document.getElementById('queueSheet').classList.contains('open'));
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#queueOpen').click();assert.equal(await page.locator('#queueSheet').getAttribute('data-progress'),'1.0000');await page.locator('#queueClose').click();assert.equal(await page.locator('#queueSheet').getAttribute('data-progress'),'0.0000');
  assert.deepEqual(errors,[]);console.log('PASS: 80+ continuous recommendations, stable rows, retry, touch scroll, pull-dismiss, interruptible spring, no seek, reduced motion');
 }catch(error){console.error('Queue diagnostics',await page.evaluate(()=>({touch:window.queueTouch,count:document.querySelectorAll('#queueRows .q-row').length,status:document.querySelector('.queue-status')?.textContent,progress:document.getElementById('queueSheet')?.dataset.progress,scroll:document.getElementById('queueRows')?.scrollTop})));await page.screenshot({path:'test-results/queue-failure.png'});throw error;}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1)});
