/* V.E.R.A. demo — entry gate (public pages only).
   Browsers refuse to speak or listen until the visitor clicks something, so
   the first click is made to count: a DEMO MODE gate centered over the ring
   that turns on sound AND arms the "say Vera" wake word in one gesture.
   Loaded before demo_live.js / map_interview.js so they can subscribe.
   window.VERA_ENTRY = { done, voice, fresh, onDone(cb) } — cb(voice) fires
   once the visitor chooses (immediately, if they chose earlier this session). */
(function () {
  'use strict';
  if (!new URLSearchParams(location.search).has('demo')) return;

  const cbs = [];
  const ENTRY = window.VERA_ENTRY = {
    done: false, voice: false, fresh: false,
    onDone(cb) { ENTRY.done ? cb(ENTRY.voice) : cbs.push(cb); },
  };

  // The visitor's Seed (their saved second brain) personalizes everything:
  // a deterministic hue derived from it makes each returning visitor's
  // interface their own — no two Seeds render the same V.E.R.A.
  let seed = null;
  try { seed = JSON.parse(localStorage.getItem('vera_brain_v1') || 'null'); } catch {}
  if (seed && !(seed.name && Array.isArray(seed.nodes) && seed.nodes.length)) seed = null;
  if (seed) {
    const sig = seed.name + '|' + seed.nodes.map(n => n.label).join('|');
    const hue = [...sig].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
    window.VERA_SEED = { name: seed.name, hue, nodes: seed.nodes };
    if (hue > 8 && hue < 352) document.documentElement.style.filter = `hue-rotate(${hue}deg)`;
  }
  function finish(voice, fresh) {
    ENTRY.done = true; ENTRY.voice = voice; ENTRY.fresh = fresh;
    try { sessionStorage.setItem('vera_entry', voice ? 'voice' : 'silent'); } catch {}
    cbs.splice(0).forEach(cb => { try { cb(voice); } catch {} });
  }

  // iOS WebKit (ALL iPhone browsers, Chrome included) only lets audio play
  // from an element created inside a tap. Bless ONE element and every future
  // line — reel, replies, acks — speaks through it. Hoisted out of close()
  // because the gate-skip fast path below NEVER runs close(): revisit pages
  // had no blessing at all, so playB64's el.play() rejected into a bare
  // finish() and every reply died mute in under a second — which read as
  // "she can't hear me" when she'd heard perfectly and answered silently.
  function bless() {
    try {
      let el = window.VERA_AUDIO_EL;
      if (!el) {
        el = new Audio();
        el.playsInline = true;
        el.setAttribute('playsinline', '');
        window.VERA_AUDIO_EL = el;
      }
      if (el.paused) {  // never yank a line that is audibly playing
        // iOS IGNORES the volume property — muted is the only real gag.
        // Without it, iPhones speak the blessing file ("Yes?") out loud.
        el.muted = true;
        el.volume = 0;
        el.src = 'voice/wake.mp3';
        el.play().then(() => { el.pause(); el.muted = false; el.volume = 1; el.currentTime = 0; })
          .catch(() => { el.muted = false; el.volume = 1; });
      }
    } catch { /* audio stays best-effort */ }
  }

  // Already chose this session (navigating between pages): no second gate —
  // but no gate tap either, so borrow the FIRST real tap for the blessing.
  let prior = null;
  try { prior = sessionStorage.getItem('vera_entry'); } catch {}
  if (prior) {
    document.addEventListener('click', bless, { once: true, capture: true });
    finish(prior === 'voice', false);
    return;
  }

  const css = document.createElement('style');
  css.textContent = `
    #vera-gate { position: fixed; inset: 0; z-index: 9; display: flex;
      flex-direction: column; align-items: center; justify-content: center;
      gap: 20px; text-align: center; background: rgba(2,6,12,0.78);
      backdrop-filter: blur(5px); font-family: 'Rajdhani', sans-serif;
      transition: opacity 0.5s; }
    #vera-gate .g-title { font-size: clamp(36px, 7vw, 66px); font-weight: 600;
      letter-spacing: 0.42em; padding-left: 0.42em; color: #3fd9ff;
      text-shadow: 0 0 38px rgba(63,217,255,0.65);
      animation: g-pulse 2.6s ease-in-out infinite; }
    #vera-gate .g-sub { font-size: clamp(13px, 2.2vw, 16px); letter-spacing: 0.32em;
      padding-left: 0.32em; text-transform: uppercase; color: #9fc3d2; }
    #vera-gate .g-voice { margin-top: 14px; background: rgba(8,22,34,0.9);
      border: 1px solid rgba(63,217,255,0.75); border-radius: 6px; color: #3fd9ff;
      font-family: inherit; font-size: clamp(15px, 2.4vw, 18px); font-weight: 600;
      letter-spacing: 0.24em; text-transform: uppercase; padding: 18px 36px;
      cursor: pointer; animation: g-pulse 2.6s ease-in-out infinite;
      box-shadow: 0 0 34px rgba(63,217,255,0.25); }
    #vera-gate .g-voice:hover { background: rgba(63,217,255,0.14); }
    #vera-gate .g-hint { font-size: 12px; letter-spacing: 0.14em; line-height: 1.7;
      color: rgba(127,184,204,0.65); max-width: 460px; }
    #vera-gate .g-mute { background: none; border: none; color: rgba(127,184,204,0.5);
      font-family: inherit; font-size: 11px; letter-spacing: 0.26em;
      text-transform: uppercase; cursor: pointer; margin-top: 6px;
      text-decoration: underline; text-underline-offset: 4px; }
    #vera-gate .g-cap { font-size: 10px; letter-spacing: 0.2em; line-height: 1.8;
      text-transform: uppercase; color: rgba(127,184,204,0.45);
      max-width: 500px; margin-top: 10px; }
    @keyframes g-pulse { 0%, 100% { filter: brightness(0.92); }
      50% { filter: brightness(1.15); } }
    @media (max-width: 640px) {
      #vera-gate { backdrop-filter: none; background: rgba(2, 6, 12, 0.95); }
      #vera-gate .g-hint { font-size: 11px; max-width: 86vw; } }`;
  document.head.appendChild(css);

  const gate = document.createElement('div');
  gate.id = 'vera-gate';
  // Honest per-device promises: iPhones and Firefox have no name-listening at
  // all (WebKit/Gecko ship no speech recognition) — never promise "say Vera".
  const hasSR = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const how = hasSR
    ? 'Sound on, mic on — then just say “Hey Vera” out loud, any time.'
    : 'Sound on — tap the mic any time to speak with her.';
  gate.innerHTML = `
    <div class="g-title">DEMO MODE</div>
    <div class="g-sub">She speaks — and she listens</div>
    <button class="g-voice" type="button">🔊 Enter with voice</button>
    <div class="g-hint">${how}<br>
      Your browser asks for the microphone once — then the show runs itself.</div>
    <button class="g-mute" type="button">enter muted</button>
    <div class="g-cap">Public working model — capabilities deliberately limited.<br>
      The production system runs privately, with full tools and memory.</div>`;
  document.body.appendChild(gate);
  if (window.VERA_SEED) {  // returning Seed-holder: she remembers (textContent — never markup)
    // Pronoun/placeholder "names" (a mis-answered interview) read as broken —
    // greet namelessly rather than say "Welcome back, You".
    const n = String(window.VERA_SEED.name || '').trim();
    const bad = /^(you|me|user|friend|human|sir|madam|vera|anon|anonymous|nobody)$/i.test(n);
    gate.querySelector('.g-sub').textContent = bad || !n
      ? 'Welcome back — she remembers'
      : 'Welcome back, ' + n + ' — she remembers';
  }

  function close(voice) {
    bless();  // the gate tap is the classic blessing site (hoisted above —
              // the gate-skip fast path needs the same rite)
    try {
      if (voice && 'speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        speechSynthesis.speak(u);  // blesses browser TTS on WebKit too
      }
    } catch { /* audio stays best-effort */ }
    finish(voice, true);
    gate.style.opacity = '0';
    setTimeout(() => gate.remove(), 520);
  }
  gate.querySelector('.g-voice').onclick = () => close(true);
  gate.querySelector('.g-mute').onclick = () => close(false);
})();
