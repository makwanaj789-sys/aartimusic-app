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
 let playlistStatus=200, playlistSearches=0;
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
  if(url.pathname==='/api/search')return route.fulfill({json:{results:songs},headers});
  if(url.pathname.startsWith('/api/stream/'))return route.fulfill({body:wav(),contentType:'audio/wav',headers});
  return route.fulfill({status:404,json:{error:'not configured'},headers});
 });
 try{
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('.profile-dialog[open]').waitFor();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  assert(await page.locator('.pref-error').textContent(),'Name cannot be skipped');
  await page.locator('#profileName').fill('Ajay');
  await page.screenshot({path:'test-results/profile.png'});
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.locator('.language-choice').filter({hasText:'Japanese'}).click();
  await page.locator('.language-choice').filter({hasText:'Punjabi'}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'YOASOBI',exact:true}).click();
  await page.getByRole('button',{name:'Let’s listen',exact:true}).click();
  await page.locator('#discovery .discovery-card').first().waitFor();
  await page.waitForTimeout(2000);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('aarti.profile.v1')).name),'Ajay');
  await page.locator('[data-tab="Search"]').click();
  await page.locator('#searchDiscovery .discovery-song').first().waitFor();
  await page.locator('#q').fill('Dho');
  await page.locator('#searchSuggestions button').first().waitFor();
  await page.screenshot({path:'test-results/search-suggestions.png'});
  await page.locator('#q').fill('');
  await page.locator('[data-tab="Lists"]').click();
  await page.locator('#listDiscovery .discovery-card').first().waitFor();
  await page.screenshot({path:'test-results/playlist-suggestions.png'});
  await page.locator('[data-tab="Home"]').click();
  assert(playlistSearches>0,'Home automatically requests playlists');
  await page.waitForFunction(()=>document.getElementById('boot').hidden);
  assert.equal(await page.locator('#boot').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
  await page.screenshot({path:'test-results/home.png',fullPage:true});
  await page.locator('.discovery-song').first().click();
  await page.waitForFunction(()=>!document.getElementById('mini').hidden);
  await page.evaluate(()=>{document.getElementById('audio').pause();window.originalArtwork=document.getElementById('nArt');});
  await page.waitForFunction(()=>document.getElementById('audio').readyState>=4);
  await page.evaluate(()=>{const a=document.getElementById('audio');a.pause();a.currentTime=2;});
  await page.waitForFunction(()=>!document.getElementById('audio').seeking);
  await page.locator('#discovery .discovery-song').first().click();
  assert(Math.abs(await page.locator('#audio').evaluate(a=>a.currentTime)-2)<.15,'Same-song tap must preserve time: '+await page.locator('#audio').evaluate(a=>JSON.stringify({time:a.currentTime,paused:a.paused,src:a.src})));
  await page.waitForFunction(()=>Number(document.getElementById('now').dataset.progress)===1);
  assert(await page.evaluate(()=>window.originalArtwork===document.getElementById('nArt')));
  assert.equal(await page.locator('#nArt').count(),1);
  await page.screenshot({path:'test-results/player.png'});
  // Vertical movement starting on the seeker is not a seek.
  const seekBox=await page.locator('#seekRail').boundingBox();
  await page.mouse.move(seekBox.x+seekBox.width*.8,seekBox.y+seekBox.height/2);await page.mouse.down();
  await page.mouse.move(seekBox.x+seekBox.width*.85,seekBox.y-140,{steps:12});await page.mouse.up();
  assert(Math.abs(await page.locator('#audio').evaluate(a=>a.currentTime)-2)<.15,'Vertical seeker gesture must preserve time');
  // A partial drag must move the cover continuously before release.
  let box=await page.locator('#sharedArt').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2+120,{steps:8});
  let progress=await page.locator('#now').getAttribute('data-progress');assert(Number(progress)>0&&Number(progress)<1);
  const smaller=await page.locator('#sharedArt').boundingBox();assert(smaller.width<box.width);
  await page.screenshot({path:'test-results/drag.png'});
  await page.waitForTimeout(150);await page.mouse.up();
  await page.waitForTimeout(900);
  await page.locator('#nowClose').click();await page.waitForFunction(()=>Number(document.getElementById('now').dataset.progress)===0);
  // Upward drag expands the same cover, a slow release settles by distance.
  box=await page.locator('#sharedArt').boundingBox();
  await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await page.mouse.move(box.x+20,box.y-360,{steps:18});
  assert(Number(await page.locator('#now').getAttribute('data-progress'))>.5);
  await page.mouse.up();await page.waitForFunction(()=>Number(document.getElementById('now').dataset.progress)===1);
  // Grabbing a closing spring freezes the progress until the finger moves.
  await page.locator('#nowClose').click();await page.waitForTimeout(80);
  box=await page.locator('#sharedArt').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  const held=Number(await page.locator('#now').getAttribute('data-progress'));
  await page.waitForTimeout(120);
  assert.equal(Number(await page.locator('#now').getAttribute('data-progress')),held);
  await page.mouse.move(box.x+box.width/2,Math.max(20,box.y-240),{steps:12});await page.mouse.up();
  await page.waitForFunction(()=>Number(document.getElementById('now').dataset.progress)===1);
  // Portrait screens with less vertical space must keep artwork above metadata.
  await page.setViewportSize({width:360,height:640});await page.waitForTimeout(100);
  box=await page.locator('#sharedArt').boundingBox();
  const meta=await page.locator('#now .now-meta').boundingBox();
  assert(box.y+box.height<=meta.y,'Cover must not overlap title on short screens');
  await page.screenshot({path:'test-results/player-small.png'});
  await page.setViewportSize({width:390,height:844});
  // Existing favourites / shuffle / repeat / queue retain their handlers.
  await page.locator('#nFav').click();assert(await page.locator('#nFav').evaluate(e=>e.classList.contains('fav')));
  await page.locator('#bShuffle').click();assert(await page.locator('#bShuffle').evaluate(e=>e.classList.contains('on')));
  await page.locator('#bRepeat').click();assert(await page.locator('#bRepeat').evaluate(e=>e.classList.contains('on')));
  await page.locator('#queueOpen').click();await page.waitForFunction(()=>document.getElementById('queueSheet').classList.contains('open'));
  await page.keyboard.press('Escape');
  await page.evaluate(()=>history.back());await page.waitForTimeout(500);
  if(await page.locator('#queueSheet').evaluate(e=>e.classList.contains('open')))await page.locator('#queueSheet').click({position:{x:5,y:5}});
  await page.locator('#nowClose').click();await page.waitForFunction(()=>Number(document.getElementById('now').dataset.progress)===0);
  // Reduced motion snaps both tap and release; dragging still tracks the finger.
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#miniOpen').click();assert.equal(await page.locator('#now').getAttribute('data-progress'),'1.0000');
  await page.locator('#nowClose').click();assert.equal(await page.locator('#now').getAttribute('data-progress'),'0.0000');
  // No silent discovery error on an uncached mood.
  playlistStatus=401;await page.locator('#discovery').getByRole('button',{name:'Punjabi',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.discovery-status').textContent.includes('Access denied'));
  // Cold start restores the queue and paused position without autoplay.
  await page.evaluate(()=>{const a=document.getElementById('audio');a.pause();a.currentTime=2;a.dispatchEvent(new Event('seeked'));});
  await page.reload();
  await page.waitForFunction(()=>document.getElementById('audio').readyState>=1 && document.getElementById('audio').currentTime>1.8);
  assert(await page.locator('#audio').evaluate(a=>a.paused),'Restored audio must wait for Play');
  assert.equal(await page.locator('.profile-dialog[open]').count(),0,'Onboarding must only run once');
  await page.locator('#profileMenu').click();await page.locator('.settings-drawer[open]').waitFor();
  await page.getByRole('button',{name:'Grove',exact:true}).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'green');
  await page.screenshot({path:'test-results/settings.png'});
  await page.getByRole('button',{name:'Edit profile & music preferences',exact:true}).click();
  await page.locator('#profileName').fill('Ajay Music');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Let’s listen',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('aarti.profile.v1')).name),'Ajay Music');
  assert.deepEqual(errors,[]);
  console.log('PASS: automatic discovery, same-artwork tap/drag/reduced-motion, favourites, shuffle/repeat, queue, explicit errors');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1)});
