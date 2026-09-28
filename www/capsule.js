/* Native-only, opt-in floating playback. Permission is never requested on launch. */
(() => {
  const c = window.Capacitor;
  if (!c?.isNativePlatform?.() || !c?.isPluginAvailable?.('FloatingCapsule')) return;
  const api = c.Plugins?.FloatingCapsule || c.registerPlugin('FloatingCapsule');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let status, toggle, grant, last, busy = false, syncedMotion = false;
  function report(error) { status.textContent = error?.message || String(error); }
  async function refresh() {
    try {
      last = await api.status();
      if (!syncedMotion && last.enabled && last.permitted) {
        syncedMotion = true; await api.configure({enabled:true,reducedMotion:motion.matches});
      }
      toggle.checked = !!last.enabled;
      grant.hidden = !!last.permitted;
      toggle.disabled = !last.permitted || busy;
      status.textContent = last.error || (!last.permitted
        ? 'Allow display over other apps, then switch on the floating player.'
        : last.enabled ? 'Play a song, then go Home. Tap the capsule arrow for controls; hold to dismiss.'
        : 'Off. Android notifications and supported system Live Alerts still work normally.');
    } catch (e) { report(e); }
  }
  async function configure() {
    busy = true; toggle.disabled = true; let failure;
    try { await api.configure({enabled:toggle.checked,reducedMotion:motion.matches}); }
    catch (e) { failure = e; }
    finally { busy = false; await refresh(); if (failure) report(failure); }
  }
  function install() {
    const drawer = document.querySelector('.settings-drawer');
    if (!drawer) return;
    const section = document.createElement('section'); section.className = 'capsule-settings';
    section.innerHTML = '<h3>Floating player</h3><p class="pref-copy">A small music capsule appears when you minimize Aarti Music. Requires display over other apps permission.</p><label class="capsule-toggle"><span>Show when minimized</span><input type="checkbox" aria-label="Show floating player when minimized"></label><button type="button">Allow display over other apps</button><p class="pref-copy" role="status" aria-live="polite"></p>';
    toggle = section.querySelector('input'); grant = section.querySelector('button'); status = section.querySelector('[role=status]');
    drawer.append(section);
    toggle.addEventListener('change',configure);
    grant.addEventListener('click',async () => { try { await api.requestPermission(); } catch (e) { report(e); } });
    document.addEventListener('visibilitychange',() => { if (!document.hidden) refresh(); });
    window.addEventListener('focus',refresh);
    new MutationObserver(() => { if (drawer.open) refresh(); }).observe(drawer,{attributes:true,attributeFilter:['open']});
    motion.addEventListener('change',() => { if (last) configure(); });
    refresh();
  }
  // app.js builds settings synchronously before DOMContentLoaded.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();
