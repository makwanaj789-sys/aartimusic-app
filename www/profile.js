/* Local profile and music preferences. No account or photo upload required. */
(function(root){
 'use strict';
 const KEY='aarti.profile.v1';
 const languages=[['Hindi','हिन्दी',['Arijit Singh','Shreya Ghoshal','Sonu Nigam']],['English','English',['Taylor Swift','The Weeknd','Adele']],['Gujarati','ગુજરાતી',['Aditya Gadhvi','Geeta Rabari']],['Punjabi','ਪੰਜਾਬੀ',['Diljit Dosanjh','AP Dhillon']],['Tamil','தமிழ்',['Anirudh Ravichander','A. R. Rahman']],['Telugu','తెలుగు',['Sid Sriram','S. P. Balasubrahmanyam']],['Malayalam','മലയാളം',['K. S. Chithra','Vineeth Sreenivasan']],['Kannada','ಕನ್ನಡ',['Vijay Prakash','Sanjith Hegde']],['Bengali','বাংলা',['Anupam Roy','Shreya Ghoshal']],['Marathi','मराठी',['Ajay-Atul','Shreya Ghoshal']],['Urdu','اردو',['Atif Aslam','Rahat Fateh Ali Khan']],['Bhojpuri','भोजपुरी',['Pawan Singh','Shilpi Raj']],['Odia','ଓଡ଼ିଆ',['Humane Sagar']],['Assamese','অসমীয়া',['Zubeen Garg']],['Nepali','नेपाली',['Sushant KC']],['Sinhala','සිංහල',['Yohani']],['Mandarin','中文',['Jay Chou','G.E.M.']],['Cantonese','粵語',['Eason Chan']],['Japanese','日本語',['YOASOBI','Kenshi Yonezu']],['Korean','한국어',['BTS','BLACKPINK','IU']],['Spanish','Español',['Bad Bunny','Shakira','Luis Fonsi']],['Portuguese','Português',['Anitta','Marília Mendonça']],['French','Français',['Stromae','Angèle']],['German','Deutsch',['CRO','Nina Chuba']],['Italian','Italiano',['Måneskin','Laura Pausini']],['Arabic','العربية',['Amr Diab','Fairuz']],['Turkish','Türkçe',['Tarkan','Sezen Aksu']],['Persian','فارسی',['Googoosh']],['Russian','Русский',['Zivert']],['Indonesian','Bahasa Indonesia',['Tulus','Raisa']],['Thai','ไทย',['BOWKYLION']],['Vietnamese','Tiếng Việt',['Sơn Tùng M-TP']],['Filipino','Filipino',['Ben&Ben','SB19']],['Swahili','Kiswahili',['Diamond Platnumz']],['Yoruba','Yorùbá',['Asake','Wizkid']]];
 let profile=null;
 try { const p=JSON.parse(localStorage.getItem(KEY));if(p&&typeof p.name==='string'&&p.name.trim()&&Array.isArray(p.languages)&&p.languages.length&&Array.isArray(p.artists)&&p.artists.length)profile=p; }catch(_){}
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
 const button=(text,fn,cls='pref-button')=>{const b=el('button',cls,text);b.type='button';b.onclick=fn;return b;};
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 let dialog,previousFocus,draft,step=0,editing=false,photoBusy=false;
 function initials(name){return name.trim().split(/\s+/).slice(0,2).map(x=>Array.from(x)[0]).join('').toUpperCase();}
 function avatar(node,p){node.replaceChildren();if(p&&p.photo&&p.photo.startsWith('data:image/')){const img=el('img');img.src=p.photo;img.alt='';node.append(img);}else node.textContent=p?initials(p.name):'♪';}
 function showModal(node){if(node===settings){drawerTo(1);return;}previousFocus=document.activeElement;node.showModal();}
 function closeModal(node){if(node===settings){drawerTo(0);return;}node.close();previousFocus?.focus();}
 function finish(){
  const p={name:draft.name.trim().slice(0,50),photo:draft.photo||'',languages:[...draft.languages],artists:[...draft.artists]};
  if(!p.name||!p.languages.length||!p.artists.length)return;
  try{localStorage.setItem(KEY,JSON.stringify(p));}catch(_){dialog.querySelector('.pref-error').textContent='Could not save. Try a smaller photo or free some device storage.';return;}
  profile=p;closeModal(dialog);updateBadge();root.dispatchEvent(new Event('aarti-profile-change'));
  if(!editing){const hello=el('div','welcome-wave');hello.setAttribute('role','status');hello.append(el('span','','Hello,'),el('strong','',p.name),el('small','','Your world. Your music.'));document.body.append(hello);setTimeout(()=>hello.remove(),reduced()?1100:1900);}
 }
 function render(){
  dialog.replaceChildren();const wrap=el('div','profile-content');dialog.append(wrap);
  const head=el('div','pref-top');head.append(el('span','pref-eyebrow',editing?'YOUR PROFILE':'MAKE IT YOURS'),el('span','pref-count',(step+1)+' / 3'));wrap.append(head);
  wrap.append(el('h1','',step===0?'A sound of your own.':step===1?'What speaks to you?':'Who is on repeat?'));
  wrap.append(el('p','pref-copy',step===0?'Tell us your name. A photo is optional.':step===1?'Choose music languages. Pick as many as you like.': 'Pick your artists, or add anyone you love.'));
  const err=el('p','pref-error');err.setAttribute('role','alert');
  if(step===0){
   const face=el('div','profile-photo');avatar(face,draft);wrap.append(face);
   const label=el('label','pref-field','Your name');const input=el('input');input.id='profileName';input.autocomplete='nickname';input.maxLength=50;input.value=draft.name;input.required=true;label.append(input);wrap.append(label);
   input.oninput=()=>{draft.name=input.value;err.textContent='';avatar(face,draft);};
   const file=el('input');file.type='file';file.accept='image/*';file.id='profilePhoto';file.hidden=true;
   const pick=button('Choose photo',()=>file.click(),'pref-secondary');
   file.onchange=async()=>{const f=file.files[0];if(!f)return;if(f.size>15*1024*1024){err.textContent='Choose an image under 15 MB.';return;}
    photoBusy=true;pick.disabled=true;err.textContent='Preparing photo…';
    const url=URL.createObjectURL(f);
    try{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=c.height=256;const side=Math.min(img.width,img.height);c.getContext('2d').drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,256,256);draft.photo=c.toDataURL('image/jpeg',.82);avatar(face,draft);err.textContent='';}catch(_){err.textContent='That image could not be opened. Try another.';}finally{URL.revokeObjectURL(url);photoBusy=false;pick.disabled=false;}
   };
   wrap.append(pick,file,button('Remove photo',()=>{draft.photo='';avatar(face,draft);},'pref-secondary'));
  }else if(step===1){
   const grid=el('div','language-grid');for(const [name,native] of languages){const b=button('',()=>{draft.languages=draft.languages.includes(name)?draft.languages.filter(x=>x!==name):[...draft.languages,name];b.setAttribute('aria-pressed',String(draft.languages.includes(name)));},'language-choice');b.append(el('strong','',native),el('span','',name));b.setAttribute('aria-pressed',String(draft.languages.includes(name)));grid.append(b);}wrap.append(grid);
  }else{
   const grid=el('div','artist-grid');const names=[...new Set([...draft.artists,...languages.filter(x=>draft.languages.includes(x[0])).flatMap(x=>x[2])])];
   const add=(name)=>{const b=button(name,()=>{draft.artists=draft.artists.includes(name)?draft.artists.filter(x=>x!==name):[...draft.artists,name];b.setAttribute('aria-pressed',String(draft.artists.includes(name)));},'artist-choice');b.setAttribute('aria-pressed',String(draft.artists.includes(name)));grid.append(b);};names.forEach(add);wrap.append(grid);
   const row=el('form','artist-add');const input=el('input');input.placeholder='Another artist…';input.maxLength=80;input.setAttribute('aria-label','Add an artist');const b=el('button','','Add');b.type='submit';row.append(input,b);row.onsubmit=e=>{e.preventDefault();const name=input.value.trim();if(name&&!names.includes(name)){names.push(name);draft.artists.push(name);add(name);}input.value='';};wrap.append(row);
  }
  wrap.append(err);const actions=el('div','pref-actions');if(step>0)actions.append(button('Back',()=>{step--;render();},'pref-secondary'));if(editing)actions.append(button('Cancel',()=>closeModal(dialog),'pref-secondary'));
  actions.append(button(step===2?'Let’s listen':'Continue',()=>{if(photoBusy){err.textContent='Please wait for the photo.';return;}if(step===0&&!draft.name.trim()){err.textContent='Please enter your name.';return;}if(step===1&&!draft.languages.length){err.textContent='Choose at least one music language.';return;}if(step===2&&!draft.artists.length){err.textContent='Choose or add at least one artist.';return;}if(step===2)finish();else{step++;render();}}));wrap.append(actions);dialog.scrollTop=0;
  if(dialog.open)(dialog.querySelector('input:not([hidden]),button'))?.focus();
 }
 function edit(){editing=!!profile;draft=profile?JSON.parse(JSON.stringify(profile)):{name:'',photo:'',languages:[],artists:[]};step=0;render();showModal(dialog);}
 let badge,settings,drawerProgress=0,drawerAnimation;
 function drawerFrame(p){drawerProgress=Math.max(0,Math.min(1,p));settings.style.transform=`translate3d(${(drawerProgress-1)*100}%,0,0)`;}
 function drawerTo(p){
  drawerAnimation?.cancel();drawerAnimation=null;
  if(p&&!settings.open){previousFocus=document.activeElement;settings.showModal();drawerFrame(0);}
  if(!settings.open)return;
  const start=drawerProgress;drawerFrame(p);
  const finish=()=>{if(!p){settings.close();previousFocus?.focus();}};
  if(reduced()){finish();return;}
  const animation=settings.animate([{transform:`translate3d(${(start-1)*100}%,0,0)`},{transform:`translate3d(${(p-1)*100}%,0,0)`}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});drawerAnimation=animation;
  animation.finished.then(()=>{if(drawerAnimation===animation){drawerAnimation=null;finish();}}).catch(()=>{});
 }
 function drawerGestures(){
  let gesture=null,suppressClick=false;
  function begin(x,y,target,time){
   suppressClick=false;
   if(dialog.open||document.body.classList.contains('locked')||document.querySelector('dialog[open]:not(.settings-drawer)'))return;
   if(target.closest('input,textarea,select,button,a,.rail,.discovery-chips,[role="slider"]'))return;
   if(!settings.open&&x>Math.min(110,innerWidth*.3))return;
   if(settings.open&&!settings.contains(target))return;
   gesture={x,y,time,lastX:x,lastTime:time,velocity:0,p:settings.open?1:0,locked:false};
  }
  function move(x,y,time,event){if(!gesture)return;const dx=x-gesture.x,dy=y-gesture.y;
   if(!gesture.locked){if(Math.abs(dy)>18&&Math.abs(dy)>Math.abs(dx)){gesture=null;return;}if(Math.abs(dx)<12||Math.abs(dx)<Math.abs(dy)*1.3)return;if((gesture.p===0&&dx<0)||(gesture.p===1&&dx>0)){gesture=null;return;}
    gesture.locked=true;drawerAnimation?.cancel();drawerAnimation=null;if(!settings.open){updateBadge();previousFocus=document.activeElement;settings.showModal();}try{settings.setPointerCapture(event.pointerId);}catch(_){} }
   if(event.cancelable)event.preventDefault();gesture.velocity=(x-gesture.lastX)/Math.max(1,time-gesture.lastTime);gesture.lastX=x;gesture.lastTime=time;
   drawerFrame(gesture.p+dx/settings.getBoundingClientRect().width);
  }
  function end(cancel=false){if(!gesture)return;const g=gesture;gesture=null;if(!g.locked)return;suppressClick=true;const target=cancel?g.p:Math.abs(g.velocity)>.45?(g.velocity>0?1:0):(drawerProgress>.5?1:0);drawerTo(target);}
  // Pointer Events + declared pan-y leave vertical scrolling on the compositor.
  const edge=el('div','drawer-swipe-edge');edge.setAttribute('aria-hidden','true');document.body.append(edge);
  document.addEventListener('pointerdown',e=>{if(e.isPrimary!==false&&e.button===0)begin(e.clientX,e.clientY,e.target,e.timeStamp);},true);
  document.addEventListener('pointermove',e=>move(e.clientX,e.clientY,e.timeStamp,e),true);
  document.addEventListener('pointerup',()=>end(),true);document.addEventListener('pointercancel',()=>end(true),true);
  document.addEventListener('click',e=>{if(suppressClick&&e.detail){suppressClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
  settings.addEventListener('cancel',e=>{e.preventDefault();drawerTo(0);});
 }

 function updateBadge(){avatar(badge,profile);const name=document.getElementById('settingsName');if(name)name.textContent=profile?.name||'Your profile';}
 function start(){
  dialog=el('dialog','profile-dialog');dialog.setAttribute('aria-label','Music profile setup');dialog.addEventListener('cancel',e=>{if(!profile)e.preventDefault();});document.body.append(dialog);
  badge=button('',()=>{updateBadge();showModal(settings);},'profile-badge');badge.id='profileMenu';badge.setAttribute('aria-label','Open settings');document.body.append(badge);
  settings=el('dialog','settings-drawer');settings.setAttribute('aria-label','Settings');settings.innerHTML='<div class="settings-heading"><h2>Settings</h2></div><p id="settingsName"></p><p class="pref-copy">Make Aarti Music feel like you.</p>';
  settings.querySelector('.settings-heading').append(button('Close',()=>closeModal(settings),'pref-secondary'));
  settings.append(button('Edit profile & music preferences',()=>{closeModal(settings);edit();}));
  const theme=document.querySelector('.themes');if(theme){
   for(const [id,name,color] of [["teal","Midnight","#77ccdb"],["violet","Violet","#d1a0ff"],["indigo","Indigo","#a6a2ff"],["neon","Neon","#ff70c6"],["ruby","Ruby","#ff9aaa"]]){const b=el('button','th');b.type='button';b.dataset.theme=id;b.setAttribute('aria-pressed',String(document.documentElement.dataset.theme===id));b.style.setProperty('--swatch',color);b.append(el('i'),el('span','',name));theme.append(b);}
   settings.append(theme);
  }
  settings.append(el('h3','','Contact us'));
  for(const [text,url,mark] of [
   ['@h81t6','https://instagram.com/h81t6','<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle class="dot" cx="17.5" cy="6.5" r="1"/>'],
   ['@umclon','https://t.me/umclon','<path class="solid" d="M3 11l17-7-3 16-6-5-3 3 1-5 8-6-10 5z"/>']
  ]){const a=el('a','settings-contact');a.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+mark+'</svg>';a.append(el('span','',text));a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label',(text==='@h81t6'?'Instagram ':'Telegram ')+text);settings.append(a);}
  settings.append(el('p','pref-copy','Your photo and preferences stay on this device.'));document.body.append(settings);updateBadge();
  settings.addEventListener('click',e=>{if(e.target===settings){const b=settings.getBoundingClientRect();if(e.clientX>b.right)closeModal(settings);}});
  drawerGestures();
  if(!profile)edit();
 }
 root.AartiProfile={get:()=>profile,start,languages:()=>languages.map(x=>x[0]),edit,reload:()=>{try{profile=JSON.parse(localStorage.getItem(KEY));updateBadge();root.dispatchEvent(new Event('aarti-profile-change'));}catch(_){}}};
})(window);
