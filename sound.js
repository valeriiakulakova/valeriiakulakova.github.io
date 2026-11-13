/* Klänge, im Browser erzeugt (Web Audio), keine Audiodateien.
   Standard: aus. Jeder neue Besuch beginnt mit „ton aus“. Wer „ton an“ wählt, hat Ton auf allen
   Seiten, bis der Tab geschlossen wird (sessionStorage, nur für diesen Besuch).
   Browser erlauben Ton auf jeder Seite erst nach einem Klick, Tipp oder Tastendruck
   (Scrollen zählt nicht). Ist der Ton an, aber noch gesperrt (z. B. nach einem Neuladen),
   zeigt der Schalter „ton an“; der erste Tipp irgendwo auf der Seite startet ihn.
   iPhone: Ton spielt auch bei eingeschaltetem Stummschalter (audioSession „playback“).
   Nutzung:
     Sound.key()        kurzer Tastenklick beim Tippen
     Sound.tick()       kleiner Ton für Buttons
     Sound.hover()      sehr leiser Klick beim Überfahren
     Sound.whoosh()     Rauschen, das aufsteigt, beim Zoom in einen Ordner
     Sound.motion(x)    leises Rauschen, dessen Lautstärke der Bewegung folgt (0 … 1)
     Sound.count(k)     kurzer Ton beim Hochzählen, steigt mit k (0 … 1)
     Sound.pop()        weicher Ton beim Wechsel eines Screens im Showreel
     Sound.chime()      zwei helle Töne, wenn eine neue Jahreszahl erscheint
     Sound.gather(k)    Punkte sammeln sich zur Jahreszahl: feine Tropfen, dann ein Ton (k 0 … 1 = Höhe)
     Sound.scatter()    Punkte fliegen zurück: weiches, fallendes Rauschen
     Sound.drift(x)     sehr leises Rascheln beim Scrollen (0 … 1), About
   Seitenmusik: <body data-music="media/sounds/….mp3"> startet leise, sobald der Ton frei ist,
   läuft in Schleife und blendet beim Seitenwechsel weich in die Musik der nächsten Seite über. */
