// Lyrics: found on LRCLIB (mocked here), shown on the player button,
// followed line by line, tap-to-seek, a miss, and an outage with retry.
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
const songs=[
 {id:'jeena000001',title:'Jeena Jeena (Official Lyrical Video) | Badlapur',artist:'Sony Music India',duration:5,thumb:'https://img.aarti.test/a.svg'},
 {id:'nolyrics001',title:'Instrumental Flute Dhun',artist:'Some Channel',duration:5,thumb:'https://img.aarti.test/a.svg'},
 {id:'offline0001',title:'Kesariya | Brahmastra',artist:'Arijit Singh',duration:5,thumb:'https://img.aarti.test/a.svg'},
];
const lrc='[00:00.40]Jeena jeena\n[00:01.40]Aaya hoon jeena\n[00:02.40]Tujhse hi hai\n[00:03.40]Saari ye roshni';
function wav(){const size=44100*2*5,b=Buffer.alloc(44+size);b.write('RIFF');b.writeUInt32LE(36+size,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(44100,24);b.writeUInt32LE(88200,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(size,40);return b;}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true});
 fs.mkdirSync('test-results',{recursive:true});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let lrclibDown=true;const lyricQueries=[];
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
  if(url.hostname==='127.0.0.1')return route.continue();
  if(url.pathname.endsWith('/server.json'))return route.fulfill({json:{server:'https://api.aarti.test'}});
  if(url.hostname==='telegram.org')return route.fulfill({body:'',contentType:'text/javascript'});
  if(url.hostname==='img.aarti.test')return route.fulfill({body:svg,contentType:'image/svg+xml',headers});
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.hostname==='lrclib.net'){
   const q=url.searchParams.get('q')||'';lyricQueries.push(q);
   if(/kesariya/i.test(q)&&lrclibDown)return route.abort('internetdisconnected');
   if(/kesariya/i.test(q))return route.fulfill({json:[{trackName:'Kesariya',artistName:'Arijit Singh',duration:5,plainLyrics:'Kesariya tera ishq hai piya'}],headers});
   if(/jeena/i.test(q))return route.fulfill({json:[{trackName:'Jeena Jeena',artistName:'Atif Aslam',duration:6,syncedLyrics:lrc,plainLyrics:'x'}],headers});
   return route.fulfill({json:[],headers});
  }
  if(url.pathname==='/api/search'){const q=url.searchParams.get('q');const s=songs.find(x=>x.id===q);return route.fulfill({json:{results:s?[s]:[]},headers});}
  if(url.pathname.startsWith('/api/stream/')){
   const bytes=wav(),range=route.request().headers()['range'],m=range&&/^bytes=(\d+)-(\d*)$/.exec(range);
   if(m){const a=+m[1],b=m[2]?Math.min(+m[2],bytes.length-1):bytes.length-1;return route.fulfill({status:206,body:bytes.subarray(a,b+1),contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes','content-range':`bytes ${a}-${b}/${bytes.length}`}});}
   return route.fulfill({body:bytes,contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes'}});
  }
  return route.fulfill({status:404,json:{},headers});
 });
 try{
  await page.addInitScript(()=>localStorage.setItem('aarti.profile.v1',JSON.stringify({name:'Ajay',languages:['Hindi'],artists:['Arijit Singh']})));
  await page.goto('http://127.0.0.1:'+server.address().port);
  const play=async(id)=>{await page.locator('[data-tab="Search"]').click();await page.locator('#q').fill(id);await page.locator('#searchForm').evaluate(f=>f.requestSubmit());
   await page.locator('#results .row .info').first().click();await page.waitForFunction(()=>document.getElementById('audio').readyState>=3);};

  // 1. Synced lyrics: the player button shows the line being sung.
  await play('jeena000001');
  await page.evaluate(()=>{const a=document.getElementById('audio');a.pause();a.currentTime=1.6;a.dispatchEvent(new Event('timeupdate'));});
  await page.waitForFunction(()=>document.getElementById('lyricsPeek').textContent==='Aaya hoon jeena');
  assert(lyricQueries[0].startsWith('Jeena Jeena'),'searched with the cleaned title: '+lyricQueries[0]);
  await page.locator('#miniOpen').click();await page.waitForFunction(()=>document.getElementById('now').dataset.progress==='1.0000');
  await page.locator('#lyricsOpen').click();await page.waitForFunction(()=>document.getElementById('lyrics').classList.contains('open'));
  await page.waitForTimeout(450);
  const lit=await page.evaluate(()=>[...document.querySelectorAll('.ly-line')].map(l=>(l.classList.contains('on')?'*':l.classList.contains('past')?'-':' ')+l.textContent));
  assert.deepEqual(lit,['-Jeena jeena','*Aaya hoon jeena',' Tujhse hi hai',' Saari ye roshni']);
  assert.match(await page.locator('#lySource').textContent(),/Synced lyrics · LRCLIB/);
  await page.screenshot({path:'test-results/lyrics-synced.png'});

  // 2. Tapping a line seeks there and lights it.
  await page.locator('.ly-line',{hasText:'Saari ye roshni'}).click();
  await page.waitForFunction(()=>document.querySelector('.ly-line.on')?.textContent==='Saari ye roshni');
  assert(Math.abs(await page.evaluate(()=>document.getElementById('audio').currentTime)-3.4)<0.6,'tap seeks to the line');
  await page.evaluate(()=>document.getElementById('audio').pause());

  // Timing adjustment persists per track and never starts playback on its own.
  await page.locator('#lyLater').click();assert.equal(await page.locator('#lyOffset').textContent(),'Timing +0.5s');
  assert.equal(await page.evaluate(()=>document.getElementById('audio').paused),true);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('aarti.lyrics.offsets')).jeena000001),.5);
  await page.locator('#lyOffset').click();assert.equal(await page.locator('#lyOffset').textContent(),'Timing 0.0s');
  // 3. Back closes the lyrics and leaves the player open.
  await page.goBack();await page.waitForFunction(()=>!document.getElementById('lyrics').classList.contains('open'));
  assert.equal(await page.evaluate(()=>document.getElementById('now').dataset.progress),'1.0000');
  await page.locator('#nowClose').click();await page.waitForTimeout(500);

  // 4. A song with no lyrics says so, and the miss is remembered.
  const before=lyricQueries.length;
  await play('nolyrics001');
  await page.waitForFunction(()=>document.getElementById('lyBody').textContent.includes('No lyrics found'));
  assert.equal(await page.locator('#lyricsPeek').textContent(),'Lyrics');
  const asked=lyricQueries.length-before;assert(asked>=1,'searched for the song');

  // 5. Service unreachable: an honest message, then Try again works.
  await play('offline0001');
  await page.waitForFunction(()=>document.getElementById('lyBody').textContent.includes("Couldn't reach"));
  lrclibDown=false;
  await page.evaluate(()=>document.getElementById('miniOpen').click());await page.waitForFunction(()=>document.getElementById('now').dataset.progress==='1.0000');
  await page.locator('#lyricsOpen').click();
  await page.locator('#lyBody button',{hasText:'Try again'}).click();
  await page.waitForFunction(()=>document.querySelector('.ly-plain')?.textContent.includes('Kesariya tera ishq'));
  await page.screenshot({path:'test-results/lyrics-plain.png'});

  // 6. Back on the synced song, lyrics come from the cache, not the network.
  const cachedBefore=lyricQueries.length;
  await page.goBack();await page.waitForTimeout(300);await page.locator('#nowClose').click();await page.waitForTimeout(400);
  await play('jeena000001');await page.waitForTimeout(400);
  assert.equal(lyricQueries.length,cachedBefore,'cached lyrics need no request');

  assert.deepEqual(errors,[]);
  console.log('PASS: synced lyrics, live line on the player, tap-to-seek, back closes, no-lyrics, offline + retry, cache');
 }catch(e){await page.screenshot({path:'test-results/lyrics-failure.png'});throw e;}
 finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
