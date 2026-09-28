/* Strict, portable backup schema. Credentials and server settings are never copied. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AartiBackup=api;})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 const themes=['amber','green','teal','violet','indigo','neon','ruby'],icons=['classic','teal','violet','indigo','neon','ruby'];
 function fail(){throw new Error('This is not a supported Aarti Music backup.');}
 function str(v,max,required){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail();return v;}
 function array(v,max){if(!Array.isArray(v)||v.length>max)fail();return v;}
 function image(v){if(!v)return '';str(v,200000);if(!/^https:\/\//i.test(v)&&!/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(v))fail();return v;}
 function song(s){if(!s||typeof s!=='object')fail();const id=str(s.id,160,true);if(!/^[\w-]+$/.test(id))fail();return {id,title:str(s.title,500,true),artist:str(s.artist||'',300),thumb:image(s.thumb),duration:Number.isFinite(s.duration)&&s.duration>=0?s.duration:0,at:Number.isFinite(s.at)?s.at:0};}
 const unique=items=>[...new Map(items.map(x=>[x.id,x])).values()];
 function playlist(p){if(!p||typeof p!=='object')fail();return {id:str(p.id,100,true),name:str(p.name,80,true),cover:image(p.cover),songs:unique(array(p.songs,500).map(song)),updatedAt:Number.isFinite(p.updatedAt)?p.updatedAt:0};}
 function profile(p){if(p===null||p===undefined)return null;if(typeof p!=='object')fail();return {name:str(p.name,50,true),photo:image(p.photo),languages:array(p.languages,50).map(x=>str(x,80,true)),artists:array(p.artists,100).map(x=>str(x,80,true))};}
 function validate(v){
  if(!v||v.format!=='aartimusic-backup'||v.version!==1||!v.library)fail();
  const l=v.library,p=profile(v.profile);if(p&&(!p.languages.length||!p.artists.length))fail();
  return {format:'aartimusic-backup',version:1,createdAt:typeof v.createdAt==='string'?v.createdAt:'',library:{
   favs:unique(array(l.favs,5000).map(song)),recents:unique(array(l.recents||[],100).map(song)),history:array(l.history||[],100).map(x=>str(x,300,true)),
   lists:array(l.lists||[],100).map(x=>({id:str(x.id,160,true),title:str(x.title||'Playlist',500),thumb:image(x.thumb),by:str(x.by||'',300)})),
   theme:themes.includes(l.theme)?l.theme:'amber',shuffle:!!l.shuffle,repeat:['off','one','all'].includes(l.repeat)?l.repeat:'off'
  },profile:p,playlists:array(v.playlists||[],50).map(playlist),icon:icons.includes(v.icon)?v.icon:'classic'};
 }
 function parse(text){if(typeof text!=='string'||text.length>8*1024*1024)throw new Error('Choose an Aarti Music backup under 8 MB.');let v;try{v=JSON.parse(text);}catch(_){fail();}return validate(v);}
 function create(store,profileValue,playlists,icon){return validate({format:'aartimusic-backup',version:1,createdAt:new Date().toISOString(),library:store,profile:profileValue,playlists,icon});}
 function mergePlaylists(current,incoming){const result=current.map(playlist);for(const p of incoming){const found=result.find(x=>x.id===p.id);if(found){found.songs=unique([...found.songs,...p.songs]).slice(0,500);}else result.push(p);}if(result.length>50)throw new Error('A maximum of 50 personal playlists can be restored.');return result;}
 return {themes,icons,song,playlist,parse,validate,create,mergePlaylists};
});
