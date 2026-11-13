/* Seitenwechsel ohne Neuladen.
   Warum: Browser geben Ton erst nach einem Klick frei, und nur für die gerade geladene Seite.
   Lädt man die nächste Seite neu, ist der Ton wieder gesperrt. Hier wird beim Klick auf einen
   internen Link nur der Inhalt getauscht; der Ton (sound.js) läuft weiter, auch beim Scrollen.
   Ablauf:
     - interne Links (*.html) werden abgefangen, die Seite per fetch geholt und eingesetzt
     - alles, was die alte Seite an Fenster-Listenern, Animationen, Timern und Beobachtern
       angemeldet hat, wird vorher abgemeldet, damit nichts doppelt läuft
     - die Skripte der neuen Seite laufen danach ganz normal
     - Zurück/Vor im Browser funktioniert, die Adresse in der Leiste stimmt
   Geht etwas schief, wird die Seite einfach normal geladen. Muss als erstes Skript im <head> stehen. */
(function () {
  if (window.SoftNav) return;
  let gen = 0;                       // Nummer der aktuell angezeigten Seite
  const tracked = [];                // [ziel, typ, funktion, optionen, gen]
  const observers = [];              // [beobachter, gen]
  const intervals = [];              // [id, gen]

  // Originale aufheben, bevor wir sie umhüllen
  const raw = {
    winAdd: window.addEventListener.bind(window),
    docAdd: document.addEventListener.bind(document),
    winRemove: window.removeEventListener.bind(window),
    docRemove: document.removeEventListener.bind(document),
    raf: window.requestAnimationFrame.bind(window),
    setTimeout: window.setTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window)
  };

  // Fenster- und Dokument-Listener mitschreiben, damit sie beim Seitenwechsel wieder wegkommen
  window.addEventListener = function (type, fn, opt) { tracked.push([window, type, fn, opt, gen]); return raw.winAdd(type, fn, opt); };
  document.addEventListener = function (type, fn, opt) { tracked.push([document, type, fn, opt, gen]); return raw.docAdd(type, fn, opt); };
  // Animationen und Timer der alten Seite laufen nach dem Wechsel nicht weiter
  window.requestAnimationFrame = function (cb) { const g = gen; return raw.raf(t => { if (g === gen) cb(t); }); };
  window.setTimeout = function (cb, ms, ...a) { const g = gen; return raw.setTimeout(() => { if (g === gen && typeof cb === 'function') cb(...a); }, ms); };
  window.setInterval = function (cb, ms, ...a) { const id = raw.setInterval(cb, ms, ...a); intervals.push([id, gen]); return id; };
  ['IntersectionObserver', 'ResizeObserver', 'MutationObserver'].forEach(name => {
    const O = window[name]; if (!O) return;
    window[name] = class extends O { constructor(cb, o) { super(cb, o); observers.push([this, gen]); } };
  });

  function cleanup(old) {
    for (let i = tracked.length - 1; i >= 0; i--) {
      const [t, type, fn, opt, g] = tracked[i];
      if (g !== old) continue;
      (t === window ? raw.winRemove : raw.docRemove)(type, fn, opt);
      tracked.splice(i, 1);
    }
    for (let i = observers.length - 1; i >= 0; i--) if (observers[i][1] === old) { observers[i][0].disconnect(); observers.splice(i, 1); }
    for (let i = intervals.length - 1; i >= 0; i--) if (intervals[i][1] === old) { raw.clearInterval(intervals[i][0]); intervals.splice(i, 1); }
  }

  const SKIP = /(^|\/)(nav|sound|pixel|cursor)\.js(\?|$)/;
  function runScripts(scripts) {
    for (const old of scripts) {
      const src = old.getAttribute('src');
      const loaded = src && ((/sound\.js/.test(src) && window.Sound) || (/pixel\.js/.test(src) && window.PixelFont) || /nav\.js/.test(src) || (/cursor\.js/.test(src) && window.Cursor));
      if (src && SKIP.test(src) && loaded) {
        if (/pixel\.js/.test(src) && window.PixelFont) document.querySelectorAll('[data-pixel]').forEach(el => { if (!el.querySelector('svg')) PixelFont.render(el); });
        if (/sound\.js/.test(src) && window.Sound && Sound.bindToggles) Sound.bindToggles();
        old.remove(); continue;
      }
      const s = document.createElement('script');
      if (src) s.src = src; else s.textContent = old.textContent;
      old.replaceWith(s);
    }
  }

  let busy = false;
  async function go(url, push) {
    if (busy) return; busy = true;
    try {
      const res = await fetch(url, { credentials: 'same-origin', cache: 'no-cache' });   // HTML immer beim Server nachfragen: nach einem Update keine alte Seite
      if (!res.ok) throw new Error(res.status);
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      if (!doc.body || !doc.querySelector('script[src*="nav.js"]')) throw new Error('keine Soft-Seite');
      const old = gen; gen++; cleanup(old);
      if (push) history.pushState({ soft: true }, '', url);
      document.title = doc.title;
      const md = document.querySelector('meta[name="description"]'), nd = doc.querySelector('meta[name="description"]');
      if (md && nd) md.setAttribute('content', nd.getAttribute('content'));
      document.documentElement.className = doc.documentElement.className;
      document.documentElement.lang = doc.documentElement.lang || 'de';   // Sprache der neuen Seite (de / en) für Vorlesen und Ton-/Sprach-Schalter
      const headScripts = [...doc.head.querySelectorAll('script')].filter(s => !s.src);
      const body = document.adoptNode(doc.body);
      document.body.replaceWith(body);
      // Kopf-Skripte der neuen Seite (z. B. die Klasse „js“) zuerst, dann die im Körper
      headScripts.forEach(h => { const s = document.createElement('script'); s.textContent = h.textContent; document.head.appendChild(s); s.remove(); });
      runScripts([...body.querySelectorAll('script')]);
      if (window.Sound && Sound.pageChanged) Sound.pageChanged();
      if (window.Cursor) Cursor.attach();
      const hash = new URL(url, location.href).hash;
      const target = hash && document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) target.scrollIntoView(); else window.scrollTo(0, 0);
      // Fokus auf den Inhalt, damit Tastatur und Screenreader auf der neuen Seite beginnen
      const main = document.getElementById('inhalt') || document.getElementById('case') || document.querySelector('main');
      if (main) { if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1'); main.setAttribute('data-softfocus', ''); main.focus({ preventScroll: true }); }
    } catch (e) {
      console.warn('Seitenwechsel ohne Neuladen nicht möglich, lade normal:', e);
      location.href = url;
    } finally { busy = false; }
  }

  function internal(a) {
    if (!a || a.target || a.hasAttribute('download')) return false;
    const href = a.getAttribute('href'); if (!href || href.startsWith('#') || href.startsWith('mailto:')) return false;
    const u = new URL(href, location.href);
    if (u.origin !== location.origin) return false;
    if (!/\.html$/.test(u.pathname) && !u.pathname.endsWith('/')) return false;
    if (u.pathname === location.pathname && u.hash) return false;   // Sprung innerhalb der Seite
    return u.href;
  }

  // Auf file:// (lokal geöffnet) kann fetch nicht laden: dann bleibt alles beim normalen Seitenwechsel
  const enabled = location.protocol === 'http:' || location.protocol === 'https:';
  if (enabled) {
    raw.docAdd('click', e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const url = internal(e.target.closest && e.target.closest('a'));
      if (!url) return;
      e.preventDefault(); go(url, true);
    });
    raw.winAdd('popstate', () => go(location.href, false));
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  }

  window.SoftNav = {
    enabled,
    go: url => enabled ? go(new URL(url, location.href).href, true) : (location.href = url),
    // Timer, die einen Seitenwechsel überdauern (für Ton und Tests)
    later: (fn, ms) => raw.setTimeout(fn, ms),
    raf: cb => raw.raf(cb),
    // Für dauerhafte Dinge (Ton), die beim Seitenwechsel bleiben sollen
    on: (t, type, fn, opt) => (t === document ? raw.docAdd : raw.winAdd)(type, fn, opt)
  };
})();
