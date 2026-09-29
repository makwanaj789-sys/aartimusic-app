const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const root=path.resolve('www');
const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.end('<!doctype html><body></body>');return;}res.setHeader('content-type',file.endsWith('.mp4')?'video/mp4':file.endsWith('.jpg')?'image/jpeg':file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base);await page.setContent('<dialog class="settings-drawer" open></dialog>');
  await page.addStyleTag({path:path.resolve('www/capsule.css')});
  await page.evaluate(()=>{
   window.testState={enabled:false,permitted:false,sessionActive:true,error:'',appearance:{media:'sunset'}};window.calls=[];window.saved=null;
   const api={status:async()=>({...testState}),requestPermission:async()=>{calls.push('permission');return {permitted:testState.permitted};},configure:async o=>{calls.push(o);if(window.failConfigure)throw Error('Could not save floating preference');testState.enabled=o.enabled;},setAppearance:async o=>{saved=o.appearance;testState.appearance=o.appearance;return saved;},pickMedia:async()=>window.picked||({cancelled:true}),syncModes:async()=>{}};
   window.Capacitor={isNativePlatform:()=>true,isPluginAvailable:n=>n==='FloatingCapsule',Plugins:{FloatingCapsule:api},convertFileSrc:s=>s};
  });
  await page.addScriptTag({path:path.resolve('www/capsule.js')});
  const intro=page.getByRole('dialog',{name:'Enable floating music player'});await intro.waitFor();assert.equal(await page.evaluate(()=>calls.includes('permission')),false);
  // Denied permission returns to the app without requiring the feature.
  await intro.getByRole('button',{name:'Allow floating player',exact:true}).click();await intro.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>testState.enabled),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('aarti.capsule.intro.v2')),'1');
  const checkbox=page.getByRole('checkbox',{name:'Show floating player when minimized'});assert(await checkbox.isDisabled());
  // A later grant enables automatically.
  await page.evaluate(()=>{testState.permitted=true;});await page.getByRole('button',{name:'Allow display over other apps'}).click();await page.waitForFunction(()=>testState.enabled);assert(await checkbox.isChecked());
  assert.equal(await page.evaluate(()=>calls.filter(x=>typeof x==='object').at(-1).reducedMotion),true);
  await page.getByRole('button',{name:'Customize glass player'}).click();const editor=page.getByRole('dialog',{name:'Customize floating player'});await editor.waitFor();
  await page.waitForFunction(()=>document.querySelector('.glass-media video')?.duration>1);
  assert(await page.locator('.glass-media video').evaluate(v=>v.muted&&v.paused),'Reduced motion freezes preview by default');
  for(const [label,value]of [['Width','285'],['Height','195'],['Crop zoom','1.5'],['Crop left / right','.8'],['Crop up / down','.2'],['Loop starts at','2'],['Loop ends at','6']]){await editor.getByRole('slider',{name:label,exact:true}).evaluate((node,value)=>{node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));},value);}
  assert((await page.locator('.glass-media video').getAttribute('style')).includes('translate('));
  await editor.getByRole('button',{name:'Save glass player'}).click();await editor.waitFor({state:'detached'});const saved=await page.evaluate(()=>saved);assert.equal(saved.width,285);assert.equal(saved.start,2);assert.equal(saved.end,6);assert.equal(saved.x,.8);assert.equal(saved.zoom,1.5);
  await page.getByRole('button',{name:'Customize glass player'}).click();await page.getByRole('button',{name:'Starlight',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.glass-media video')?.videoHeight>0);await page.getByRole('button',{name:'Choose your photo or video'}).click();assert.match(await page.locator('.capsule-editor [role=status]').textContent(),/cancelled/);await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.evaluate(()=>testState.appearance.media),'sunset','Cancelling does not overwrite saved selection');
  await page.getByRole('button',{name:'Customize glass player'}).click();await page.evaluate(url=>{window.picked={media:'custom',kind:'image',file:'00000000-0000-0000-0000-000000000001.media',previewUri:url};},base+'/capsule-media/sunset.jpg');await page.getByRole('button',{name:'Choose your photo or video'}).click();await page.waitForFunction(()=>document.querySelector('.glass-media img')?.naturalWidth>0);assert(await page.locator('.capsule-fields').last().isHidden());
  fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/glass-editor.png'});await page.getByRole('button',{name:'Save glass player'}).click();assert.equal(await page.evaluate(()=>saved.media),'custom');
  await page.evaluate(()=>{window.failConfigure=true;});await checkbox.click();await page.locator('.capsule-settings [role=status]').filter({hasText:'Could not save floating preference'}).waitFor();assert(await checkbox.isChecked());
  await page.evaluate(()=>{testState.permitted=false;dispatchEvent(new Event('focus'));});await page.waitForFunction(()=>document.querySelector('.capsule-toggle input').disabled);
  assert.deepEqual(errors,[]);
  // Fresh installation: Skip also advances without opening Android settings.
  await page.evaluate(()=>{localStorage.removeItem('aarti.capsule.intro.v2');document.body.innerHTML='<dialog class="settings-drawer" open></dialog>';failConfigure=false;});await page.addScriptTag({path:path.resolve('www/capsule.js')});await page.getByRole('button',{name:'Not now · continue without floating'}).click();assert.equal(await page.locator('.capsule-intro').count(),0);
  console.log('PASS: first launch allow/deny/skip, auto-enable, crop + temporal trim, cancel, reduced motion, permission revocation and save failure');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
