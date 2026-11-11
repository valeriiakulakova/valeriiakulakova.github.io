/* Eigener Mauszeiger: feiner Ring, der dem Zeiger leicht nachläuft, und ein oranger Punkt genau am Zeiger.
   Über Links, Knöpfen und antippbaren Flächen wird der Ring größer.
   Nur mit Maus oder Trackpad (pointer: fine). Auf Touch-Geräten bleibt alles wie gewohnt.
   Bei „weniger Bewegung“ folgt der Ring ohne Nachlaufen. In Textfeldern bleibt der normale Text-Cursor.
   Bleibt beim Seitenwechsel ohne Neuladen (nav.js) erhalten. */
(function () {
  if (window.Cursor) return;
  const fine = window.matchMedia && matchMedia('(pointer: fine)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const on = (t, type, fn, opt) => (window.SoftNav ? SoftNav.on(t, type, fn, opt) : t.addEventListener(type, fn, opt));
  const raf = window.SoftNav && SoftNav.raf ? SoftNav.raf : window.requestAnimationFrame.bind(window);
  let ring = null, dot = null, x = -100, y = -100, rx = -100, ry = -100, seen = false;
  const HOVER = 'a, button, [role="button"], [role="switch"], summary, label, select, .stage, canvas, [data-demo]';

  function attach() {
    if (!fine || !document.body) return;
    if (!ring) {
      ring = document.createElement('div'); ring.className = 'cur-ring'; ring.setAttribute('aria-hidden', 'true');
      dot = document.createElement('div'); dot.className = 'cur-dot'; dot.setAttribute('aria-hidden', 'true');
    }
    document.body.append(ring, dot);
    document.documentElement.classList.add('has-cursor');
    if (seen) document.documentElement.classList.add('cursor-on');
  }

  if (fine) {
    on(window, 'pointermove', e => {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      x = e.clientX; y = e.clientY;
      document.documentElement.classList.toggle('cursor-native', !!document.querySelector('dialog[open]'));
      if (!seen) { seen = true; rx = x; ry = y; document.documentElement.classList.add('cursor-on'); }
      const t = e.target && e.target.closest ? e.target.closest(HOVER) : null;
      if (ring) ring.classList.toggle('hover', !!t);
    }, { passive: true });
    on(document, 'mouseleave', () => { seen = false; document.documentElement.classList.remove('cursor-on'); });
    on(window, 'pointerdown', () => ring && ring.classList.add('down'));
    on(window, 'pointerup', () => ring && ring.classList.remove('down'));
    (function loop() {
      const k = reduce ? 1 : 0.22;
      rx += (x - rx) * k; ry += (y - ry) * k;
      if (ring) { ring.style.transform = `translate(${rx}px,${ry}px)`; dot.style.transform = `translate(${x}px,${y}px)`; }
      // Offenes Fenster (Video, Showreel) liegt immer über allem, auch über diesem Zeiger: dann normaler Mauszeiger
      document.documentElement.classList.toggle('cursor-native', !!document.querySelector('dialog[open]'));
      raf(loop);
    })();
    if (document.body) attach(); else on(document, 'DOMContentLoaded', attach);
  }
  window.Cursor = { attach };
})();
