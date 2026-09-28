const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setContent('<dialog class="settings-drawer" open></dialog>');
  await page.evaluate(()=>{
   window.testState={enabled:false,permitted:false,sessionActive:true,error:''};
   window.calls=[];
   const api={status:async()=>({...testState}),requestPermission:async()=>calls.push('permission'),configure:async options=>{
    calls.push(options);if(window.failConfigure)throw Error('Could not save floating preference');testState.enabled=options.enabled;
   }};
   window.Capacitor={isNativePlatform:()=>true,isPluginAvailable:n=>n==='FloatingCapsule',Plugins:{FloatingCapsule:api}};
  });
  await page.addScriptTag({path:path.resolve('www/capsule.js')});
  const checkbox=page.getByRole('checkbox');
  await checkbox.waitFor();
  assert(await checkbox.isDisabled());
  assert.deepEqual(await page.evaluate(()=>calls),[],'Never requests permission or enables itself on startup');
  await page.getByRole('button',{name:'Allow display over other apps'}).click();
  assert.deepEqual(await page.evaluate(()=>calls),['permission']);
  await page.evaluate(()=>{testState.permitted=true;dispatchEvent(new Event('focus'));});
  await page.waitForFunction(()=>!document.querySelector('input').disabled);
  await checkbox.check();
  await page.waitForFunction(()=>testState.enabled);
  assert.equal(await page.evaluate(()=>calls.at(-1).reducedMotion),true);
  await page.evaluate(()=>{testState.permitted=false;dispatchEvent(new Event('focus'));});
  await page.waitForFunction(()=>document.querySelector('input').disabled);
  await page.evaluate(()=>{testState.permitted=true;window.failConfigure=true;dispatchEvent(new Event('focus'));});
  await page.waitForFunction(()=>!document.querySelector('input').disabled);
  await checkbox.uncheck();
  await page.getByRole('status').filter({hasText:'Could not save floating preference'}).waitFor();
  assert(await checkbox.isChecked(),'Failed preference is not presented as saved');
  const web=await browser.newPage();await web.setContent('<dialog class="settings-drawer" open></dialog>');
  await web.addScriptTag({path:path.resolve('www/capsule.js')});
  assert.equal(await web.locator('.capsule-settings').count(),0,'No broken native-only setting in web app');
  console.log('Capsule UI: opt-in, denied/revoked permission, reduced motion, failed save and web fallback passed');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
