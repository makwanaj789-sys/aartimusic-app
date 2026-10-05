// Listening stats, the Daily Mix and the time-of-day mix, and smart shuffle.
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
 const queueTitles=async()=>{await page.evaluate(()=>document.getElementById('miniOpen').click());await page.waitForFunction(()=>document.getElementById('now').dataset.progress==='1.0000');
  await page.locator('#queueOpen').click();await page.waitForFunction(()=>document.getElementById('queueSheet').dataset.progress==='1.0000');
  const t=await page.evaluate(()=>[...document.querySelectorAll('#queueRows .q-row .title')].map(x=>x.textContent));
  await page.locator('#queueClose').click();await page.waitForTimeout(400);await page.locator('#nowClose').click();await page.waitForTimeout(500);return t;};
 try{
  await page.addInitScript(()=>localStorage.setItem('aarti.profile.v1',JSON.stringify({name:'Ajay',languages:['Gujarati'],artists:['Kirtidan Gadhvi']})));
  await page.goto('http://127.0.0.1:'+server.address().port);
  // Favourite three songs.
  await page.locator('[data-tab="Search"]').click();await page.locator('#q').fill('alphabet');await page.locator('#searchForm').evaluate(f=>f.requestSubmit());
  await page.locator('#results .row').nth(3).waitFor();
  for(let i=0;i<3;i++)await page.locator('#results .row').nth(i).locator('button.icon').first().click();

  // 1. Listening: 40 seconds of Alpha played forwards counts one play.
  await page.locator('#results .row .info').first().click();
  await page.waitForFunction(()=>document.getElementById('audio').readyState>=3);
  await page.evaluate(async()=>{const a=document.getElementById('audio');a.pause();a.currentTime=0;await a.play();a.pause();
    // drive time forward a second at a time, as playback would
    Object.defineProperty(a,'paused',{configurable:true,get:()=>false});
    for(let t=1;t<=40;t++){a.currentTime=t;a.dispatchEvent(new Event('timeupdate'));}
    // a jump is not listening
    a.currentTime=55;a.dispatchEvent(new Event('timeupdate'));
    delete a.paused;a.dispatchEvent(new Event('pause'));});
  await page.locator('[data-tab="Lib"]').click();
  await page.waitForFunction(()=>!document.getElementById('statsBlock').hidden);
  const stats=await page.evaluate(()=>({week:document.querySelector('.stats-big b').textContent,
    artist:document.querySelector('.stats-artist b')?.textContent,top:document.querySelector('#statsBlock .row .title')?.textContent,
    sub:document.querySelector('#statsBlock .row .sub')?.textContent,bars:document.querySelectorAll('.stats-bar').length}));
  assert.equal(stats.week,'1');assert.equal(stats.artist,'1. Kirtidan Gadhvi');assert.equal(stats.top,'Alpha Song');
  assert.match(stats.sub,/1 play$/);assert.equal(stats.bars,7);
  await page.locator('#statsBlock').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/stats.png'});

  // 2. Home: a Daily Mix from favourites + most played, and a mix for the hour.
  await page.locator('[data-tab="Home"]').click();
  await page.waitForSelector('.mix-card');
  const cards=await page.evaluate(()=>[...document.querySelectorAll('.mix-card b')].map(b=>b.textContent));
  assert.equal(cards[0],'Daily Mix');assert.match(cards[1],/^(Morning|Afternoon|Evening|Night) Mix$/);
  await page.locator('#mixBlock').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/mixes.png'});
  await page.locator('.mix-card').first().click();await page.waitForTimeout(600);
  let q=await queueTitles();
  assert(['Alpha Song','Bravo Song','Charlie Song'].includes(q[0]),'daily mix starts with one of ours: '+q[0]);
  assert.deepEqual(q.slice(0,3).sort(),['Alpha Song','Bravo Song','Charlie Song']);
  const before=searches.length;
  await page.locator('.mix-card').nth(1).click();
  await page.waitForFunction(()=>/Radio pick/.test(document.getElementById('mTitle').textContent));
  assert.match(searches.slice(before).join('|'),/Gujarati .*songs/);

  // 3. Smart shuffle: our three favourites with a new song after every three.
  await page.locator('#smartFavs').click();
  await page.waitForFunction(()=>document.getElementById('toast').textContent==='Smart shuffle');
  await page.waitForTimeout(800);
  q=await queueTitles();
  assert.deepEqual(q.slice(0,3).sort(),['Alpha Song','Bravo Song','Charlie Song']);
  assert.match(q[3],/^Radio pick/,'a new song after three favourites: '+q.slice(0,5).join(','));
  assert.deepEqual(errors,[]);
  console.log('PASS: listening stats (play after 30s, seek ignored), daily mix, time-of-day mix, smart shuffle');
 }catch(e){await page.screenshot({path:'test-results/stats-failure.png'});throw e;}
 finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
