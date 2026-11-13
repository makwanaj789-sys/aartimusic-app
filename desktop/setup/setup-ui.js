/* The setup window: welcome → installing → done, or ask → removing → removed. */
(() => {
  const $ = (id) => document.getElementById(id);
  const api = window.setup;
  let dir = '', mode = 'install', current = null;

  // The bars under the mark and the sparks in the room.
  $('bars').innerHTML = [18, 30, 44, 26, 38, 22, 34, 14].map((h, i) => `<i style="height:${h}px;animation-delay:${-i * 0.14}s"></i>`).join('');
  $('sparks').innerHTML = Array.from({ length: 14 }, (_, i) =>
    `<span class="spark" style="left:${6 + (i * 53) % 88}%;animation-duration:${7 + (i * 3) % 8}s;animation-delay:${-(i * 1.7) % 9}s"></span>`).join('');

  function show(id) {
    if (current) { current.classList.remove('on'); current.classList.add('gone'); }
    current = $(id);
    current.classList.remove('gone');
    requestAnimationFrame(() => current.classList.add('on'));
    const first = current.querySelector('.go'); if (first) setTimeout(() => first.focus({ preventScroll: true }), 350);
  }

  const TIPS = ['Tip: press Ctrl+M for a mini player that stays on top.', 'Tip: closing the window keeps the music playing in the tray.',
                'Tip: Space plays and pauses. Ctrl+F jumps to search.', 'Tip: your keyboard\'s media keys work too.'];
  let tipTimer = 0;
  function working(eyebrow) {
    document.body.classList.add('working');
    $('x').hidden = true;
    $('workEyebrow').textContent = eyebrow;
    progress({ value: 0, label: 'Preparing' });
    let i = 0; $('tip').textContent = mode === 'install' ? TIPS[0] : '';
    clearInterval(tipTimer);
    if (mode === 'install') tipTimer = setInterval(() => { $('tip').style.opacity = 0; setTimeout(() => { $('tip').textContent = TIPS[++i % TIPS.length]; $('tip').style.opacity = 1; }, 400); }, 3200);
    show('pWork');
  }
  function rest() { document.body.classList.remove('working'); $('x').hidden = false; clearInterval(tipTimer); }
  function progress(p) {
    const v = Math.max(0, Math.min(1, +p.value || 0));
    $('pct').textContent = Math.round(v * 100);
    $('fill').style.transform = `scaleX(${v})`;
    if (p.label) $('step').textContent = p.label;
  }
  api.onProgress(progress);

  async function install() {
    working('INSTALLING');
    const started = Date.now();
    const r = await api.install({ dir, desktop: $('oDesktop').checked, startup: $('oStartup').checked });
    // Long enough to be seen, even on a fast disk.
    await new Promise((done) => setTimeout(done, Math.max(0, 1400 - (Date.now() - started))));
    rest();
    if (!r || !r.ok) { $('why').textContent = (r && r.error) || 'Setup could not finish.'; show('pFail'); return; }
    $('doneDesk').hidden = !$('oDesktop').checked;
    show('pDone');
  }
  async function remove() {
    working('REMOVING');
    const started = Date.now();
    const r = await api.uninstall({ data: $('oData').checked });
    await new Promise((done) => setTimeout(done, Math.max(0, 1200 - (Date.now() - started))));
    rest();
    if (!r || !r.ok) { $('why').textContent = (r && r.error) || 'AartiMusic could not be removed.'; show('pFail'); return; }
    show('pGone');
  }

  $('install').onclick = install;
  $('retry').onclick = () => (mode === 'install' ? install() : remove());
  $('change').onclick = async () => { const picked = await api.folder(dir); if (picked) setDir(picked); };
  $('open').onclick = () => api.finish(true);
  $('later').onclick = () => api.finish(false);
  $('remove').onclick = remove;
  $('bye').onclick = () => api.finish(false);
  ['x', 'quit', 'keep'].forEach((id) => { $(id).onclick = () => api.close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('x').hidden) api.close(); });

  function setDir(d) { dir = d; $('dir').textContent = '‎' + d; $('dir').title = d; }
  api.info().then((info) => {
    mode = info.mode; setDir(info.dir);
    $('ver').textContent = 'Version ' + info.version;
    document.title = mode === 'install' ? 'AartiMusic Setup' : 'Remove AartiMusic';
    show(mode === 'install' ? 'pWelcome' : 'pAsk');
  });
})();
