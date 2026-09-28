const {test}=require('node:test');const assert=require('node:assert/strict');const B=require('../www/backup.js');
const song={id:'abc12345678',title:'A song',artist:'Artist',thumb:'https://example.com/a.jpg',duration:180};
const lib={favs:[song],recents:[song],history:['hello'],lists:[],theme:'teal',shuffle:false,repeat:'off',link:{token:'NEVER-EXPORT'},gone:{secret:1},server:'SECRET'};
const profile={name:'Ajay',photo:'',languages:['Hindi'],artists:['Arijit Singh']};
test('backup round-trips whitelisted data and excludes credentials',()=>{
 const value=B.create(lib,profile,[{id:'local-one',name:'Night',cover:'',songs:[song]}],'neon');
 const text=JSON.stringify(value);assert(!text.includes('NEVER-EXPORT'));assert(!text.includes('SECRET'));assert(!text.includes('gone'));assert.equal(B.parse(text).profile.name,'Ajay');assert.equal(B.parse(text).icon,'neon');
});
test('reject malformed/versioned backups, unsafe images and invalid songs',()=>{
 const good=B.create(lib,profile,[],'classic');
 for(const bad of ['bad','{}',JSON.stringify({...good,version:99}),JSON.stringify({...good,profile:{...profile,photo:'javascript:alert(1)'}}),JSON.stringify({...good,library:{...good.library,favs:[{...song,id:'../../other'}]}})])assert.throws(()=>B.parse(bad));
 assert.throws(()=>B.parse(' '.repeat(8*1024*1024+1)));
});
test('playlist merge preserves existing names and deduplicates song ids',()=>{
 const a={id:'x',name:'My name',cover:'',songs:[song]},b={id:'x',name:'Older name',cover:'',songs:[song,{...song,id:'other'}]};
 const result=B.mergePlaylists([a],[b]);assert.equal(result.length,1);assert.equal(result[0].name,'My name');assert.equal(result[0].songs.length,2);assert.equal(a.songs.length,1);
});
test('limits prevent pathological playlist and profile imports',()=>{
 assert.throws(()=>B.validate({...B.create(lib,profile,[],'classic'),playlists:Array(51).fill({id:'x',name:'A',songs:[]})}));
 assert.throws(()=>B.create(lib,{...profile,name:'x'.repeat(51)},[],'classic'));
});
