/* Home discovery is independent of playback and the user's saved library. */
(function (root) {
  'use strict';
  root.AartiDiscovery = function (options) {
    const host = options.host;
    const categories = [['For you', 'Hindi Bollywood music'], ['Hindi', 'Hindi hits'], ['Punjabi', 'Punjabi hits'], ['Garba', 'Gujarati garba'], ['Chill', 'Hindi lofi chill']];
    let generation = 0, selected = 0, activeKey = '', busy = false;
    const memory = new Map();
    const savedKey = 'aarti.discovery.v1';
    try {
      const entries = JSON.parse(localStorage.getItem(savedKey) || '[]');
      for (const [key, value] of entries) if (Date.now() - value.at < 21600000) memory.set(key, value);
    } catch (_) {}
    function el(tag, className, text) { const n = document.createElement(tag); n.className = className || ''; if (text) n.textContent = text; return n; }
    const chips = el('div', 'discovery-chips');
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
    categories.forEach(([name], i) => {
      const b = el('button', 'chip', name); b.type = 'button';
      b.addEventListener('click', () => { selected = i; refresh(true); }); chips.append(b);
    });
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
        const img = el('img'); img.alt = ''; img.loading = 'lazy';
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
        const img = el('img'); img.alt = ''; img.loading = 'lazy'; if (song.thumb) img.src = song.thumb;
        const meta = el('span', 'discovery-song-meta');
        meta.append(el('span', 'discovery-title', song.title), el('span', 'discovery-by', song.artist || 'Music for you'));
        row.append(img, meta, el('span', 'discovery-song-play', '▶'));
        row.addEventListener('click', () => options.playSongs(list, i)); songs.append(row);
      });
    }
    async function refresh(force, bypass) {
      const recent = options.artist();
      const query = selected === 0 && recent ? recent + ' songs' : categories[selected][1];
      if (!force && activeKey === query) return;
      const current = ++generation; activeKey = query; busy = true;
      [...chips.children].forEach((b, i) => { b.classList.toggle('active', selected === i); b.setAttribute('aria-pressed', String(selected === i)); });
      title.textContent = selected === 0 && recent ? 'More of what you love' : selected === 0 ? 'Made for your mood' : categories[selected][0] + ' mixes';
      sub.textContent = selected === 0 && recent ? 'Inspired by ' + recent : 'Playlists picked for your next listen';
      const saved = !bypass && memory.get(query);
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
        const result = await options.playlists(query);
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
        const result = await options.songs(query);
        if (current !== generation) return;
        tracks = result.results; renderSongs(tracks);
        songsStatus.textContent = tracks.length ? '' : 'No songs found for this mood.';
      } catch (_) {
        if (current !== generation) return;
        failed = true; songsStatus.textContent = 'Songs could not load. Tap Refresh to retry.';
      }
      if (current === generation) { busy = false; if (!failed) cache(query, { playlists: lists, songs: tracks }); }
    }
    return { refresh };
  };
})(window);
