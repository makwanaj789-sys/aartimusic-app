// Canvas: a short silent loop from the song's video (or, without one, a
// moving picture from the cover's colours) replaces the cover in the
// player; a tap shows the cover; colours-only and off; it stops drawing
// when unseen or when motion is reduced.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
const root=path.resolve(__dirname,'../www');
const server=http.createServer((req,res)=>{
 const p=decodeURIComponent(req.url.split('?')[0]),file=path.join(root,p==='/'?'index.html':p);
 if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404).end();return;}
 const ext=path.extname(file);res.setHeader('content-type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[ext]||'application/octet-stream');res.end(fs.readFileSync(file));
});
const cover=c=>`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="${c}"/><circle cx="80" cy="40" r="30" fill="#f0a020"/></svg>`;
function wav(){const n=8000*30,b=Buffer.alloc(44+n);b.write('RIFF');b.writeUInt32LE(36+n,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(8000,28);b.writeUInt16LE(1,32);b.writeUInt16LE(8,34);b.write('data',36);b.writeUInt32LE(n,40);b.fill(128,44);return b;}
const clipBytes=fs.readFileSync(path.join(__dirname,'fixtures/canvas-clip.webm'));const clipAsked=[],shapes=[];
const song=(n,c)=>({id:'song'+String(n).padStart(7,'0'),title:'Track '+n,artist:'Artist '+n,duration:200,thumb:'https://img.aarti.test/'+c.slice(1)+'.svg'});
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
  if(url.pathname.endsWith('/server.json'))return route.fulfill({json:{server:'https://api.aarti.test'},headers});
  if(url.hostname==='telegram.org')return route.fulfill({body:'',contentType:'text/javascript'});
  if(url.hostname==='img.aarti.test')return route.fulfill({body:cover('#'+url.pathname.slice(1,7)),contentType:'image/svg+xml',headers});
  if(url.hostname==='lrclib.net')return route.fulfill({json:[],headers});
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/search'||url.pathname==='/api/playlists')return route.fulfill({json:{results:[song(1,'#7a1fa8'),song(2,'#127a5c'),song(3,'#a81f3c')]},headers});
  if(url.pathname.startsWith('/api/canvas/')){
   const id=url.pathname.split('/').pop();clipAsked.push(id);shapes.push(url.searchParams.get('shape')||'tall');
   // Only the first song has a clip; the second has none.
   if(id!=='song0000001')return route.fulfill({status:404,json:{error:'no canvas'},headers});
   return route.fulfill({body:clipBytes,contentType:'video/webm',headers});
  }
  if(url.pathname.startsWith('/api/stream/')){
   const bytes=wav(),range=route.request().headers()['range'],m=range&&/^bytes=(\d+)-(\d*)$/.exec(range);
   if(m){const a=+m[1],b=m[2]?Math.min(+m[2],bytes.length-1):bytes.length-1;return route.fulfill({status:206,body:bytes.subarray(a,b+1),contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes','content-range':`bytes ${a}-${b}/${bytes.length}`}});}
   return route.fulfill({body:bytes,contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes'}});
  }
  return route.fulfill({status:404,json:{},headers});
 });
 const artOpacity=()=>page.evaluate(()=>+getComputedStyle(document.getElementById('nArt')).opacity);
 const pixels=()=>page.evaluate(()=>{const c=document.getElementById('nowCanvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let s=0,mn=255,mx=0;for(let i=0;i<d.length;i+=16){const v=d[i]+d[i+1]+d[i+2];s+=v;mn=Math.min(mn,v);mx=Math.max(mx,v);}return {sum:s,spread:mx-mn};});
 try{
  await page.addInitScript(()=>localStorage.setItem('aarti.profile.v1',JSON.stringify({name:'Ajay',languages:['Hindi'],artists:['Arijit Singh']})));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('[data-tab="Search"]').click();await page.locator('#q').fill('x');await page.locator('#searchForm').evaluate(f=>f.requestSubmit());
  await page.locator('#results .row .info').first().click();
  await page.waitForFunction(()=>!document.getElementById('audio').paused);
  // 1. Closed player: nothing is drawn.
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#now .now-canvas')).display),'block');
  assert.deepEqual(clipAsked,[],'no clip is fetched while the player is closed');
  // 2. Open: the canvas moves, the cover and its blurred copy are gone.
  await page.locator('#miniOpen').click();await page.waitForFunction(()=>document.getElementById('now').dataset.progress==='1.0000');
  await page.waitForTimeout(800);
  const a=await pixels();await page.waitForTimeout(600);const b=await pixels();
  assert(a.spread>20,'the canvas has shapes, not a flat fill');
  assert.notEqual(a.sum,b.sum,'the canvas moves');
  assert(await artOpacity()<0.05,'the cover is hidden behind the canvas');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('nowBg')).visibility),'hidden');
  // The song's clip plays over the colours, silent and looping.
  await page.waitForFunction(()=>document.getElementById('nowCanvasVideo').classList.contains('shown'),null,{timeout:10000});
  const v=await page.evaluate(()=>{const e=document.getElementById('nowCanvasVideo');return {muted:e.muted,loop:e.loop,paused:e.paused,src:e.src};});
  assert.deepEqual([v.muted,v.loop,v.paused],[true,true,false]);
  assert.match(v.src,/\/api\/canvas\/song0000001\?/);
  // The clip covers the whole player by its own size, whatever its shape.
  const fit=await page.evaluate(()=>{const v=document.getElementById('nowCanvasVideo').getBoundingClientRect(),b=document.querySelector('#now .now-canvas').getBoundingClientRect();
    return {covers:v.left<=b.left+.5&&v.top<=b.top+.5&&v.right>=b.right-.5&&v.bottom>=b.bottom-.5,shape:(v.width/v.height).toFixed(2),box:[b.width,b.height]};});
  assert(fit.covers,'the clip leaves no band: '+JSON.stringify(fit));
  assert.equal(fit.shape,'1.78','sized from its own proportions, not stretched');
  await page.screenshot({path:'test-results/canvas.png'});
  // An upright window asks for the tall clip; made wide, it asks for the wide one, and back.
  assert.deepEqual(shapes,['tall']);
  await page.setViewportSize({width:1180,height:700});
  await page.waitForFunction(()=>/shape=wide/.test(document.getElementById('nowCanvasVideo').src),null,{timeout:5000});
  await page.waitForFunction(()=>document.getElementById('nowCanvasVideo').classList.contains('shown'),null,{timeout:10000});
  const wide=await page.evaluate(()=>{const v=document.getElementById('nowCanvasVideo').getBoundingClientRect();return v.left<=.5&&v.top<=.5&&v.right>=innerWidth-.5&&v.bottom>=innerHeight-.5;});
  assert(wide,'the wide clip covers the wide window');
  await page.screenshot({path:'test-results/canvas-wide.png'});
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>!/shape=wide/.test(document.getElementById('nowCanvasVideo').src),null,{timeout:5000});
  await page.waitForFunction(()=>document.getElementById('nowCanvasVideo').classList.contains('shown'),null,{timeout:10000});
  assert.deepEqual(shapes,['tall','wide','tall']);
  // Pausing the song pauses the clip.
  await page.evaluate(()=>document.getElementById('audio').pause());await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>document.getElementById('nowCanvasVideo').paused),true);
  await page.evaluate(()=>document.getElementById('audio').play());await page.waitForTimeout(300);
  // 3. A tap where the cover was shows it; closing brings the canvas back.
  await page.locator('#sharedArt').click();await page.waitForTimeout(450);
  assert(await artOpacity()>0.95,'a tap shows the cover');
  await page.screenshot({path:'test-results/canvas-peek.png'});
  await page.locator('#sharedArt').click();await page.waitForTimeout(450);
  assert(await artOpacity()<0.05,'a second tap hides it again');
  // 4. Each song has its own colours.
  const first=await pixels();
  await page.locator('#nNext').click();await page.waitForTimeout(1800);
  assert.notEqual((await pixels()).sum,first.sum);
  // No clip for this song: the colours stay.
  assert(clipAsked.includes('song0000002'));
  assert.equal(await page.evaluate(()=>document.getElementById('nowCanvasVideo').classList.contains('shown')),false);
  await page.screenshot({path:'test-results/canvas-next.png'});
  // 5. Reduced motion: one still frame, no animation.
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(300);
  const s1=await pixels();await page.waitForTimeout(700);
  assert.equal((await pixels()).sum,s1.sum,'reduced motion holds still');
  await page.emulateMedia({reducedMotion:'no-preference'});
  // 6. Colours only: no clip is fetched.
  await page.locator('#nowMenu').click();await page.waitForTimeout(400);
  await page.locator('[data-canvas="colour"]').click();
  assert.equal(await page.locator('#toast').textContent(),'Canvas: colours');
  await page.locator('#sleepSheet').click({position:{x:10,y:10}});await page.waitForTimeout(400);
  const asked=clipAsked.length;await page.locator('#nNext').click();await page.waitForTimeout(1200);
  assert.equal(clipAsked.length,asked,'colours only never asks for a clip');
  assert(await artOpacity()<0.05,'the cover stays hidden with colours only');
  // 7. Switched off: the cover is back and nothing is drawn.
  await page.locator('#nowMenu').click();await page.waitForFunction(()=>document.getElementById('sleepSheet').classList.contains('open')||document.getElementById('sleepSheet').getAttribute('aria-hidden')==='false');
  await page.locator('[data-canvas="off"]').click();
  assert.equal(await page.locator('#toast').textContent(),'Canvas off');
  await page.locator('#sleepSheet').click({position:{x:10,y:10}});await page.waitForTimeout(500);
  assert(await artOpacity()>0.95,'the cover is back');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#now .now-canvas')).display),'none');
  assert.equal(await page.evaluate(()=>document.getElementById('nowCanvasVideo').paused),true);
  await page.reload();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('aarti.v1')).canvas),'off','the choice is kept');
  assert.deepEqual(errors,[]);
  console.log('PASS: canvas clip plays over the colours (only while open, paused with the song), colours when none, tap shows the cover, colours-only, off');
 }catch(e){await page.screenshot({path:'test-results/canvas-failure.png'});throw e;}
 finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
