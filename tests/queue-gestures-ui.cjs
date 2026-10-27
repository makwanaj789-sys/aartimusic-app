// Swipe a row to play it next / queue it; inside the queue swipe to
// move up or remove, and drag the handle to reorder. Plus the fades.
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
const SECONDS=30;
function wav(){const size=8000*SECONDS,b=Buffer.alloc(44+size);b.write('RIFF');b.writeUInt32LE(36+size,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(8000,28);b.writeUInt16LE(1,32);b.writeUInt16LE(8,34);b.write('data',36);b.writeUInt32LE(size,40);b.fill(128,44);return b;}
const song=(n,t)=>({id:'song'+String(n).padStart(7,'0'),title:t,artist:'Artist '+n,duration:200,thumb:'https://img.aarti.test/a.svg'});
const results=['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel'].map((t,i)=>song(i+1,t+' Song'));
let radio=100;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true});
 fs.mkdirSync('test-results',{recursive:true});
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 const page=await ctx.newPage();
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
  if(url.pathname==='/api/search'){
   if(url.searchParams.get('q')==='alphabet')return route.fulfill({json:{results},headers});
   return route.fulfill({json:{results:Array.from({length:12},()=>song(++radio,'Radio pick '+radio))},headers});
  }
  if(url.pathname.startsWith('/api/stream/')){
   const bytes=wav(),range=route.request().headers()['range'],m=range&&/^bytes=(\d+)-(\d*)$/.exec(range);
   if(m){const a=+m[1],b=m[2]?Math.min(+m[2],bytes.length-1):bytes.length-1;return route.fulfill({status:206,body:bytes.subarray(a,b+1),contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes','content-range':`bytes ${a}-${b}/${bytes.length}`}});}
   return route.fulfill({body:bytes,contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes'}});
  }
  return route.fulfill({status:404,json:{},headers});
 });
 const cdp=await ctx.newCDPSession(page);
 async function drag(x,y,dx,dy,steps=14){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=steps;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/steps,y:y+dy*i/steps}]});await new Promise(r=>setTimeout(r,16));}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(380);}
 const rowAt=async(sel,i)=>{const b=await page.locator(sel).nth(i).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2,b};};
 const queueTitles=()=>page.evaluate(()=>[...document.querySelectorAll('#queueRows .q-row .title')].map(t=>t.textContent));
 const playingTitle=()=>page.evaluate(()=>document.querySelector('#queueRows .q-row.q-now .title')?.textContent);
 try{
  await page.addInitScript(()=>localStorage.setItem('aarti.profile.v1',JSON.stringify({name:'Ajay',languages:['Hindi'],artists:['Arijit Singh']})));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('[data-tab="Search"]').click();await page.locator('#q').fill('alphabet');await page.locator('#searchForm').evaluate(f=>f.requestSubmit());
  await page.locator('#results .row').nth(7).waitFor();
  await page.locator('#results .row .info').first().click();
  await page.waitForFunction(()=>document.getElementById('audio').readyState>=3);
  await page.evaluate(()=>document.getElementById('audio').pause());

  // 1. Search row swiped right: plays next.
  let r=await rowAt('#results .row',2);await drag(r.x-60,r.y,180,4);
  assert.equal(await page.locator('#toast').textContent(),'Playing next');
  assert.match(await page.locator('#upNextLabel').textContent(),/Up next · Charlie Song/);
  // 2. Swiped left: added to the end of the queue.
  r=await rowAt('#results .row',4);await drag(r.x+60,r.y,-180,4);
  assert.equal(await page.locator('#toast').textContent(),'Added to queue');
  // 2b. A swipe that starts on the heart queues the song but does not like it.
  const heart=page.locator('#results .row').nth(5).locator('button.icon').first();
  const liked=await heart.getAttribute('aria-pressed');const hb=await heart.boundingBox();
  await drag(hb.x+hb.width/2,hb.y+hb.height/2,-180,3);
  assert.equal(await page.locator('#toast').textContent(),'Added to queue');
  assert.equal(await heart.getAttribute('aria-pressed'),liked,'swipe from the heart does not toggle it');
  // 3. A short sideways nudge does nothing, and neither does it start a song.
  const before=await page.evaluate(()=>document.getElementById('audio').src);
  r=await rowAt('#results .row',6);await drag(r.x,r.y,40,2);
  assert.equal(await page.evaluate(()=>document.getElementById('audio').src),before,'a nudge is not a tap');
  // 4. Vertical stays a scroll: the page scrolls and no action fires.
  await page.evaluate(()=>document.getElementById('toast').textContent='');
  await page.setViewportSize({width:390,height:420});
  r=await rowAt('#results .row',3);await drag(r.x,r.y+60,8,-220,10);
  assert.equal(await page.locator('#toast').textContent(),'','vertical drag fires no swipe');
  await page.setViewportSize({width:390,height:844});

  // 5. In the queue: the added song is last, Charlie is up next.
  await page.locator('#miniOpen').click();await page.waitForFunction(()=>document.getElementById('now').dataset.progress==='1.0000');
  await page.locator('#queueOpen').click();await page.waitForFunction(()=>document.getElementById('queueSheet').dataset.progress==='1.0000');
  let q=await queueTitles();
  assert.equal(q[0],'Alpha Song');assert.equal(q[1],'Charlie Song');assert(q.includes('Echo Song'));
  await page.screenshot({path:'test-results/queue-gestures-open.png'});
  // swipe left on a row removes it
  const victim=q[3];r=await rowAt('#queueRows .q-row',3);await drag(r.x+60,r.y,-180,3);
  assert.equal(await page.locator('#toast').textContent(),'Removed from queue');
  q=await queueTitles();assert(!q.includes(victim),'removed '+victim);
  // swipe right on a later row moves it up next
  const lift=q[4];r=await rowAt('#queueRows .q-row',4);await drag(r.x-60,r.y,180,3);
  q=await queueTitles();assert.equal(q[1],lift,'moved up next');
  assert.equal(await playingTitle(),'Alpha Song','the playing song stays');
  // the playing song itself can't be removed
  r=await rowAt('#queueRows .q-row',0);await drag(r.x+60,r.y,-180,3);
  assert.equal(await page.locator('#toast').textContent(),'That one is playing');

  // 6. Drag a handle from row 3 to above row 1.
  const third=q[3];const h=await page.locator('#queueRows .q-row .q-handle').nth(3).boundingBox();
  const rowH=(await page.locator('#queueRows .q-row').nth(1).boundingBox()).height;
  await drag(h.x+h.width/2,h.y+h.height/2,0,-rowH*2.1,16);
  q=await queueTitles();assert.equal(q[1],third,'dragged into place: '+q.slice(0,5).join(','));
  assert.equal(await playingTitle(),'Alpha Song');
  // dragging the playing song keeps it playing, at its new place
  const h0=await page.locator('#queueRows .q-row .q-handle').nth(0).boundingBox();
  await drag(h0.x+h0.width/2,h0.y+h0.height/2,0,rowH*1.1,12);
  q=await queueTitles();assert.equal(q[1],'Alpha Song');assert.equal(await playingTitle(),'Alpha Song');
  assert.match(await page.locator('#upNextLabel').textContent(),new RegExp('Up next · '+q[2].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  await page.screenshot({path:'test-results/queue-gestures-after.png'});

  // 7. Fades: in over the first second, out over the last four, and
  // "end of this track" sleep lowers the last ten seconds.
  const vol=(t)=>page.evaluate(async t=>{const a=document.getElementById('audio');a.currentTime=t;await new Promise(r=>a.addEventListener('seeked',r,{once:true}));return Math.round(a.volume*100)/100;},t);
  assert.equal(await vol(0.3),0.25);
  assert.equal(await vol(12),1);
  assert.equal(await vol(28),0.5);
  await page.evaluate(()=>{document.getElementById('queueClose').click();});await page.waitForTimeout(400);
  await page.locator('#nowMenu').click();await page.locator('[data-sleep="track"]').click();
  assert.equal(await vol(22),0.8);
  assert.equal(await vol(15),1);
  assert.deepEqual(errors,[]);
  console.log('PASS: swipe to play next / queue, nudge and scroll ignored, queue swipe remove / up next, drag reorder, fades');
 }catch(e){await page.screenshot({path:'test-results/queue-gestures-failure.png'});throw e;}
 finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
