// Favourites of a version made in the bot ("<videoId>~slowed") show the
// original's picture, play under their own id, and never hand the lock
// screen an artwork address that is not a real one.
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
const favs=[
 {id:'abcdEFGH_12~slowed',title:'Radha Rani Lage (Slowed)',artist:'Simpal Kharel',duration:200,thumb:'https://i.ytimg.com/vi/abcdEFGH_12~slowed/hqdefault.jpg',at:3},
 {id:'zyxwVUTS-98',title:'No Picture Song',artist:'Someone',duration:200,at:2},
];
const streamed=[],images=[];
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
  if(url.hostname==='i.ytimg.com'){images.push(url.pathname);return route.fulfill({body:svg,contentType:'image/svg+xml',headers});}
  if(url.hostname==='lrclib.net')return route.fulfill({json:[],headers});
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/search'||url.pathname==='/api/playlists')return route.fulfill({json:{results:[]},headers});
  if(url.pathname.startsWith('/api/stream/')){
   streamed.push(decodeURIComponent(url.pathname.split('/').pop()));
   const bytes=wav(),range=route.request().headers()['range'],m=range&&/^bytes=(\d+)-(\d*)$/.exec(range);
   if(m){const a=+m[1],b=m[2]?Math.min(+m[2],bytes.length-1):bytes.length-1;return route.fulfill({status:206,body:bytes.subarray(a,b+1),contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes','content-range':`bytes ${a}-${b}/${bytes.length}`}});}
   return route.fulfill({body:bytes,contentType:'audio/wav',headers:{...headers,'accept-ranges':'bytes'}});
  }
  return route.fulfill({status:404,json:{},headers});
 });
 const fake=()=>{window.__meta=[];const ok=()=>Promise.resolve();
   const ms={setMetadata:m=>{__meta.push(m);return ok();},setPlaybackState:ok,setPositionState:ok,setActionHandler:ok};
   window.Capacitor={isNativePlatform:()=>true,isPluginAvailable:n=>n==='MediaSession',Plugins:{MediaSession:ms}};};
 try{
  await page.addInitScript(()=>localStorage.setItem('aarti.profile.v1',JSON.stringify({name:'Ajay',languages:['Hindi'],artists:['Arijit Singh']})));
  await page.addInitScript(f=>{if(!localStorage.getItem('aarti.v1'))localStorage.setItem('aarti.v1',JSON.stringify({favs:f}));},favs);
  await page.addInitScript(fake);
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('[data-tab="Lib"]').click();
  await page.locator('#libRows .row').nth(1).waitFor();
  const src=await page.locator('#libRows .row img').first().getAttribute('src');
  assert.equal(src,'https://i.ytimg.com/vi/abcdEFGH_12/hqdefault.jpg','the edit shows the original video\'s picture');

  // 1. The edit plays under its own id, and the lock screen gets the original's picture.
  await page.locator('#libRows .row .info').first().click();
  await page.waitForFunction(()=>document.getElementById('audio').readyState>=3,null,{timeout:15000});
  assert.equal(streamed.at(-1),'abcdEFGH_12~slowed','the bot is asked for the edit itself');
  await page.waitForFunction(()=>__meta.length>0);
  assert.deepEqual((await page.evaluate(()=>__meta.at(-1))).artwork.map(a=>a.src),['https://i.ytimg.com/vi/abcdEFGH_12/hqdefault.jpg']);

  // 2. A song without any picture sends no artwork at all.
  await page.evaluate(()=>document.getElementById('audio').pause());
  await page.locator('#libRows .row .info').nth(1).click();
  await page.waitForFunction(()=>__meta.at(-1).title==='No Picture Song');
  assert.deepEqual((await page.evaluate(()=>__meta.at(-1))).artwork,[]);

  // 3. Starting again restores the last song without trouble.
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForFunction(()=>!document.getElementById('mini').hidden,null,{timeout:15000});
  assert(!images.some(p=>p.includes('~')),'no picture is ever asked for under an edit\'s id');
  assert.deepEqual(errors,[]);
  console.log('PASS: bot edits show the original picture, play under their own id; missing artwork is never sent');
 }catch(e){await page.screenshot({path:'test-results/effect-favs-failure.png'});throw e;}
 finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
