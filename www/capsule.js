/* Android glass player: first-use choice, persistent native decoration and live crop preview. */
(() => {
 const c=window.Capacitor;if(!c?.isNativePlatform?.()||!c?.isPluginAvailable?.('FloatingCapsule'))return;
 const api=c.Plugins?.FloatingCapsule||c.registerPlugin('FloatingCapsule'),motion=matchMedia('(prefers-reduced-motion: reduce)');
 const defaults={width:320,height:210,x:.5,y:.5,zoom:1,visibility:.65,start:0,end:0,media:'sunset',file:'',kind:'video'};
 const el=(tag,cls,text)=>{const v=document.createElement(tag);if(cls)v.className=cls;if(text)v.textContent=text;return v;};
 const btn=(text,fn,cls='pref-button')=>{const b=el('button',cls,text);b.type='button';b.onclick=fn;return b;};
 let status,toggle,grant,last,busy=false,editor,previewMedia;
 const report=e=>{status.textContent=e?.message||String(e);};
 async function refresh(){try{last=await api.status();toggle.checked=!!last.enabled;toggle.disabled=!last.permitted||busy;grant.hidden=!!last.permitted;
  status.textContent=last.error||(!last.permitted?'Allow display over other apps to use the glass player.':last.enabled?'Play a song and go Home. Tap the cover to reopen AartiMusic.':'Floating player is off. You can still customize its appearance.');
 }catch(e){report(e);}}
 async function configure(){busy=true;toggle.disabled=true;let error;try{await api.configure({enabled:toggle.checked,reducedMotion:motion.matches});}catch(e){error=e;}finally{busy=false;await refresh();if(error)report(error);}}
 async function requestPermission(){const result=await api.requestPermission();const state=result&&typeof result.permitted==='boolean'?result:await api.status();if(state.permitted)await api.configure({enabled:true,reducedMotion:motion.matches});await refresh();}
 function pausePreview(){if(previewMedia?.tagName==='VIDEO')previewMedia.pause();}
 function mediaURL(a){return a.media==='custom'?c.convertFileSrc(a.previewUri||''):a.media==='glass'?'':'capsule-media/'+a.media+'.mp4';}
 function icons(){return '<svg viewBox="0 0 24 24"><path d="M3 5c8 0 10 14 18 14m-3-3 3 3-3 3M3 19C11 19 13 5 21 5m-3-3 3 3-3 3"/></svg><svg viewBox="0 0 24 24"><path d="M5 4v16"/><path class="fill" d="m19 4-12 8 12 8z"/></svg><svg viewBox="0 0 24 24"><path d="M8 4v16m8-16v16" stroke-width="4"/></svg><svg viewBox="0 0 24 24"><path d="M19 4v16"/><path class="fill" d="m5 4 12 8-12 8z"/></svg><svg viewBox="0 0 24 24"><path d="M20 9V6a3 3 0 0 0-3-3H4m3-3L4 3l3 3M4 15v3a3 3 0 0 0 3 3h13m-3-3 3 3-3 3"/></svg>';}
 async function edit(){
  await refresh();let draft={...defaults,...last?.appearance},duration=0,dimensions={w:640,h:360},mediaError=false,mediaReady=false;
  editor=el('dialog','capsule-editor');editor.setAttribute('aria-label','Customize floating player');
  const heading=el('div','settings-heading');heading.append(el('h2','','Your glass player'),btn('Close',()=>editor.close(),'pref-secondary'));editor.append(heading,el('p','pref-copy','A little window into your music. Preview the crop, then save.'));
  const stage=el('div','capsule-preview-stage'),card=el('div','glass-preview'),back=el('div','glass-media'),tint=el('div','glass-tint'),info=el('div','glass-info');
  info.innerHTML='<div class="glass-cover">♪</div><div><strong>Girl I Need You</strong><small>Arijit Singh · AartiMusic</small></div><span>×</span>';
  const progress=el('div','glass-progress');progress.innerHTML='<div><span>0:18</span><span>−2:24</span></div><i></i>';
  const controls=el('div','glass-controls');controls.innerHTML=icons();card.append(back,tint,info,progress,controls);stage.append(card);editor.append(stage);
  const feedback=el('p','pref-copy');feedback.setAttribute('role','status');editor.append(feedback);
  const choices=el('div','capsule-presets');for(const [key,label]of [['glass','Clear glass'],['sunset','Sunset film'],['starlight','Starlight']])choices.append(btn(label,()=>{draft={...draft,media:key,kind:'video',x:.5,y:.5,zoom:1,start:0,end:0};load();syncInputs();},'pref-secondary'));editor.append(choices);
  const choose=btn('Choose your photo or video',async()=>{choose.disabled=true;feedback.textContent='Opening your files…';pausePreview();try{const chosen=await api.pickMedia();if(!chosen.cancelled){draft={...draft,...chosen,x:.5,y:.5,zoom:1,start:0,end:0};duration=Number(chosen.duration)||0;load();syncInputs();}else{feedback.textContent='Selection cancelled. Your current background is kept.';playPreview();}}catch(e){feedback.textContent=e.message||'Could not open this file.';}finally{choose.disabled=false;}});editor.append(choose,el('p','pref-copy','Photos and videos stay on your device. Maximum file size: 100 MB. Background videos are always muted.'));
  const inputs={};const spatial=el('fieldset','capsule-fields'),temporal=el('fieldset','capsule-fields');spatial.append(el('legend','','Size & crop'));temporal.append(el('legend','','Video loop · seconds'));
  function range(parent,key,label,min,max,step){const row=el('label','capsule-range'),head=el('span');const output=el('output');head.append(el('span','',label),output);const input=el('input');input.type='range';input.min=min;input.max=max;input.step=step;input.setAttribute('aria-label',label);row.append(head,input);parent.append(row);inputs[key]={input,output};input.oninput=()=>{draft[key]=Number(input.value);if(key==='start'||key==='end'){if(key==='start'&&draft.end&&draft.start>draft.end-1)draft.start=Math.max(0,draft.end-1);if(key==='end'&&draft.end<draft.start+1)draft.end=Math.min(duration,draft.start+1);if(previewMedia?.tagName==='VIDEO'&&Number.isFinite(previewMedia.duration))previewMedia.currentTime=draft.start;}render();syncInputs();};}
  range(spatial,'width','Width',260,380,1);range(spatial,'height','Height',170,260,1);range(spatial,'visibility','Background visibility',.2,.85,.01);range(spatial,'x','Crop left / right',0,1,.01);range(spatial,'y','Crop up / down',0,1,.01);range(spatial,'zoom','Crop zoom',1,3,.01);
  range(temporal,'start','Loop starts at',0,1,.1);range(temporal,'end','Loop ends at',1,2,.1);editor.append(spatial,temporal);
  function syncInputs(){for(const [key,{input,output}]of Object.entries(inputs)){input.value=draft[key];output.value=(key==='visibility'||key==='x'||key==='y')?Math.round(draft[key]*100)+'%':key==='zoom'?Number(draft[key]).toFixed(2)+'×':key==='start'||key==='end'?Number(draft[key]).toFixed(1)+'s':Math.round(draft[key])+' dp';}for(const b of choices.children)b.setAttribute('aria-pressed',String(b.textContent===({glass:'Clear glass',sunset:'Sunset film',starlight:'Starlight'})[draft.media]));}
  function render(){const available=Math.max(240,stage.clientWidth),w=Math.min(draft.width,available),scale=w/draft.width,h=draft.height*scale;card.style.width=w+'px';card.style.height=h+'px';card.style.setProperty('--preview-scale',scale);back.style.opacity=draft.visibility;
   if(previewMedia){const s=Math.max(w/dimensions.w,h/dimensions.h)*draft.zoom,mw=dimensions.w*s,mh=dimensions.h*s;previewMedia.style.width=mw+'px';previewMedia.style.height=mh+'px';previewMedia.style.transform=`translate(${-((mw-w)*draft.x)}px,${-((mh-h)*draft.y)}px)`;}}
  function playPreview(){if(previewMedia?.tagName==='VIDEO'&&!motion.matches&&!document.hidden)previewMedia.play().catch(()=>{feedback.textContent='Tap Play preview to inspect this video.';});}
  function load(){pausePreview();back.replaceChildren();previewMedia=null;mediaError=false;mediaReady=false;temporal.hidden=true;feedback.textContent='';if(draft.media==='glass'){mediaReady=true;render();return;}
   const isVideo=draft.media!=='custom'||draft.kind==='video',v=el(isVideo?'video':'img');previewMedia=v;v.alt='Background crop preview';v.draggable=false;
   if(isVideo){v.muted=true;v.playsInline=true;v.preload='metadata';v.onloadedmetadata=()=>{if(previewMedia!==v)return;dimensions={w:v.videoWidth,h:v.videoHeight};duration=v.duration;if(!Number.isFinite(duration)||duration<1){mediaError=true;feedback.textContent='Choose a video at least one second long.';return;}mediaReady=true;draft.start=Math.min(draft.start,duration-1);draft.end=draft.end?Math.max(draft.start+1,Math.min(duration,draft.end)):duration;inputs.start.input.max=Math.max(0,duration-1);inputs.end.input.max=duration;temporal.hidden=false;v.currentTime=draft.start;syncInputs();render();playPreview();};v.ontimeupdate=()=>{if(v.currentTime>=(draft.end||duration)-.06)v.currentTime=draft.start;};v.onended=()=>{v.currentTime=draft.start;playPreview();};}
   else v.onload=()=>{if(previewMedia===v){mediaReady=true;dimensions={w:v.naturalWidth,h:v.naturalHeight};render();}};
   v.onerror=()=>{mediaError=true;feedback.textContent='This file cannot be previewed. Choose another photo/video before saving.';};v.src=mediaURL(draft);back.append(v);render();
  }
  let drag;card.style.touchAction='none';card.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,fx:draft.x,fy:draft.y};card.setPointerCapture(e.pointerId);};card.onpointermove=e=>{if(!drag)return;draft.x=Math.max(0,Math.min(1,drag.fx-(e.clientX-drag.x)/Math.max(40,parseFloat(previewMedia?.style.width||0)-card.clientWidth)));draft.y=Math.max(0,Math.min(1,drag.fy-(e.clientY-drag.y)/Math.max(40,parseFloat(previewMedia?.style.height||0)-card.clientHeight)));render();syncInputs();};card.onpointerup=card.onpointercancel=()=>{drag=null;};
  editor.append(btn('Play / pause preview',()=>{if(previewMedia?.tagName==='VIDEO'){if(previewMedia.paused)previewMedia.play().catch(()=>{feedback.textContent='Video playback is unavailable.';});else previewMedia.pause();}},'pref-secondary'));
  const save=btn('Save glass player',async()=>{if(mediaError||!mediaReady){feedback.textContent=mediaError?'Choose media that previews successfully before saving.':'Please wait for the media preview to load.';return;}save.disabled=true;try{const {previewUri,widthPixels,heightPixels,duration,...appearance}=draft;await api.setAppearance({appearance});editor.close();await refresh();}catch(e){feedback.textContent=e.message||'Could not save appearance.';save.disabled=false;}});editor.append(save,btn('Cancel',()=>editor.close(),'pref-secondary'));
  const resize=new ResizeObserver(render);resize.observe(stage);editor.addEventListener('close',()=>{pausePreview();previewMedia?.removeAttribute('src');resize.disconnect();editor.remove();editor=null;previewMedia=null;},{once:true});
  document.body.append(editor);editor.showModal();syncInputs();load();
 }
 function introduction(){if(localStorage.getItem('aarti.capsule.intro.v2'))return;if(last.permitted){localStorage.setItem('aarti.capsule.intro.v2','1');return;}
  const d=el('dialog','capsule-intro');d.setAttribute('aria-label','Enable floating music player');d.innerHTML='<span class="pref-eyebrow">MUSIC, EVEN OUTSIDE THE APP</span><h2>Keep your music close.</h2><p class="pref-copy">Show a glass player when you minimize AartiMusic. Android needs your permission to display it over other apps.</p>';
  const message=el('p','pref-copy');message.setAttribute('role','status');
  const finish=()=>{localStorage.setItem('aarti.capsule.intro.v2','1');d.close();d.remove();};
  const allow=btn('Allow floating player',async()=>{allow.disabled=true;try{await requestPermission();finish();}catch(e){message.textContent=e.message||'Permission could not be opened. You can continue without it.';allow.disabled=false;}});
  d.append(allow,btn('Not now · continue without floating',finish,'pref-secondary'),message);d.addEventListener('cancel',e=>{e.preventDefault();finish();});document.body.append(d);d.showModal();
 }
 async function install(){const drawer=document.querySelector('.settings-drawer');if(!drawer)return;
  const section=el('section','capsule-settings');section.innerHTML='<h3>Glass floating player</h3><p class="pref-copy">Your music, framed in glass. Choose a photo or a silent video.</p><label class="capsule-toggle"><span>Show when minimized</span><input type="checkbox" aria-label="Show floating player when minimized"></label><button type="button">Allow display over other apps</button><p class="pref-copy" role="status" aria-live="polite"></p>';
  toggle=section.querySelector('input');grant=section.querySelector('button');status=section.querySelector('[role=status]');section.append(btn('Customize glass player',edit));drawer.append(section);
  toggle.onchange=configure;grant.onclick=()=>requestPermission().catch(report);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pausePreview();else refresh();});window.addEventListener('focus',refresh);
  new MutationObserver(()=>{if(drawer.open)refresh();}).observe(drawer,{attributes:true,attributeFilter:['open']});
  motion.addEventListener('change',()=>{if(motion.matches)pausePreview();if(last)configure();});
  const syncModes=()=>api.syncModes?.({shuffle:document.getElementById('bShuffle')?.classList.contains('on')||false,repeat:!document.getElementById('bRepeat')?.classList.contains('on')?'off':document.querySelector('#bRepeat .one')?.hidden?'all':'one'}).catch(()=>{});
  for(const id of ['bShuffle','bRepeat']){const node=document.getElementById(id);if(node)new MutationObserver(syncModes).observe(node,{attributes:true,subtree:true,attributeFilter:['class','hidden']});}
  const listener=api.addListener?.('control',d=>{if(d.action==='shuffle')document.getElementById('bShuffle')?.click();if(d.action==='repeat')document.getElementById('bRepeat')?.click();});listener?.catch?.(()=>{});syncModes();
  await refresh();if(last){await api.configure({enabled:last.enabled&&last.permitted,reducedMotion:motion.matches}).catch(report);introduction();}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
