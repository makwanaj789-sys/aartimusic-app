/* The desktop layer over the phone pages: a bar to drag the window
   by, keyboard shortcuts, and the link to the tray and the taskbar.
   Injected by main.js; the pages themselves are not changed. */
(() => {
  const desk = window.aartiDesktop;
  if (!desk || document.documentElement.classList.contains('desktop')) return;
  const root = document.documentElement, $ = (id) => document.getElementById(id);
  const audio = $('audio');
  root.classList.add('desktop');

  /* ---------- the bar across the top ------------------------ */
  const bar = document.createElement('div');
  bar.className = 'desk-bar';
  bar.innerHTML = '<span class="desk-name"><img src="brand-icon.png" alt="">AartiMusic</span>' +
    '<button type="button" class="desk-mini-btn" aria-label="Mini player" title="Mini player (Ctrl+M)">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><rect class="in" x="12" y="12" width="7" height="6" rx="1.5"/></svg></button>';
  document.body.append(bar);
  let mini = false;
  const paintMini = (on) => { mini = !!on; root.classList.toggle('desk-mini', mini); bar.querySelector('button').setAttribute('aria-pressed', String(mini)); };
  bar.querySelector('button').addEventListener('click', () => desk.setMini(!mini));
  desk.onMini(paintMini);
  desk.state().then((s) => paintMini(s && s.mini), () => {});

  /* ---------- the window buttons follow the theme ----------- */
  const hex = (css) => {
    const m = String(css).match(/\d+(\.\d+)?/g);
    if (/^#[0-9a-f]{6}$/i.test(String(css).trim())) return String(css).trim();
    return m && m.length >= 3 ? '#' + m.slice(0, 3).map((n) => Math.round(+n).toString(16).padStart(2, '0')).join('') : null;
  };
  function chrome() {
    const s = getComputedStyle(root);
    const color = hex(s.getPropertyValue('--bg')), symbol = hex(s.getPropertyValue('--ink'));
    if (color && symbol) desk.chrome({ color, symbol });
  }
  new MutationObserver(chrome).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  chrome();

  /* ---------- what is playing, for the tray and taskbar ----- */
  let sent = '';
  function report() {
    const has = !!$('mini') && !$('mini').hidden;
    const state = { has, title: has ? $('mTitle').textContent : '', artist: has ? $('mArtist').textContent : '',
                    playing: !!audio && !audio.paused && !audio.ended };
    const key = JSON.stringify(state);
    if (key !== sent) { sent = key; desk.now(state); }
  }
  if (audio) ['playing', 'pause', 'ended', 'emptied', 'loadstart'].forEach((e) => audio.addEventListener(e, report));
  ['mTitle', 'mArtist', 'mini'].forEach((id) => { if ($(id)) new MutationObserver(report).observe($(id), { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }); });
  report();

  /* ---------- play / next / previous from outside ----------- */
  const act = {
    toggle: () => $('mPlay') && $('mPlay').click(),
    next: () => $('nNext') && $('nNext').click(),
    prev: () => $('nPrev') && $('nPrev').click(),
  };
  desk.onControl((action) => { if (act[action]) act[action](); });

  /* ---------- rows that scroll sideways ---------------------
     On a phone these rows (playlists, mixes, chips) move under a
     thumb. A mouse has no such gesture, so here the wheel moves the
     row the pointer is over, and an arrow appears at whichever end
     has more to show; it goes again when that end is reached or the
     pointer leaves. */
  const sideways = (el) => {
    for (; el && el !== document.body && el.nodeType === 1; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 8) {
        const o = getComputedStyle(el).overflowX;
        if (o === 'auto' || o === 'scroll') return el;
      }
    }
    return null;
  };
  const arrows = ['prev', 'next'].map((dir) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'desk-arrow desk-arrow-' + dir; b.tabIndex = -1;
    b.setAttribute('aria-label', dir === 'prev' ? 'Scroll back' : 'Scroll forward');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (dir === 'prev' ? 'M14.5 5.5L8 12l6.5 6.5' : 'M9.5 5.5L16 12l-6.5 6.5') + '"/></svg>';
    b.addEventListener('click', () => { if (row) row.scrollBy({ left: (dir === 'prev' ? -1 : 1) * Math.max(160, row.clientWidth * 0.8), behavior: 'smooth' }); });
    document.body.append(b);
    return b;
  });
  let row = null, rowFrame = 0, rowTimer = 0;
  function placeArrows() {
    rowFrame = 0;
    const r = row && row.isConnected ? row.getBoundingClientRect() : null;
    if (!r || r.width < 120 || row.scrollWidth <= row.clientWidth + 8) { arrows.forEach((b) => b.classList.remove('on')); if (r === null) row = null; return; }
    const size = Math.max(28, Math.min(44, r.height - 8)), y = r.top + (r.height - size) / 2;
    const seen = y >= 36 && y + size <= innerHeight;                    // not under the bar, not off the window
    const more = [seen && row.scrollLeft > 4, seen && row.scrollLeft < row.scrollWidth - row.clientWidth - 4];
    arrows.forEach((b, i) => {
      b.style.width = b.style.height = size + 'px';
      b.style.top = y + 'px';
      b.style.left = (i === 0 ? Math.max(6, r.left + 6) : Math.min(innerWidth - size - 6, r.right - size - 6)) + 'px';
      b.classList.toggle('on', more[i]);
    });
  }
  const queueArrows = () => { if (!rowFrame) rowFrame = requestAnimationFrame(placeArrows); };
  function watch(el) {
    if (el === row) return;
    if (row) row.removeEventListener('scroll', queueArrows);
    row = el;
    if (row) row.addEventListener('scroll', queueArrows, { passive: true });
    // The page around a row can move without any scroll (a list above it
    // finishes loading): keep the arrows on the row while it is watched.
    clearInterval(rowTimer);
    if (row) rowTimer = setInterval(queueArrows, 250);
    queueArrows();
  }
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    if (e.target.closest && e.target.closest('.desk-arrow')) return;      // still on the same row
    watch(sideways(e.target));
  });
  document.addEventListener('pointerleave', () => watch(null));
  addEventListener('scroll', queueArrows, { passive: true, capture: true });
  addEventListener('resize', queueArrows);
  // The wheel moves the row under the pointer, until that row runs
  // out; then it moves the page again.
  addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const el = sideways(e.target);
    if (!el) return;
    const room = e.deltaY > 0 ? el.scrollWidth - el.clientWidth - el.scrollLeft : el.scrollLeft;
    if (room < 2) return;
    e.preventDefault();
    el.scrollBy({ left: e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY, behavior: 'auto' });
  }, { passive: false, capture: true });

  /* ---------- keyboard -------------------------------------- */
  const typing = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const playing = () => !!$('mini') && !$('mini').hidden;
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey) return;
    const ctrl = e.ctrlKey || e.metaKey, t = e.target;
    if (ctrl && (e.key === 'f' || e.key === 'k')) {
      e.preventDefault();
      const tab = document.querySelector('[data-tab="Search"]'); if (tab) tab.click();
      const q = $('q'); if (q) { q.focus(); q.select(); }
      return;
    }
    if (ctrl && e.key === 'm') { e.preventDefault(); desk.setMini(!mini); return; }
    if (ctrl && e.key === 'ArrowRight' && playing()) { e.preventDefault(); act.next(); return; }
    if (ctrl && e.key === 'ArrowLeft' && playing()) { e.preventDefault(); act.prev(); return; }
    if (ctrl || typing(t)) return;
    if (document.querySelector('dialog[open]')) return;
    // A focused button keeps its own Space and Enter.
    if (e.key === ' ' && playing() && !(t && t.tagName === 'BUTTON')) { e.preventDefault(); act.toggle(); return; }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && playing() && audio && isFinite(audio.duration) && t === document.body) {
      e.preventDefault();
      audio.currentTime = Math.max(0, Math.min(audio.duration - 1, audio.currentTime + (e.key === 'ArrowRight' ? 5 : -5)));
      return;
    }
    if (e.key === 'Escape') {
      const open = ['lyClose', 'queueClose', 'plClose', 'nowClose'].map($).find((b) => b && b.closest('.open'));
      if (open) { e.preventDefault(); open.click(); }
    }
  });
})();
