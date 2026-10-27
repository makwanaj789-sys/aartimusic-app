(function(root){
 'use strict';
 root.AartiPersonalLibrary=function(o){
  const KEY='aarti.playlists.v1',ICON='aarti.icon.v1',B=AartiBackup;
  let lists=[];try{lists=JSON.parse(localStorage.getItem(KEY)||'[]').map(B.playlist);}catch(_){}
  const $=id=>document.getElementById(id),el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
  const btn=(text,fn,cls='')=>{const b=el('button',cls,text);b.type='button';b.onclick=fn;return b;};
  const dialog=el('dialog','personal-dialog');dialog.setAttribute('aria-label','Your playlists and backup');document.body.append(dialog);
  let previousFocus;
  function open(){if(!dialog.open){previousFocus=document.activeElement;dialog.showModal();}}
  function close(){dialog.close();previousFocus?.focus();}
  function frame(title){dialog.replaceChildren(el('h2','',title));open();}
  function status(text,error){const p=el('p','personal-status'+(error?' personal-error':''),text);p.setAttribute('role',error?'alert':'status');dialog.append(p);}
  function commit(next){localStorage.setItem(KEY,JSON.stringify(next));lists=next;render();}
  function change(fn){try{const next=JSON.parse(JSON.stringify(lists));fn(next);commit(next);return true;}catch(e){status(e.message||'Could not save this playlist.',true);return false;}}
  function render(){
   const grid=$('ownGrid');grid.replaceChildren();$('ownEmpty').hidden=lists.length>0;
   for(const p of lists){const card=btn('',()=>showPlaylist(p.id),'own-card');const src=p.cover||p.songs[0]?.thumb;if(src){const img=el('img');img.src=src;img.alt='';card.append(img);}else card.append(el('span','own-cover','♪'));card.append(el('strong','',p.name),el('small','',p.songs.length+' songs'));grid.append(card);}
  }
  function create(song){
   frame('A playlist of your own');const input=el('input');input.type='text';input.maxLength=80;input.placeholder='Playlist name';input.setAttribute('aria-label','Playlist name');dialog.append(input);
   const actions=el('div','personal-actions');actions.append(btn('Create',()=>{const name=input.value.trim();if(!name){status('Enter a playlist name.',true);return;}if(lists.length>=50){status('You can keep up to 50 personal playlists.',true);return;}const id='local-'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2));if(change(next=>next.push({id,name,cover:'',songs:song?[B.song(song)]:[],updatedAt:Date.now()})))showPlaylist(id);},'primary'),btn('Cancel',close));dialog.append(actions);input.focus();
  }
  async function photo(file){if(!file||file.size>15*1024*1024)throw new Error('Choose an image under 15 MB.');const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=c.height=256;const side=Math.min(img.width,img.height);c.getContext('2d').drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,256,256);return c.toDataURL('image/jpeg',.8);}finally{URL.revokeObjectURL(url);}}
  function showPlaylist(id){
   const p=lists.find(x=>x.id===id);if(!p)return close();frame(p.name);
   const input=el('input');input.type='text';input.value=p.name;input.maxLength=80;input.setAttribute('aria-label','Rename playlist');dialog.append(input);
   const file=el('input');file.type='file';file.accept='image/*';file.hidden=true;
   file.onchange=async()=>{try{const cover=await photo(file.files[0]);if(change(next=>{const q=next.find(x=>x.id===id);if(q)q.cover=cover;}))showPlaylist(id);}catch(e){status(e.message||'Could not open that photo.',true);}};
   dialog.append(file);
   const actions=el('div','personal-actions');actions.append(
    btn('Play all',()=>{if(!p.songs.length){status('Add songs using the three-dot menu beside a song.');return;}close();o.play(p.songs.slice(),0);},'primary'),
    btn('Rename',()=>{if(!input.value.trim()){status('Enter a name.',true);return;}if(change(next=>{next.find(x=>x.id===id).name=input.value.trim();}))showPlaylist(id);}),
    btn('Change cover',()=>file.click()),btn('Delete',()=>{frame('Delete '+p.name+'?');status('Only this personal playlist will be removed. Your favourites stay saved.');const a=el('div','personal-actions');a.append(btn('Delete playlist',()=>{if(change(next=>next.splice(next.findIndex(x=>x.id===id),1)))close();}),btn('Keep playlist',()=>showPlaylist(id)));dialog.append(a);}),btn('Done',close));
   dialog.append(actions);
   if(!p.songs.length)status('Add your first song from its three-dot menu → Add to your playlist.');
   p.songs.forEach((song,i)=>{const row=el('div','own-row');row.append(btn(song.title,()=>{close();o.play(p.songs.slice(),i);},'own-play'));
    if(i>0)row.append(btn('↑',()=>{if(change(next=>{const a=next.find(x=>x.id===id).songs;[a[i-1],a[i]]=[a[i],a[i-1]];}))showPlaylist(id);},'own-remove'));
    row.append(btn('Remove',()=>{if(change(next=>next.find(x=>x.id===id).songs.splice(i,1)))showPlaylist(id);},'own-remove'));dialog.append(row);
   });
  }
  function addSong(song){
   frame('Add to your playlist');const actions=el('div','personal-actions');actions.append(btn('New playlist',()=>create(song),'primary'),btn('Cancel',close));dialog.append(actions);
   for(const p of lists){const b=btn(p.name+' · '+p.songs.length+' songs',()=>{if(p.songs.some(x=>x.id===song.id)){status('This song is already in that playlist.');return;}if(p.songs.length>=500){status('This playlist has reached 500 songs.',true);return;}if(change(next=>{const q=next.find(x=>x.id===p.id);q.songs.push(B.song(song));q.updatedAt=Date.now();})){close();o.toast('Added to '+p.name);}},'library-action');dialog.append(b);}
  }
  $('createPlaylist').onclick=()=>create();
  const settings=document.querySelector('.settings-drawer');
  settings.append(el('h3','','App icon'));
  const icons=el('div','icon-choices');settings.append(icons);
  let iconBusy=false;
  function paintIcon(key){const src=key==='classic'?'brand-icon.png':'icons/'+key+'.svg';document.querySelectorAll('.brand-icon').forEach(img=>img.src=src);icons.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.icon===key)));}
  for(const [key,name] of [['classic','Classic'],['teal','Midnight'],['violet','Orbit'],['indigo','Waves'],['neon','Pulse'],['ruby','Note']]){
   const b=btn('',async()=>{if(iconBusy)return;iconBusy=true;try{const plugin=o.native();if(plugin)await plugin.setIcon({icon:key});localStorage.setItem(ICON,key);paintIcon(key);o.toast(plugin?'App icon changed':'Icon preview changed');}catch(_){o.toast('Could not change the app icon. Try again.');}finally{iconBusy=false;}},'icon-choice');b.dataset.icon=key;b.setAttribute('aria-label',name+' icon');const img=el('img');img.src=key==='classic'?'brand-icon.png':'icons/'+key+'.svg';img.alt='';b.append(img,el('span','',name));icons.append(b);
  }
  paintIcon(B.icons.includes(localStorage.getItem(ICON))?localStorage.getItem(ICON):'classic');
  const plugin=o.native();if(plugin)plugin.getIcon().then(r=>{if(B.icons.includes(r.icon)){localStorage.setItem(ICON,r.icon);paintIcon(r.icon);}}).catch(()=>{});
  settings.append(el('p','personal-status','Launcher icons may take a moment to refresh. Your theme and icon can be chosen independently.'));
  settings.append(el('h3','','Backup & restore'));
  const controls=el('div','backup-controls');settings.append(controls);
  const file=el('input');file.type='file';file.accept='.json,application/json';file.hidden=true;settings.append(file);
  function exportText(){const value=B.create(o.readStore(),AartiProfile.get(),lists,localStorage.getItem(ICON));const text=JSON.stringify(value,null,2);if(new Blob([text]).size>8*1024*1024)throw new Error('Backup is too large. Remove some custom cover photos and try again.');return text;}
  controls.append(btn('Save backup',async()=>{try{const text=exportText(),name='AartiMusic-backup-'+new Date().toISOString().slice(0,10)+'.json',p=o.native();if(p){const r=await p.exportBackup({data:text,name});if(!r?.cancelled)o.toast('Backup saved');}else{const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}}catch(e){o.toast(e.message||'Backup could not be saved.');}},'library-action'));
  controls.append(btn('Restore backup',async()=>{try{const p=o.native();if(p){const r=await p.importBackup();if(!r.cancelled)preview(r.data);}else file.click();}catch(e){o.toast(e.message||'Backup could not be opened.');}},'library-action'));
  file.onchange=async()=>{const f=file.files[0];file.value='';if(!f)return;try{if(f.size>8*1024*1024)throw new Error('Choose a backup under 8 MB.');preview(await f.text());}catch(e){o.toast(e.message);}};
  function preview(text){
   const data=B.parse(text);frame('Restore your music');
   status(data.library.favs.length+' favourites · '+data.playlists.length+' playlists');
   status('Songs will be merged with your saved library. Existing playlists and favourites will not be deleted. Audio files and login credentials are not part of a backup.');
   const label=el('label','backup-options'),check=el('input');check.type='checkbox';check.checked=true;label.append(check,document.createTextNode('Also restore the name, photo, music preferences, theme and icon.'));dialog.append(label);
   const actions=el('div','personal-actions');actions.append(btn('Merge backup',async()=>{
    try{
     const current=o.readStore(),merged=B.mergePlaylists(lists,data.playlists),fresh=JSON.parse(JSON.stringify(current));
     const ids=new Set(fresh.favs.map(x=>x.id));for(const song of data.library.favs){if(!ids.has(song.id)){fresh.favs.push({...song,at:Date.now()});ids.add(song.id);}delete fresh.gone[song.id];}
     fresh.recents=[...new Map([...fresh.recents,...data.library.recents].map(x=>[x.id,x])).values()].slice(0,30);
     fresh.history=[...new Set([...fresh.history,...data.library.history])].slice(0,30);
     fresh.lists=[...new Map([...fresh.lists,...data.library.lists].map(x=>[x.id,x])).values()].slice(0,100);
     if(check.checked){fresh.theme=data.library.theme;fresh.shuffle=data.library.shuffle;fresh.repeat=data.library.repeat;}
     const changes=[['aarti.v1',JSON.stringify(fresh)],[KEY,JSON.stringify(merged)]];
     if(check.checked&&data.profile)changes.push(['aarti.profile.v1',JSON.stringify(data.profile)]);
     const previous=changes.map(([key])=>[key,localStorage.getItem(key)]);
     try{for(const [key,value]of changes)localStorage.setItem(key,value);}catch(error){for(const [key,value]of previous){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}throw error;}
     lists=merged;render();o.reload();close();
     if(check.checked){try{const native=o.native();if(native)await native.setIcon({icon:data.icon});localStorage.setItem(ICON,data.icon);paintIcon(data.icon);}catch(_){o.toast('Library restored. Choose the app icon again in Settings.');return;}}
     o.toast('Backup restored.');
    }catch(e){status(e.message||'Restore failed. Your saved library was kept.',true);}
   },'primary'),btn('Cancel',close));dialog.append(actions);
  }
  settings.append(el('p','personal-status','Save the JSON file somewhere safe. Backups contain your profile and library, not downloaded music or sign-in tokens.'));
  render();return {addSong};
 };
})(window);
