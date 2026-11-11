/* Klänge, im Browser erzeugt (Web Audio), keine Audiodateien.
   Standard: an. Die Wahl „an/aus“ merkt sich der Browser für die anderen Seiten.
   Browser erlauben Ton auf jeder Seite erst nach einem Klick, Tipp oder Tastendruck
   (Scrollen zählt nicht). Ist der Ton an, aber noch gesperrt, zeigt der Schalter
   „( tap for sound )“; der erste Klick irgendwo auf der Seite startet ihn.
   Nutzung:
     Sound.key()        kurzer Tastenklick beim Tippen
     Sound.tick()       kleiner Ton für Buttons
     Sound.hover()      sehr leiser Klick beim Überfahren
     Sound.whoosh()     Rauschen, das aufsteigt, beim Zoom in einen Ordner
     Sound.motion(x)    leises Rauschen, dessen Lautstärke der Bewegung folgt (0 … 1)
     Sound.count(k)     kurzer Ton beim Hochzählen, steigt mit k (0 … 1)
     Sound.pop()        weicher Ton beim Wechsel eines Screens im Showreel
     Sound.chime()      zwei helle Töne, wenn eine neue Jahreszahl erscheint
   Seitenmusik: <body data-music="media/sounds/….mp3"> startet leise, sobald der Ton frei ist,
   läuft einmal durch und blendet beim Seitenwechsel weich in die Musik der nächsten Seite über. */
