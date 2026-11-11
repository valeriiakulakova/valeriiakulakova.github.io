/* Klänge, im Browser erzeugt (Web Audio), keine Audiodateien.
   Standard: aus. Browser erlauben Ton erst nach einem Klick, deshalb
   wird der Ton erst über den Schalter „( sound off / on )“ gestartet.
   Nutzung:
     Sound.key()        kurzer Tastenklick beim Tippen
     Sound.tick()       kleiner Ton für Buttons
     Sound.hover()      sehr leiser Klick beim Überfahren
     Sound.whoosh()     Rauschen, das aufsteigt, beim Zoom in einen Ordner
     Sound.motion(x)    leises Rauschen, dessen Lautstärke der Bewegung folgt (0 … 1)
     Sound.count(k)     kurzer Ton beim Hochzählen, steigt mit k (0 … 1)
     Sound.pop()        weicher Ton beim Wechsel eines Screens im Showreel
     Sound.chime()      zwei helle Töne, wenn eine neue Jahreszahl erscheint
   Die Wahl „an/aus“ merkt sich der Browser für die anderen Seiten. */
(function () {
  let ctx = null, on = false, noise = null, bedGain = null, bedFilter = null;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Grundrauschen für Bewegung: läuft dauerhaft, ist aber stumm, bis sich etwas bewegt
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    bedFilter = ctx.createBiquadFilter(); bedFilter.type = 'bandpass'; bedFilter.frequency.value = 2600; bedFilter.Q.value = 0.9;
    bedGain = ctx.createGain(); bedGain.gain.value = 0;
    src.connect(bedFilter).connect(bedGain).connect(ctx.destination); src.start();
  }

  function burst(freq, vol, len, q) {
    if (!on || !ctx) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(ctx.destination);
    s.start(t, Math.random() * 0.8, len + 0.02);
  }

  function tone(freq, vol, len) {
    if (!on || !ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + len + 0.02);
  }

  const Sound = {
    get on() { return on; },
    set(v) {
      on = !!v;
      if (on) { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); }
      else if (bedGain) bedGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    },
    // Nach Zurück-Navigation oder Tab-Wechsel pausiert der Browser den Ton: wieder aufwecken
    resume() { if (on && ctx && ctx.state !== 'running') ctx.resume(); },
    key() { burst(1800 + Math.random() * 1400, 0.09, 0.035, 6); },
    tick() { tone(880, 0.06, 0.09); },
    hover() { burst(3200, 0.03, 0.03, 8); },
    whoosh() {
      if (!on || !ctx) return;
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
      if (!on || !ctx) return;
      tone(660, 0.04, 0.18);
      setTimeout(() => tone(990, 0.03, 0.22), 90);
    },
    motion(x) {
      if (!on || !bedGain) return;
      const v = Math.max(0, Math.min(1, x));
      bedGain.gain.setTargetAtTime(v * 0.07, ctx.currentTime, 0.08);
      bedFilter.frequency.setTargetAtTime(1800 + v * 2400, ctx.currentTime, 0.1);
    }
  };
  window.Sound = Sound;
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => window.addEventListener(ev, () => Sound.resume(), { passive: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) Sound.resume(); });
  window.addEventListener('pageshow', () => Sound.resume());

  // Gemerkte Wahl aus einer anderen Seite (der Ton startet trotzdem erst nach dem ersten Klick oder Tippen)
  try { if (localStorage.getItem('sound') === '1') Sound.set(true); } catch (e) {}

  // Schalter „( sound off / on )“
  document.querySelectorAll('[data-sound-toggle]').forEach(btn => {
    const label = () => {
      const short = window.matchMedia('(max-width:700px)').matches;
      btn.textContent = short ? (on ? '( ♪ on )' : '( ♪ off )') : (on ? '( sound on )' : '( sound off )');
      btn.setAttribute('aria-pressed', on); btn.setAttribute('aria-label', 'Ton ' + (on ? 'an' : 'aus'));
    };
    label();
    btn.addEventListener('click', () => {
      Sound.set(!on); label(); Sound.tick();
      try { localStorage.setItem('sound', on ? '1' : '0'); } catch (e) {}
    });
  });
})();
