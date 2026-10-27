/* ============================================================
   SWIPE A ROW
   Sideways on a song row: right for one action, left for another,
   the way Spotify puts "play next" and "add to queue" under a
   thumb. Up and down stay the list's — a gesture only becomes a
   swipe once it is clearly more sideways than vertical, and until
   then the browser keeps scrolling. Past the threshold the hint
   behind the row lights and a tick of haptics says "let go now".
   ============================================================ */
(function (root) {
  'use strict';
  const REDUCED = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const THRESHOLD = 84;

  root.AartiRowSwipe = function (row, actions, buzz) {
    const hint = document.createElement('span');
    hint.className = 'swipe-hint'; hint.setAttribute('aria-hidden', 'true');
    row.prepend(hint);
    row.classList.add('swipeable');
    let s = null, armed = false, swipedAt = 0;
    // The click that follows a swipe is not a tap on the row.
    row.addEventListener('click', (c) => {
      if (Date.now() - swipedAt < 400) { c.stopPropagation(); c.preventDefault(); }
    }, true);

    function set(dx) {
      row.style.setProperty('--sx', dx.toFixed(1) + 'px');
      const side = dx > 0 ? actions.right : actions.left;
      const past = Math.abs(dx) >= THRESHOLD;
      hint.textContent = side ? side.label : '';
      hint.dataset.side = dx > 0 ? 'right' : 'left';
      row.classList.toggle('swipe-armed', past && !!side);
      if (past !== armed) { armed = past; if (past && side && buzz) buzz('light'); }
    }
    function settle() {
      row.classList.remove('swiping'); row.classList.add('swipe-return');
      row.style.setProperty('--sx', '0px');
      setTimeout(() => row.classList.remove('swipe-return', 'swipe-armed'), REDUCED ? 0 : 320);
    }

    row.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.isPrimary === false) return;
      // A swipe may start anywhere on the row, buttons included — the
      // click guard above keeps a swipe from also pressing them. The
      // reorder handle drags instead, and the very edge is the drawer's.
      if (e.target.closest('a,input,.q-handle') || e.clientX < 24) return;
      s = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, locked: false };
    });
    row.addEventListener('pointermove', (e) => {
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.locked) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }   // a scroll
        if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
        s.locked = true; armed = false;
        row.classList.add('swiping');
        try { row.setPointerCapture(e.pointerId); } catch (_) {}
      }
      // Free up to the threshold, then it drags heavier.
      const side = dx > 0 ? actions.right : actions.left;
      const a = Math.abs(dx), lim = side ? THRESHOLD : 24;
      s.dx = Math.sign(dx) * (a < lim ? a : lim + (a - lim) * 0.35);
      set(s.dx);
    });
    function end(e, cancelled) {
      if (!s || s.id !== e.pointerId) return;
      const was = s; s = null;
      if (!was.locked) return;
      swipedAt = Date.now();
      const side = was.dx > 0 ? actions.right : actions.left;
      settle();
      if (!cancelled && side && Math.abs(was.dx) >= THRESHOLD) side.run();
    }
    row.addEventListener('pointerup', (e) => end(e, false));
    row.addEventListener('pointercancel', (e) => end(e, true));
  };
})(window);
