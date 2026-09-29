/* Home discovery is independent of playback and the user's saved library. */
(function (root) {
  'use strict';
  root.AartiDiscovery = function (options) {
    const host = options.host;
    let categories = [['For you', 'Hindi Bollywood music'], ['Trending', 'India trending songs'], ['Hindi', 'Hindi hits'], ['Punjabi', 'Punjabi hits'], ['Garba', 'Gujarati garba'], ['Chill', 'Hindi lofi chill']];
    let generation = 0, selected = 0, activeKey = '', busy = false;
    const memory = new Map();
    const savedKey = 'aarti.discovery.v1';
    try {
      const entries = JSON.parse(localStorage.getItem(savedKey) || '[]');
      for (const [key, value] of entries) if (Date.now() - value.at < 21600000) memory.set(key, value);
    } catch (_) {}
    function el(tag, className, text) { const n = document.createElement(tag); n.className = className || ''; if (text) n.textContent = text; return n; }
    const chips = el('div', 'discovery-chips');
    host.classList.add('discovery-room');
    const rooms=[el('div','discovery-ambience'),el('div','discovery-ambience')];
    rooms.forEach(n=>{n.setAttribute('aria-hidden','true');host.append(n);});
    let roomIndex=0,roomName='',roomAnimations=[];
    function changeRoom(name){
      if(name===roomName)return;roomName=name;
      const colors={'For you':'#60418a','Trending':'#963958','Hindi':'#9b562c','Punjabi':'#316e82','Garba':'#a33660','Chill':'#28696b'};
      let hash=0;for(const c of name)hash=(hash*31+c.charCodeAt(0))>>>0;
      const palette=['#53438c','#296d79','#8e3c68','#87602e','#356b59'];
      roomAnimations.forEach(a=>a.cancel());roomAnimations=[];
      const previous=rooms[roomIndex];roomIndex=1-roomIndex;const next=rooms[roomIndex];
      next.style.setProperty('--room',colors[name]||palette[hash%palette.length]);
      previous.style.opacity='0';next.style.opacity='.7';
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
        roomAnimations=[previous.animate([{opacity:.7},{opacity:0}],{duration:260}),next.animate([{opacity:0},{opacity:.7}],{duration:260})];
      }
      host.dataset.mood=name;
    }
    const head = el('div', 'block-head');
    const title = el('h2', '', 'Made for your mood');
    const retry = el('button', 'link', 'Refresh'); retry.type = 'button';
    head.append(title, retry);
    const sub = el('p', 'discovery-sub', 'Find your next favourite.');
    const status = el('p', 'discovery-status'); status.setAttribute('role', 'status');
    const rail = el('div', 'rail discovery-rail');
    const songsHead = el('h2', 'discovery-songs-title', 'Discover songs');
    const songsStatus = el('p', 'discovery-status'); songsStatus.setAttribute('role', 'status');
    const songs = el('div', 'discovery-songs');
    host.append(chips, head, sub, status, rail, songsHead, songsStatus, songs);
    let prefKey = '';
    function drawChips(){ chips.replaceChildren(); categories.forEach(([name], i) => {
      const b = el('button', 'chip', name); b.type = 'button';
      b.addEventListener('click', () => { selected = i; refresh(true); }); chips.append(b);
    }); }
    drawChips();
    if(options.mode==='songs'){rail.hidden=true;status.hidden=true;songsHead.hidden=true;}
    if(options.mode==='playlists'){songs.hidden=true;songsStatus.hidden=true;songsHead.hidden=true;}
    retry.addEventListener('click', () => refresh(true, true));
    function cache(key, data) {
      memory.delete(key); memory.set(key, { at: Date.now(), data });
      while (memory.size > 12) memory.delete(memory.keys().next().value);
      try { localStorage.setItem(savedKey, JSON.stringify([...memory])); } catch (_) {}
    }
    function renderCards(list) {
      rail.replaceChildren();
      list.slice(0, 10).forEach(p => {
        const card = el('button', 'discovery-card'); card.type = 'button';
        const cover = el('span', 'discovery-cover');
        const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
        if (p.thumb) img.src = p.thumb;
        img.addEventListener('error', () => { img.hidden = true; });
        cover.append(img, el('span', 'cover-play', '▶'));
        card.append(cover, el('span', 'discovery-title', p.title || 'Playlist'), el('span', 'discovery-by', p.by || 'Your next mix'));
        card.addEventListener('click', () => options.openPlaylist(p.id, p, card)); rail.append(card);
      });
    }
    function renderSongs(list) {
      songs.replaceChildren();
      list.slice(0, 6).forEach((song, i) => {
        const row = el('button', 'discovery-song'); row.type = 'button';
        const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; if (song.thumb) img.src = song.thumb;
        const meta = el('span', 'discovery-song-meta');
        meta.append(el('span', 'discovery-title', song.title), el('span', 'discovery-by', song.artist || 'Music for you'));
        row.append(img, meta, el('span', 'discovery-song-play', '▶'));
        row.addEventListener('click', () => options.playSongs(list, i)); songs.append(row);
      });
    }
    async function refresh(force, bypass) {
      const profile = options.profile && options.profile();
      if(options.profile && !profile) return;
      const key=profile ? JSON.stringify([profile.languages,profile.artists]) : '';
      if(key!==prefKey){
        prefKey=key;selected=0;activeKey='';
        const language=profile.languages[0]||'English';
        categories=[['For you',profile.artists[0]+' songs'],['Trending',language+' trending music'],
          ...profile.languages.map(x=>[x,x+' music hits']),
          ...profile.artists.map(x=>[x,x+' songs']),['Garba','Gujarati garba'],['Chill',language+' chill music']];
        drawChips();
      }
      const recent = options.artist();
      const query = categories[selected][1];
      if (!force && activeKey === query) return;
      const current = ++generation; activeKey = query; busy = true;
      changeRoom(categories[selected][0]);
      [...chips.children].forEach((b, i) => { b.classList.toggle('active', selected === i); b.setAttribute('aria-pressed', String(selected === i)); });
      title.textContent = selected === 0 ? (options.mode==='songs'?'Songs for you':options.mode==='playlists'?'Your next mix':'Made for you') : categories[selected][0];
      sub.textContent = profile ? 'Inspired by '+(selected===0?profile.artists[0]:categories[selected][0])+' · Your music preferences' : 'Music picked for your next listen';
      const saved = !bypass && memory.get((options.mode||'all')+query);
      if (saved && Date.now() - saved.at < 21600000) {
        renderCards(saved.data.playlists); renderSongs(saved.data.songs);
        status.textContent = saved.data.playlists.length ? '' : 'No playlists found. Try another mood.';
        songsStatus.textContent = saved.data.songs.length ? '' : 'No songs found for this mood.';
        busy = false; return;
      }
      rail.replaceChildren(); songs.replaceChildren();
      status.textContent = 'Finding your mixes…'; songsStatus.textContent = 'Finding songs…';
      let lists = [], tracks = [], failed = false;
      try {
        const result = options.mode==='songs' ? {results:[]} : await options.playlists(query);
        if (current !== generation) return;
        lists = result.results; renderCards(lists);
        status.textContent = lists.length ? '' : 'No playlists found. Try another mood.';
      } catch (error) {
        if (current !== generation) return;
        failed = true;
        const description = AartiPlaylists.describe(error);
        status.textContent = description.join(' — ');
      }
      try {
        const result = options.mode==='playlists' ? {results:[]} : await options.songs(query);
        if (current !== generation) return;
        tracks = result.results; renderSongs(tracks);
        songsStatus.textContent = tracks.length ? '' : 'No songs found for this mood.';
      } catch (_) {
        if (current !== generation) return;
        failed = true; songsStatus.textContent = 'Songs could not load. Tap Refresh to retry.';
      }
      if (current === generation) { busy = false; if (!failed) cache((options.mode||'all')+query, { playlists: lists, songs: tracks }); }
    }
    return { refresh };
  };
})(window);