(function () {
  let ctx = null, on = false, noise = null, bedGain = null, bedFilter = null;
  let musicBus = null, analyser = null, freq = null;   // Musik läuft über einen Bus mit „Zuhörer“ für den Beat
  let labels = [];
  let gestured = false;    // gab es in dieser Sitzung schon einen Klick, Tipp oder Tastendruck?
  // Safari meldet manchmal „running“, spielt aber vor dem ersten Klick nichts ab: deshalb zählt erst die Geste
  const ready = () => gestured && !!ctx && ctx.state === 'running';
  const refresh = () => labels.forEach(f => f());
  // Effekt-Klänge nur auf Seiten ohne eigene Musik (Startseite); About, Case, Kontakt haben nur ihre Musik
  const fx = () => on && !(document.body && document.body.dataset.music);
  // Dauerhafte Listener: bleiben beim Seitenwechsel ohne Neuladen (nav.js) erhalten
  const listen = (tg, type, fn, opt) => window.SoftNav ? SoftNav.on(tg, type, fn, opt) : tg.addEventListener(type, fn, opt);

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    ctx.onstatechange = refresh;
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Grundrauschen für Bewegung: läuft dauerhaft, ist aber stumm, bis sich etwas bewegt
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    bedFilter = ctx.createBiquadFilter(); bedFilter.type = 'bandpass'; bedFilter.frequency.value = 2600; bedFilter.Q.value = 0.9;
    bedGain = ctx.createGain(); bedGain.gain.value = 0;
    src.connect(bedFilter).connect(bedGain).connect(ctx.destination); src.start();
    musicBus = ctx.createGain(); musicBus.connect(ctx.destination);
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.35;
    musicBus.connect(analyser); freq = new Uint8Array(analyser.frequencyBinCount);
  }

  function burst(freq, vol, len, q) {
    if (!fx() || !ctx) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(ctx.destination);
    s.start(t, Math.random() * 0.8, len + 0.02);
  }

  function tone(freq, vol, len) {
    if (!fx() || !ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + len + 0.02);
  }

  // ---- Seitenmusik (Dateien von Pixabay, lokal in media/sounds) ----
  const MUSIC_VOL = 0.22, FADE = 0.8;
  const buffers = {};            // geladene Musik, je Datei einmal
  let music = null;              // { src, node, gain } – das Stück der aktuellen Seite
  const playing = new Set();     // alle gestarteten Musikstücke, damit beim Wechsel sicher jedes endet
  let musicOn = true;           // Seitenmusik: Standard an, gilt für alle Seiten, bis man sie ausschaltet
  let musicGen = 0;
  let finishedSrc = '';          // Stück dieser Seite ist zu Ende gespielt: nicht bei jedem Klick neu starten              // jede Seite bekommt eine Nummer; ältere Ladevorgänge werden verworfen
  const later = (fn, ms) => (window.SoftNav ? SoftNav.later(fn, ms) : setTimeout(fn, ms));
  async function loadBuffer(src) {
    if (!buffers[src]) buffers[src] = fetch(src).then(r => r.arrayBuffer()).then(b => new Promise((ok, no) => ctx.decodeAudioData(b, ok, no)));
    return buffers[src];
  }
  function stopMusic() {
    music = null;
    if (!ctx) { playing.clear(); return; }
    const t = ctx.currentTime;
    playing.forEach(m => {
      if (m.stopping) return; m.stopping = true;
      try { m.gain.gain.cancelScheduledValues(t); m.gain.gain.setTargetAtTime(0, t, FADE / 4); } catch (e) {}
      try { m.node.stop(t + FADE + 0.1); } catch (e) {}
      // Sicherheitsnetz: nach dem Ausblenden auf jeden Fall trennen
      later(() => { try { m.node.disconnect(); m.gain.disconnect(); } catch (e) {} playing.delete(m); }, (FADE + 0.2) * 1000);
    });
  }
  async function syncMusic() {
    const src = (document.body && document.body.dataset.music) || '';
    if (!musicOn || !src || !ctx) { musicGen++; stopMusic(); return; }
    if (music && music.src === src && !music.stopping) return;      // läuft schon für diese Seite
    if (src === finishedSrc) return;                                 // schon einmal ganz gehört
    const my = ++musicGen;
    stopMusic();
    let buf;
    try { buf = await loadBuffer(src); } catch (e) { return; }
    if (my !== musicGen || !musicOn) return;                         // inzwischen andere Seite oder wieder aus
    const node = ctx.createBufferSource(); node.buffer = buf;
    const gain = ctx.createGain(); const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(MUSIC_VOL, t + FADE);
    node.connect(gain).connect(musicBus || ctx.destination); node.start(t);
    const m = { src, node, gain, stopping: false }; music = m; playing.add(m);
    node.onended = () => { playing.delete(m); if (music === m) { music = null; if (!m.stopping) finishedSrc = m.src; } };
  }

  const Sound = {
    get on() { return on; },
    get musicSrc() { return music ? music.src : ''; },   // welche Seitenmusik gerade läuft (zum Prüfen)
    get musicOn() { return musicOn; },
    // Bass-Lautstärke der laufenden Musik, 0 … 1 (für Elemente, die im Beat pulsieren)
    level() {
      if (!analyser || !music || !ctx || ctx.state !== 'running') return 0;
      analyser.getByteFrequencyData(freq);
      const hz = ctx.sampleRate / analyser.fftSize, a = Math.max(1, Math.round(40 / hz)), b = Math.max(a + 1, Math.round(160 / hz));
      let s = 0; for (let i = a; i <= b; i++) s += freq[i];
      return s / ((b - a + 1) * 255);
    },
    // Effekt-Klänge (Startseite, Zahlen, Klicks) an/aus
    set(v) {
      on = !!v;
      if (on) Sound.resume();
      else if (bedGain) bedGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    },
    // Musik der aktuellen Seite an/aus (Schalter auf About, Case, Kontakt)
    music(v) {
      musicOn = !!v; finishedSrc = '';
      try { localStorage.setItem('music', musicOn ? '1' : '0'); } catch (e) {}
      if (musicOn) Sound.resume(true);
      syncMusic(); refresh();
    },
    // Startet oder weckt den Ton. Freischalten geht nur innerhalb eines Klicks, Tipps oder Tastendrucks (fromGesture).
    resume(fromGesture) {
      if (fromGesture) {
        gestured = true;
        init();
        if (ctx) {
          // stummer Mini-Ton im Klick: so gibt auch Safari die Ausgabe frei
          try { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) {}
        }
      }
      if (gestured && ctx && ctx.state !== 'running') ctx.resume().then(() => { refresh(); if (!music) syncMusic(); }).catch(() => {});
      else if (fromGesture && ctx && !music) syncMusic();   // erster Klick auf einer Musik-Seite: Stück starten
      refresh();
    },
    // Nach einem Seitenwechsel ohne Neuladen: altes Stück aus, Stück der neuen Seite an (wenn Musik eingeschaltet)
    pageChanged() { finishedSrc = ''; if (bedGain && ctx) bedGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); syncMusic(); refresh(); },
    key() { burst(1800 + Math.random() * 1400, 0.09, 0.035, 6); },
    tick() { tone(880, 0.06, 0.09); },
    hover() { burst(3200, 0.03, 0.03, 8); },
    whoosh() {
      if (!fx() || !ctx) return;
      const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = noise;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(5000, t + 0.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      s.connect(f).connect(g).connect(ctx.destination); s.start(t, 0, 0.75);
    },
    count(k) { tone(420 + Math.max(0, Math.min(1, k)) * 760, 0.035, 0.05); },
    pop() { tone(520, 0.05, 0.12); burst(900, 0.025, 0.06, 3); },
    chime() {
      if (!fx() || !ctx) return;
      tone(660, 0.04, 0.18);
      setTimeout(() => tone(990, 0.03, 0.22), 90);
    },
    motion(x) {
      if (!fx() || !bedGain) return;
      const v = Math.max(0, Math.min(1, x));
      bedGain.gain.setTargetAtTime(v * 0.07, ctx.currentTime, 0.08);
      bedFilter.frequency.setTargetAtTime(1800 + v * 2400, ctx.currentTime, 0.1);
    }
  };
  window.Sound = Sound;
  // Jede echte Nutzer-Geste darf den Ton freischalten (Scrollen und Mausrad zählen beim Browser nicht)
  ['pointerdown', 'pointerup', 'mousedown', 'click', 'keydown', 'touchend'].forEach(ev => listen(window, ev, () => Sound.resume(true), { passive: true, capture: true }));
  listen(document, 'visibilitychange', () => { if (!document.hidden) Sound.resume(); });
  listen(window, 'pageshow', () => Sound.resume());

  // Gemerkte Wahl aus einer anderen Seite. Standard: an. Nur wer selbst „off“ gewählt hat, bleibt stumm.
  try { on = localStorage.getItem('sound') !== '0'; musicOn = localStorage.getItem('music') !== '0'; } catch (e) { on = true; musicOn = true; }

  // Schalter oben in der Navigation
  // - Seite ohne Musik (Startseite): Effekt-Klänge, „( sound on )“ / „( sound off )“, Standard an
  // - Seite mit Musik (About, Case, Kontakt): Standard an, jede Seite spielt ihr eigenes Stück (immer nur eins);
  //   „( sound on )“ antippen schaltet die Musik überall aus, „( sound off )“ wieder an
  // Nach einem Seitenwechsel ohne Neuladen ruft nav.js das erneut für die neuen Schalter auf.
  Sound.bindToggles = function () {
    labels = [];
    document.querySelectorAll('[data-sound-toggle]').forEach(btn => {
      const label = () => {
        const short = window.matchMedia('(max-width:700px)').matches;
        const hasMusic = !!(document.body && document.body.dataset.music);
        const active = hasMusic ? musicOn : on;
        // Nur Text wie die anderen Navigationspunkte; nur ändern, wenn nötig.
        // (Wird der Inhalt während eines Klicks neu gebaut, verwirft Safari den Klick.)
        const txt = short ? (active ? '( ♪ on )' : '( ♪ off )') : (active ? '( sound on )' : '( sound off )');
        if (btn.textContent !== txt) btn.textContent = txt;
        btn.setAttribute('role', 'switch');
        btn.removeAttribute('aria-pressed');
        btn.setAttribute('aria-checked', active);
        btn.setAttribute('aria-label', hasMusic ? 'Musik' : 'Ton');
      };
      labels.push(label);
      label();
      btn.addEventListener('click', () => {
        if (document.body && document.body.dataset.music) { Sound.music(!musicOn); return; }
        Sound.set(!on); label(); Sound.tick();
        try { localStorage.setItem('sound', on ? '1' : '0'); } catch (e) {}
      });
    });
  };
  Sound.bindToggles();
})();