(function () {
  let ctx = null, on = false, noise = null, bedGain = null, bedFilter = null;
  let musicBus = null, analyser = null, freq = null;   // Musik läuft über einen Bus mit „Zuhörer“ für den Beat
  let labels = [];
  const KEY = 'ton';         // Speicherplatz der Wahl in sessionStorage
  let chosen = false;        // schon „an“ oder „aus“ gewählt (in diesem Besuch)?
  let gestured = false;    // gab es in dieser Sitzung schon einen Klick, Tipp oder Tastendruck?
  let firstGesture = false; // ist die gerade laufende Geste die erste (Ton war bis eben gesperrt)?
  // Safari meldet manchmal „running“, spielt aber vor dem ersten Klick nichts ab: deshalb zählt erst die Geste
  const ready = () => gestured && !!ctx && ctx.state === 'running';
  const refresh = () => labels.forEach(f => f());
  // Effekt-Klänge nur auf Seiten ohne eigene Musik (Startseite, About); Case und Kontakt haben nur ihre Musik
  const fx = () => on && !(document.body && document.body.dataset.music);
  // Dauerhafte Listener: bleiben beim Seitenwechsel ohne Neuladen (nav.js) erhalten
  const listen = (tg, type, fn, opt) => window.SoftNav ? SoftNav.on(tg, type, fn, opt) : tg.addEventListener(type, fn, opt);

  // iPhone/iPad: Web Audio ist sonst bei eingeschaltetem Stummschalter still
  function playbackSession() {
    try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch (e) {}
  }
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
  let musicOn = false;          // Seitenmusik: Standard aus, gilt für alle Seiten, sobald man sie einschaltet
  let musicGen = 0;
  let finishedSrc = '';          // Stück einer Seite ohne Schleife ist zu Ende: bis zum Seitenwechsel still bleiben
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
    if (src === finishedSrc) return;                                 // einmal gespielt, jetzt still
    const my = ++musicGen;
    stopMusic();
    let buf;
    try { buf = await loadBuffer(src); } catch (e) { return; }
    if (my !== musicGen || !musicOn) return;                         // inzwischen andere Seite oder wieder aus
    const node = ctx.createBufferSource(); node.buffer = buf;
    node.loop = true;   // jede Seite spielt ihr Stück in Schleife (CLAUDE.md)
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
    get chosen() { return chosen; },                     // hat man in diesem Besuch schon „an“ oder „aus“ gewählt?
    // Bass-Lautstärke der laufenden Musik, 0 … 1 (für Elemente, die im Beat pulsieren)
    level() {
      if (!analyser || !music || !ctx || ctx.state !== 'running') return 0;
      analyser.getByteFrequencyData(freq);
      const hz = ctx.sampleRate / analyser.fftSize, a = Math.max(1, Math.round(40 / hz)), b = Math.max(a + 1, Math.round(160 / hz));
      let s = 0; for (let i = a; i <= b; i++) s += freq[i];
      return s / ((b - a + 1) * 255);
    },
    // Ein Schalter für alles: Effekt-Klänge (Startseite) und Seitenmusik (About, Case, Kontakt)
    set(v) {
      on = musicOn = !!v;
      chosen = true;
      try { sessionStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
      if (on) { finishedSrc = ''; playbackSession(); Sound.resume(true); syncMusic(); }
      else {
        if (bedGain && ctx) bedGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        musicGen++; stopMusic();
        // Aus heißt aus: den ganzen Ton anhalten. Safari stoppt laufende Stücke sonst nicht immer zuverlässig.
        if (ctx && ctx.state === 'running') later(() => { if (!on && ctx.state === 'running') ctx.suspend().catch(() => {}); }, 250);
      }
      refresh();
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
      // iPhone kennt auch „interrupted“ (Anruf, App-Wechsel): jeder Zustand außer „running“ wird geweckt
      if (on && gestured && !document.hidden && ctx && ctx.state !== 'running') { if (fromGesture) playbackSession(); ctx.resume().then(() => { refresh(); if (!music) syncMusic(); }).catch(() => {}); }
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
    },
    // About: Punkte fliegen zur Jahreszahl. Viele kleine Tropfen (die landenden Punkte), dann ein runder Ton.
    // k = Höhe des Tons: neueste Station oben, ältere tiefer (Töne einer Pentatonik, klingen immer zusammen).
    gather(k) {
      if (!fx() || !ctx) return;
      const scale = [392, 440, 523.25, 587.33, 659.25, 783.99];   // G A C D E G
      const base = scale[Math.round(Math.max(0, Math.min(1, k)) * (scale.length - 1))];
      const t0 = ctx.currentTime;
      for (let i = 0; i < 9; i++) {
        const t = t0 + i * 0.045 + Math.random() * 0.02;
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(base * (2 + Math.random() * 1.5), t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.012 + i * 0.002, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.08);
      }
      // runder Ton mit Quinte, wenn die Zahl steht
      [[base, 0.05], [base * 1.5, 0.022]].forEach(([f, v], n) => {
        const t = t0 + 0.42 + n * 0.06;
        const o = ctx.createOscillator(); o.type = n ? 'sine' : 'triangle'; o.frequency.setValueAtTime(f, t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 1.15);
      });
    },
    // About: Punkte fliegen zurück ins Porträt
    scatter() {
      if (!fx() || !ctx) return;
      const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = noise;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
      f.frequency.setValueAtTime(3600, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      s.connect(f).connect(g).connect(ctx.destination); s.start(t, Math.random() * 0.3, 0.6);
    },
    // About: sehr leises Rascheln, solange gescrollt wird (das Porträt dreht sich mit)
    drift(x) {
      if (!fx() || !bedGain) return;
      const v = Math.max(0, Math.min(1, x));
      bedGain.gain.setTargetAtTime(v * 0.025, ctx.currentTime, 0.12);
      bedFilter.frequency.setTargetAtTime(900 + v * 1400, ctx.currentTime, 0.15);
    }
  };
  window.Sound = Sound;
  // Jede echte Nutzer-Geste darf den Ton freischalten (Scrollen und Mausrad zählen beim Browser nicht)
  ['pointerdown', 'pointerup', 'mousedown', 'click', 'keydown', 'touchend'].forEach(ev => listen(window, ev, () => {
    if (!gestured && (ev === 'pointerdown' || ev === 'mousedown' || ev === 'keydown' || ev === 'touchend')) firstGesture = true;
    Sound.resume(true);
  }, { passive: true, capture: true }));
  // Nur der sichtbare Tab spielt: verdeckter Tab oder minimiertes Fenster pausiert den Ton, Zurückkommen setzt ihn fort.
  // So vermischen sich mehrere offene Tabs nicht.
  listen(document, 'visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { if (ctx.state === 'running') ctx.suspend().catch(() => {}); }
    else Sound.resume();
  });
  listen(window, 'pageshow', () => Sound.resume());

  // Wahl gilt nur für diesen Besuch (Tab). Jeder neue Besuch beginnt mit „ton aus“.
  // Alte, dauerhaft gespeicherte Wahl aus früheren Versionen löschen: Sie ließ das Handy mit „ton an“ starten.
  try { localStorage.removeItem('sound'); } catch (e) {}
  let v = null; try { v = sessionStorage.getItem(KEY); } catch (e) {}
  chosen = v !== null; on = musicOn = v === '1';

  // Ton-Schalter als kleine Pille unten links, auf allen Seiten gleich.
  // Wird einmal gebaut und nach einem Seitenwechsel nur in die neue Seite umgehängt (bindToggles).
  // Balken bewegen sich, wenn der Ton an ist; aus: ruhige Punkte und „ton aus“ (zwei Merkmale, nicht nur Farbe).
  let pill = null, pillText = null, dock = null, lang = null;
  const isEn = () => (document.documentElement.lang || '').slice(0, 2) === 'en';
  function buildPill() {
    dock = document.createElement('div'); dock.className = 'dock-l';
    pill = document.createElement('button');
    pill.type = 'button'; pill.className = 'snd'; pill.setAttribute('role', 'switch');
    pill.innerHTML = '<span class="snd-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="snd-t"></span>';
    pillText = pill.querySelector('.snd-t');
    pill.addEventListener('click', () => {
      // Erster Klick überhaupt und Ton steht auf „an“: Ton starten statt ausschalten (vorher war ja noch nichts zu hören)
      if (firstGesture && on) { firstGesture = false; Sound.set(true); return; }
      firstGesture = false;
      Sound.set(!on); if (on) Sound.tick();
    });
    listen(window, 'click', () => { later(() => { firstGesture = false; }, 0); }, { passive: true });
    labels.push(() => {
      const en = isEn();
      pill.setAttribute('aria-label', en ? 'Sound' : 'Ton');
      const txt = en ? (on ? 'sound on' : 'sound off') : (on ? 'ton an' : 'ton aus');
      if (pillText.textContent !== txt) pillText.textContent = txt;   // nur ändern, wenn nötig (Safari verwirft sonst Klicks)
      pill.setAttribute('aria-checked', on);
      pill.classList.toggle('on', on);
    });
    // Sprach-Schalter „de / en“ direkt neben dem Ton: Link zur gleichen Seite in der anderen Sprache.
    // Aktive Sprache: hell und unterstrichen, die andere gedämpft (zwei Merkmale, nicht nur Farbe).
    lang = document.createElement('a'); lang.className = 'lang';
    lang.innerHTML = '<span data-l="de">de</span><span class="lang-sl" aria-hidden="true">/</span><span data-l="en">en</span>';
    // Abschnitt (#…) beim Wechsel mitnehmen
    lang.addEventListener('click', () => { const u = new URL(lang.href); u.hash = location.hash; lang.href = u.href; });
    labels.push(() => {
      const en = isEn();
      const file = (location.pathname.split('/').pop() || 'index.html');
      const base = file.replace(/-en\.html$/, '.html');
      // Impressum und Datenschutz gibt es nur auf Deutsch: „en“ führt dort zur englischen Startseite
      const enFile = /^(impressum|datenschutz)\.html$/.test(base) ? 'index-en.html' : base.replace(/\.html$/, '-en.html');
      const href = en ? base : enFile;
      if (lang.getAttribute('href') !== href) lang.setAttribute('href', href);
      lang.setAttribute('hreflang', en ? 'de' : 'en'); lang.setAttribute('lang', en ? 'de' : 'en');
      lang.setAttribute('aria-label', en ? 'Deutsche Version' : 'English version');
      lang.querySelectorAll('[data-l]').forEach(s => { const cur = (s.dataset.l === 'en') === en; s.classList.toggle('cur', cur); });
    });
    dock.append(pill, lang);
  }
  Sound.bindToggles = function () {
    if (!document.body) return;
    if (!pill) buildPill();
    if (dock.parentNode !== document.body) document.body.appendChild(dock);
    // alte Schalter oben in der Navigation, falls eine Seite sie noch hat, ausblenden
    document.querySelectorAll('[data-sound-toggle]').forEach(b => b.remove());
    refresh();
  };
  Sound.bindToggles();
})();
