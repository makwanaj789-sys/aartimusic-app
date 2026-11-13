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
