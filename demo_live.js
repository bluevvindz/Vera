/* VERA public demo — live-chat layer.
   Loaded ONLY in the demo build (never in Kevin's personal HUD).
   If window.DEMO_API is set (demo_config.js), visitors talk to the sandboxed
   demo brain; browser SpeechRecognition + speechSynthesis provide free voice.
   Without an API, typing still works — VERA explains he's in rehearsal. */
(function () {
  'use strict';
  if (!new URLSearchParams(location.search).has('demo')) return;

  const API = (window.DEMO_API || '').trim();
  const NAME_RE = (window.VERA_WAKE && window.VERA_WAKE.NAME) || /\b(vera|veera|vira|viera|vieira)\b/i;

  /* ---- input bar ---- */
  /* ---------------------------------------------------------- diagnostic
   * "It can't hear me" is unfalsifiable from a phone across the room. This
   * turns that report into a readable state dump: which tier owns the mic,
   * whether the floor is wedged (busy stuck = amber PROCESSING + dead mic,
   * the exact pair we chased for hours), and the first JS error, which is
   * otherwise invisible on mobile with no console.
   * Open it with ?diag=1, or five taps anywhere on the page.
   * Everything here is wrapped: a diagnostic must never become the bug. */
  const DIAG = { errors: [], fetches: [] };
  try {
    window.addEventListener('error', e => {
      DIAG.errors.push(`${e.message} @ ${(e.filename || '?').split('/').pop()}:${e.lineno}`);
    });
    window.addEventListener('unhandledrejection', e => {
      DIAG.errors.push('promise: ' + String((e.reason && e.reason.message) || e.reason).slice(0, 120));
    });
  } catch {}

  function diagPanel() {
    let p = document.getElementById('vera-diag');
    if (p) { p.remove(); return; }
    p = document.createElement('div');
    p.id = 'vera-diag';
    p.style.cssText = 'position:fixed;inset:auto 8px 8px 8px;z-index:99999;max-height:62vh;' +
      'overflow:auto;background:rgba(3,9,16,0.96);border:1px solid #3fd9ff;border-radius:8px;' +
      'color:#cfe4ec;font:12px/1.55 ui-monospace,Menlo,Consolas,monospace;padding:12px 14px;' +
      'white-space:pre-wrap;box-shadow:0 0 30px rgba(63,217,255,0.25)';
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const statusEl = document.getElementById('status');
    const rows = [];
    const line = (k, v) => rows.push(k.padEnd(16) + ' ' + v);
    try {
      line('device', /iPhone|iPad/.test(navigator.userAgent) ? 'iOS (WebKit — recorder tier only)'
        : /Android/.test(navigator.userAgent) ? 'Android' : 'desktop/other');
      line('SpeechRecog', SR ? 'available' : 'ABSENT (recorder is the only path)');
      line('getUserMedia', (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ? 'available' : 'ABSENT');
      line('server ears', typeof earsServer !== 'undefined' && earsServer ? 'on (server STT)' : 'off (browser tier)');
      line('reactor mode', statusEl ? statusEl.textContent : '?');
      line('busy (floor)', String(busy) + (busy ? '  <-- WEDGED? mic is gated while true' : ''));
      line('replyPlaying', String(replyPlaying));
      line('earOpen', String(earOpen));
      line('recording', String(!!recording));
      line('audio ctx', recCtx ? recCtx.state : 'none');
      // Settles the iOS sample-rate hypothesis from the phone itself,
      // before anyone writes code for it.
      line('track rate', recStream
        ? String(((recStream.getAudioTracks()[0].getSettings() || {}).sampleRate) || '?')
          + ' vs ctx ' + (recCtx ? recCtx.sampleRate : '?')
        : 'no stream');
      line('sound', soundOn ? 'on' : 'muted');
      line('API', API ? API.replace(/^https?:\/\//, '') : 'NOT SET');
    } catch (e) { rows.push('state read failed: ' + e.message); }
    rows.push('');
    rows.push('errors: ' + (DIAG.errors.length ? '' : 'none'));
    DIAG.errors.slice(0, 6).forEach(e => rows.push('  ' + e));
    rows.push('net: ' + (DIAG.fetches.length ? '' : 'no failures'));
    DIAG.fetches.slice(-4).forEach(e => rows.push('  ' + e));
    p.textContent = 'VERA listening diagnostic\n' + '-'.repeat(34) + '\n' + rows.join('\n');
    const probe = document.createElement('button');
    probe.textContent = 'Test her brain link';
    probe.style.cssText = 'margin-top:10px;background:transparent;border:1px solid #3fd9ff;' +
      'color:#3fd9ff;border-radius:5px;padding:7px 12px;font:inherit;cursor:pointer';
    probe.onclick = async () => {
      probe.textContent = 'testing…';
      const ab = abortIn(8000);
      try {
        const t0 = Date.now();
        const r = await fetch(API + '/health', { signal: ab.signal });
        probe.textContent = `brain: HTTP ${r.status} in ${Date.now() - t0}ms`;
      } catch (e) { probe.textContent = 'brain UNREACHABLE: ' + (e.name || 'error'); }
      finally { ab.done(); }
    };
    const close = document.createElement('button');
    close.textContent = 'close';
    close.style.cssText = probe.style.cssText + ';margin-left:8px';
    close.onclick = () => p.remove();
    p.append(probe, close);
    document.body.appendChild(p);
  }
  try {
    let taps = 0, tapAt = 0;
    document.addEventListener('click', () => {
      const now = Date.now();
      taps = (now - tapAt < 600) ? taps + 1 : 1;
      tapAt = now;
      if (taps >= 5) { taps = 0; try { diagPanel(); } catch {} }
    }, true);
    if (new URLSearchParams(location.search).has('diag')) setTimeout(() => { try { diagPanel(); } catch {} }, 800);
  } catch {}

  // One bound for every socket. A fetch with no timeout holds whatever it
  // gates for the browser's socket lifetime — on venue WiFi that is the
  // normal demo condition, not an edge case. Dual-path because
  // AbortSignal.timeout is missing on older WebKit: call done() in a finally
  // so a hand-rolled timer never outlives its fetch.
  function abortIn(ms) {
    if (AbortSignal.timeout) return { signal: AbortSignal.timeout(ms), done() {} };
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    return { signal: c.signal, done() { clearTimeout(t); } };
  }

  const bar = document.createElement('div');
  bar.id = 'demo-talk';
  bar.innerHTML = '';
  const mic = document.createElement('button');
  mic.id = 'mic-btn'; mic.type = 'button'; mic.textContent = '🎙';
  const input = document.createElement('input');
  input.id = 'demo-input';
  input.placeholder = 'Ask VERA anything… or press the mic and speak';
  input.maxLength = 280;
  const sendBtn = document.createElement('button');
  sendBtn.id = 'send-btn'; sendBtn.type = 'button'; sendBtn.textContent = 'SEND';
  const soundBtn = document.createElement('button');
  soundBtn.id = 'sound-btn'; soundBtn.type = 'button'; soundBtn.textContent = '🔇 SOUND';
  soundBtn.title = 'Browsers require one click before a page may speak';
  const eye = document.createElement('button');
  eye.id = 'eye-btn'; eye.type = 'button';
  // A viewfinder, not an eyeball: HUD-native, current-color, zero creep.
  eye.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" '
    + 'stroke="currentColor" stroke-width="2" stroke-linecap="round">'
    + '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>'
    + '<path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>'
    + '<circle cx="12" cy="12" r="3.2"/></svg>';
  eye.style.display = 'flex'; eye.style.alignItems = 'center';
  bar.append(mic, eye, input, sendBtn, soundBtn);
  document.body.appendChild(bar);

  const css = document.createElement('style');
  css.textContent = `
    #demo-talk { position: fixed; left: 50%; transform: translateX(-50%);
      bottom: 88px; z-index: 6; display: flex; gap: 8px; width: min(560px, 86vw);
      background: rgba(8,22,34,0.85); border: 1px solid rgba(63,217,255,0.4);
      border-radius: 6px; padding: 8px; backdrop-filter: blur(8px);
      box-shadow: 0 0 30px rgba(63,217,255,0.15); }
    #demo-talk input { flex: 1; background: none; border: none; outline: none;
      color: #eaf6fb; font-family: 'Rajdhani', sans-serif; font-size: 15px; }
    #demo-talk input::placeholder { color: rgba(127,184,204,0.5); }
    #demo-talk button { background: none; border: 1px solid rgba(63,217,255,0.45);
      border-radius: 4px; color: #3fd9ff; font-family: inherit; font-size: 12px;
      letter-spacing: 0.2em; padding: 6px 12px; cursor: pointer; }
    #demo-talk button:hover { background: rgba(63,217,255,0.12); }
    #demo-talk .rec { border-color: #3fffc2 !important; color: #3fffc2 !important;
      animation: mic-live 1.1s ease-in-out infinite; }
    @keyframes mic-live { 0%, 100% { box-shadow: 0 0 6px rgba(63,255,194,0.35); }
      50% { box-shadow: 0 0 22px rgba(63,255,194,0.8); } }
    @media (max-width: 640px) {
      #demo-talk { bottom: 10px; width: calc(100vw - 20px); backdrop-filter: none;
        background: rgba(6, 16, 26, 0.96); }
      #demo-talk button { padding: 6px 9px; letter-spacing: 0.1em; } }`;
  document.head.appendChild(css);

  /* ---- browser voice out (free) ---- */
  let soundOn = false;
  let userMuted = false;  // an explicit 🔇 tap is a PREFERENCE — only the 🔊 tap clears it; send()'s gesture-blessing must not
  // Kick the async voice-list load early; browserSpeak hooks onvoiceschanged
  // itself whenever the list hasn't landed yet.
  try { speechSynthesis.getVoices(); } catch {}
  let currentAudio = null;
  let currentFinish = null;  // pending completion of the playing MP3
  let wakeToken = 0;         // invalidates stale wake-resume timers
  function audioEl() {
    // ONE reusable element for all playback — iOS WebKit only trusts an
    // element blessed inside a tap (demo_entry does the blessing).
    if (!window.VERA_AUDIO_EL) {
      const el = new Audio();
      el.playsInline = true;
      el.setAttribute('playsinline', '');
      window.VERA_AUDIO_EL = el;
      if (wake && wake.duckAttach) wake.duckAttach();  // guard on from the first play
    }
    return window.VERA_AUDIO_EL;
  }
  function stopAudio() {
    // Preempting a line must still run its completion (wake.resume, onDone…) —
    // a paused <audio> fires neither ended nor error, so flush it by hand.
    // Browser-TTS lines cancel too: one voice at a time, no overlaps.
    try { speechSynthesis.cancel(); } catch {}
    const a = currentAudio, f = currentFinish;
    currentAudio = null; currentFinish = null;
    if (a) { a.onended = a.onerror = null; try { a.pause(); } catch {} }
    if (f) f();
  }
  function speakAloud(text, onDone) {
    speakSeq++;  // a baked line supersedes any in-flight synth still fetching
    // She mustn't wake herself: pause the name-listener while a line contains it.
    const risky = wake && NAME_RE.test(text);
    let myToken = risky ? ++wakeToken : 0;  // let: the synth pause and the orphan duck take their own token below
    if (risky) wake.pause('speaking');  // ear off, but the chip says WHY — never a blink-out
    let done = false;
    let watchdog = 0;
    let orphanDuck = false;  // play() died with no media events — the duck-guard's back() will never run
    let synthPaused = false; // the TTS tier took the wake ear the risky-line way — finish hands it back
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      if (currentFinish === finish) { currentAudio = null; currentFinish = null; }
      // A duck (or synth pause) this call issued must not outlive it: with
      // no 'ended'/'pause' coming, hand the ear back — unless a capture
      // owns the pause now, or a NEWER claim (a glance's pause, a fresh
      // capture) bumped wakeToken after ours: same myToken check the
      // risky-line resume runs — a stale hold must never hand the ear
      // back over a foreign pause.
      if ((orphanDuck || synthPaused) && !risky && wake && !earOpen && !recording
        && myToken === wakeToken) wake.resume();
      if (risky) setTimeout(() => { if (myToken === wakeToken) wake.resume(); }, 250);
      if (onDone) onDone();
    };
    // Watchdog: audio/speech can be blocked silently, and Chromium's synth
    // stalls without onend on long lines — always advance, or `busy` wedges
    // forever. finish is idempotent, so a late real onend is harmless.
    watchdog = setTimeout(finish, Math.max(4000, 2500 + text.length * 120));
    // Pre-baked neural MP3 for scripted lines — her real voice.
    const src = (window.VERA_VOICE || {})[text];
    if (src) {
      try {
        stopAudio();
        const el = audioEl();
        el.onended = el.onerror = finish;
        el.src = src;
        currentAudio = el;
        currentFinish = finish;
        if (wake && wake.duck) wake.duck();  // pre-play duck: not one word plays quiet
        el.play().catch(() => {
          // The duck outlives the dead play() with no media events coming —
          // take a token so finish can tell OUR hold from a foreign claim
          // (risky lines already hold one from above).
          orphanDuck = true;
          if (!risky && wake) myToken = ++wakeToken;
          browserSpeak(text, finish);
        });
        return;
      } catch { orphanDuck = true; /* fall through — the synth pause below takes the token */ }
    }
    // TTS fallback tier: synthesis fires no media-element events, so the
    // duck-guard's back() could never hand the ear back — and per platform
    // law Android ducks all media during recognition, so a live wake ear
    // would play her synthesized reply near-silent. Risky-line pattern
    // instead: pause the ear now, resume in finish (watchdog included);
    // wakeToken++ retires any stale resume timer from an earlier line.
    if (!risky && wake) { myToken = ++wakeToken; wake.pause('speaking'); synthPaused = true; }  // ear off, but the chip says WHY — same '◈ Speaking' state as a ducked MP3 line; the token lets finish tell OUR pause from a later claim
    browserSpeak(text, finish);
  }
  function browserSpeak(text, finish) {
    // The voice list loads async; speaking before it exists = default robo-voice.
    if (!speechSynthesis.getVoices().length) {
      let fired = false;
      const go = () => { if (!fired) { fired = true; browserSpeakNow(text, finish); } };
      speechSynthesis.onvoiceschanged = go;
      setTimeout(go, 800);
      return;
    }
    browserSpeakNow(text, finish);
  }
  function browserSpeakNow(text, finish) {
    try {
      const vs = speechSynthesis.getVoices();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      // ONE consistency rule: only a voice that matches her recordings may
      // speak (Edge's neural British set). Anything else — Samantha, Google,
      // Android defaults — reads as a stranger, so text beats it. The worker's
      // /speak covers live replies everywhere anyway; this is a rare fallback.
      const en = vs.filter(x => /^en/i.test(x.lang) && !/\bmale\b/i.test(x.name));
      const v = en.find(x => /online|natural|neural/i.test(x.name) && /sonia|libby|maisie|female|aria|jenny|emma|ava|michelle/i.test(x.name))
        || null;
      if (!v) { voiceHint(); finish(); return; }
      u.voice = v;
      u.rate = 1.04; u.pitch = 1.0;
      u.onend = u.onerror = finish;
      speechSynthesis.speak(u);
    } catch { finish(); }
  }

  let hinted = false;
  function voiceHint() {
    // This browser can't do her voice justice for live replies — say so once.
    // Never during the boot show: the pill would land under the ticker.
    if (document.getElementById('boot-veil')) return;
    if (hinted) return;
    hinted = true;
    const h = document.createElement('div');
    const pos = matchMedia('(max-width: 640px)').matches ? 'top:76px' : 'bottom:142px';
    h.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);' + pos + ';' +
      'z-index:6;font-family:Rajdhani,sans-serif;font-size:11px;letter-spacing:0.18em;' +
      'color:rgba(127,184,204,0.8);background:rgba(8,22,34,0.88);padding:5px 14px;' +
      'border-radius:999px;border:1px solid rgba(63,217,255,0.25);max-width:88vw';
    h.textContent = /android/i.test(navigator.userAgent)
      ? 'TEXT MODE ON THIS DEVICE — HER SCRIPTED LINES STILL PLAY IN FULL VOICE'
      : 'TEXT MODE — FOR HER FULL VOICE ON LIVE REPLIES, OPEN IN MICROSOFT EDGE';
    document.body.appendChild(h);
    setTimeout(() => h.remove(), 14000);
  }

  // Live replies prefer her REAL voice, synthesized by the worker (/speak) —
  // identical in every browser. Falls back to browser TTS tier, then to text.
  function playB64(b64audio, text, onDone) {
    const risky = wake && NAME_RE.test(text);
    let myToken = risky ? ++wakeToken : 0;  // let: the orphan duck takes its own token below (mirror speakAloud)
    if (risky) wake.pause('speaking');  // ear off, but the chip says WHY — never a blink-out
    let done = false;
    let watchdog = 0;
    let orphanDuck = false;  // play() died with no media events — the duck-guard's back() will never run
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      if (currentFinish === finish) { currentAudio = null; currentFinish = null; }
      // A duck this call issued must not outlive it: with no 'ended'/'pause'
      // coming, hand the ear back — unless a capture owns the pause now, or
      // a NEWER claim bumped wakeToken after ours: same myToken check as
      // speakAloud's — a stale hold must never hand the ear back over a
      // foreign pause.
      if (orphanDuck && !risky && wake && !earOpen && !recording
        && myToken === wakeToken) wake.resume();
      if (risky) setTimeout(() => { if (myToken === wakeToken) wake.resume(); }, 250);
      if (onDone) onDone();
    };
    // Watchdog mirrors speakAloud's: a stalled element must never wedge `busy`.
    watchdog = setTimeout(finish, Math.max(4000, 2500 + text.length * 120));
    try {
      stopAudio();
      // The worker's engines return WAV (RIFF → 'UklGR') or MP3 — sniff it.
      const mime = b64audio.startsWith('UklGR') ? 'audio/wav' : 'audio/mpeg';
      const el = audioEl();
      el.onended = el.onerror = finish;
      el.src = 'data:' + mime + ';base64,' + b64audio;
      currentAudio = el;
      currentFinish = finish;
      if (wake && wake.duck) wake.duck();  // pre-play duck: not one word plays quiet
      el.play().catch(() => {
        // The duck outlives the dead play() with no media events coming —
        // take a token so finish can tell OUR hold from a foreign claim
        // (mirror speakAloud; risky lines already hold one from above).
        orphanDuck = true;
        if (!risky && wake) myToken = ++wakeToken;
        // Mirror speakAloud's catch: fall back to browser TTS, never a bare
        // finish — a blocked element was killing every reply MUTE in under
        // a second, which read as "she can't hear me" when she'd answered.
        browserSpeak(text, finish);
      });
    } catch { orphanDuck = true; if (!risky && wake) myToken = ++wakeToken; finish(); }
  }
  let speakSeq = 0;  // supersede token: a newer line silences a stale in-flight one
  async function speakReply(text, onDone) {
    const my = ++speakSeq;
    const stale = () => my !== speakSeq;
    if (API) {
      for (let attempt = 0; attempt < 2; attempt++) {  // synth cold-starts flake once
        // A stalled response must fall through to the fallbacks, not hang —
        // and EVERY browser gets the watchdog: where AbortSignal.timeout is
        // missing, a hand-rolled controller stands in, or a hung /speak
        // wedges busy forever (typed sends queue eternally, and only a
        // mic-tap barge-in via replyPlaying could ever escape).
        const ctrl = AbortSignal.timeout ? null : new AbortController();
        const ctrlTimer = ctrl ? setTimeout(() => ctrl.abort(), 9000) : 0;
        try {
          const r = await fetch(API + '/speak', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text }),
            signal: ctrl ? ctrl.signal : AbortSignal.timeout(9000),
          });
          const d = await r.json();
          if (stale()) { if (onDone) onDone(); return; }  // superseded mid-flight
          if (r.ok && d.audio) { playB64(d.audio, text, onDone); return; }
        } catch { /* retry, then fall through */ }
        finally { if (ctrlTimer) clearTimeout(ctrlTimer); }
        if (stale()) { if (onDone) onDone(); return; }
        await new Promise(res => setTimeout(res, 350));
      }
    }
    if (stale()) { if (onDone) onDone(); return; }
    speakAloud(text, onDone);
  }

  // The scripted reel (page script) speaks through this — respecting the toggle.
  window.VERA_SPEAK = (text, onDone) => {
    if (soundOn) speakAloud(text, onDone);
    else if (onDone) onDone();
  };
  soundBtn.onclick = () => {
    soundOn = !soundOn;
    userMuted = !soundOn;  // the tap IS the preference, both ways
    soundBtn.textContent = soundOn ? '🔊 SOUND' : '🔇 SOUND';
    // Never speak the confirmation over a live ear — it would land in the
    // capture as "their" words. The toggled icon is confirmation enough.
    if (soundOn && !earOpen && !recording) speakAloud('Voice enabled. Lovely to be heard.');
    else if (!soundOn) {
      // MUTE is a quiet-request: stopAudio's flush runs a playing reply's
      // finish, whose followUp would open a hands-free ear — a pulsing
      // LISTENING mic is the opposite of what the tap asked for. Clear the
      // voice flag FIRST so this flush ends the turn silently and hands
      // control back to the wake word.
      lastInputVoice = false;
      // …and mute is ENGAGEMENT: the flush can run the tour/handoff walk
      // line's onDone this very instant, and a visitor who asked for quiet
      // must not be teleported to the map mid-fade. Same walkCancelled-
      // before-flush ordering as every other engagement path — the visible
      // map link remains the door.
      walkCancelled = true;
      stopAudio(); speechSynthesis.cancel();
    }
  };

  /* ---- conversation ---- */
  const history = [];
  let busy = false;
  let turnGen = 0;   // turn-finish generation (mirror of the interview's ansGen): a superseded turn's checkpoints stand down — they must never release busy over a NEW turn, setMode over its stage, or open a followUp ear under its reply
  let replyPlaying = false;  // her reply is on the speakers — a mic tap now means barge-in, not a dead button
  let pendingSend = [];        // commands that arrived mid-reply wait their turn — drained oldest-first at each turn's finish, never swallowed
  let lastInputVoice = false;  // voice questions earn a hands-free follow-up window
  let summoning = false;       // a 'Yes?' summon ack holds the floor — no other path may open an ear under it
  let tookOver = false;
  let walkCancelled = false;  // engagement retires the scripted walk to the map (walkTo) — set by send/captures/glance/eye/mute/summon, never cleared
  function takeover() {
    // A visitor stepped up: stop the attract reel, clear the stage, theirs now.
    if (tookOver) return;
    tookOver = true;
    if (window.VERA_REEL_STOP) window.VERA_REEL_STOP();
    // The reel's hub panels (and their fetch/raf timers) die with the reel —
    // otherwise a muted or typed engagement strands them on stage forever.
    if (window.VERA_HUB) window.VERA_HUB.reset();
    try { speechSynthesis.cancel(); } catch {}
    stopAudio();  // silence the in-flight reel MP3, not just future steps
    if (window.VERA_TRANSCRIPT_RESET) window.VERA_TRANSCRIPT_RESET();
    else { const t = document.getElementById('transcript'); if (t) t.replaceChildren(); }
    const c = document.getElementById('cards');
    if (c) c.replaceChildren();
    setMode('idle');
  }
  // The API needs a user-led window: a fixed slice can land assistant-first
  // once primer pairs and check-in lines accumulate, and then every turn 400s.
  function sendWindow() {
    const w = history.slice(-12);
    while (w.length && w[0].role !== 'user') w.shift();
    return w;
  }
  async function send(text) {
    text = (text || '').trim();
    if (!text) return;
    // One rule: sending by ANY modality retires every open ear first — a
    // capture left live would hear her reply and mail it back as "their"
    // next words.
    if (abortCapture) abortCapture();
    recordDiscard();
    retireBorrow();  // a borrow mid-grant retires too — no rogue ear may outlive the send
    walkCancelled = true;  // engagement by any modality: the scripted walk to the map stands down for good
    if (busy) { pendingSend.push(text); return; }  // queued, not swallowed — and never overwritten: the queue drains oldest-first
    takeover();
    primeWeather();
    input.value = '';
    addLine('user', text);
    // Sending IS the gesture (the element is already blessed) — but an
    // explicit 🔇 is a preference, and one typed message must not undo it.
    if (!soundOn && !userMuted) { soundOn = true; soundBtn.textContent = '🔊 SOUND'; }
    if (!API) {
      const line = "The live brain isn't connected on this deployment yet — you're watching the rehearsal. Do try the Brain Map, though: that part is fully live, and I build yours as we talk.";
      setMode('speaking'); addLine('jarvis', line);
      if (soundOn) speakAloud(line, () => setMode('idle'));
      else setMode('idle');
      return;
    }
    busy = true;
    setMode('thinking');
    history.push({ role: 'user', content: text });
    let reply;
    // The /speak watchdog, one tier UP — where the wedge actually lives: a
    // stalled /chat holds busy for the browser's socket lifetime, and busy
    // is the whole page (mic dead at its gate, typed sends queueing
    // invisibly, the eye dead, 'thinking' forever) — on venue WiFi, the
    // normal demo condition. Brain replies run slower than synth, so the
    // budget is generous; the catch below already owns the friendly line
    // and finishTurn releases busy — the abort is the only new part.
    const ctrl = AbortSignal.timeout ? null : new AbortController();
    const ctrlTimer = ctrl ? setTimeout(() => ctrl.abort(), 22000) : 0;
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: sendWindow() }),
        signal: ctrl ? ctrl.signal : AbortSignal.timeout(22000),
      });
      const data = await r.json().catch(() => ({}));
      reply = (r.ok && data.reply) ? String(data.reply).slice(0, 600)
        : (data.error === 'rate_limited'
          ? 'You have rather exhausted my public allowance for the moment — do return later, or contact the management for the full experience.'
          : 'A gremlin in the wires. Do try again.');
    } catch (e) {
      // Recorded for the diagnostic: on a phone there is no console, so an
      // uplink failure is otherwise indistinguishable from "she ignored me".
      try { DIAG.fetches.push(`/chat ${e && e.name ? e.name : 'failed'}`); } catch {}
      reply = 'The uplink hiccuped. Once more, if you please.';
    }
    finally { if (ctrlTimer) clearTimeout(ctrlTimer); }
    history.push({ role: 'assistant', content: reply });
    setMode('speaking'); addLine('jarvis', reply);
    replyPlaying = true;
    const myTurn = ++turnGen;  // this finish chain owns the floor until a barge-in retires it
    const finishTurn = () => {
      if (myTurn !== turnGen) return;  // superseded: a newer turn owns busy/mode/followUp — stand down
      replyPlaying = false;
      setMode('idle'); busy = false;
      if (pendingSend.length) send(pendingSend.shift());  // oldest first — the rest wait for THAT turn's finish
      else if (lastInputVoice) followUp();  // conversation mode: no wake word between turns
      // The retiring path owns wake (mirror sendVoice's resume): a borrow
      // this send retired mid-grant paused the hotword, and retireBorrow
      // never touches wake — the turn that retired it hands the ear back
      // at its finish, and never over a live one.
      else if (wake && !earOpen && !recording) wake.resume();
    };
    if (soundOn) speakReply(reply, finishTurn);
    else finishTurn();  // muted stays muted — text lands, the turn ends silently
  }
  sendBtn.onclick = () => { lastInputVoice = false; send(input.value); };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { lastInputVoice = false; send(input.value); } });

  // Conversation mode: she just answered a spoken question — open the mic for
  // the follow-up without demanding her name again. Silence ends the exchange
  // and hands control back to the wake word.
  function followUp() {
    if (!API || busy || recording || earOpen || summoning) return;  // never double-open over a live ear — nor under a summon ack (its own deferred window opens next)
    if (canRecord && earsServer) recToggle(true);
    else if (captureOnce) captureOnce(true);
  }

  /* ---- voice in ---- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const idleHint = input.placeholder;
  const micIdle = () => {
    mic.classList.remove('rec'); mic.textContent = '🎙'; input.placeholder = idleHint;
  };
  let captureOnce = null;
  let abortCapture = null;
  let earOpen = false;  // ANY live ear — SR capture or recorder — one shared claim, nothing double-opens
  let earClaimGen = 0;  // bumps on EVERY earOpen claim: a borrow continuation must tell a retire (!earOpen) from a NEWER claim that re-took the ear after one — !earOpen alone cannot see the difference
  if (SR) {
    let rec = null;
    let cancelled = false;
    let foreignCancel = false;  // the abort came from a RETIRING path (send/glance) that owns wake now — onend must not resume over its pause
    abortCapture = () => {  // the send landed another way — this ear retires silently
      if (!rec) return;
      cancelled = true;
      foreignCancel = true;
      try { rec.abort(); } catch { try { rec.stop(); } catch {} }
    };
    captureOnce = (auto) => {
      if (rec) {  // second tap = cancel, and their typed draft survives
        cancelled = true;
        try { rec.abort(); } catch { try { rec.stop(); } catch {} }
        return;
      }
      // Mirror of recToggle's entry gate: thinking/uplink in flight stays
      // blocked, but a tap while HER REPLY is on the speakers (or owed —
      // the /speak fetch window) means barge-in, never a dead button.
      if (busy && !replyPlaying) return;
      // Mirror of recToggle's entry guard: the ear may already be claimed
      // by ANOTHER path (a live recorder, or a borrow mid-grant) — one SR
      // session per page, and two starters abort each other. Stand down;
      // the claiming path owns the turn.
      if (earOpen || recording) return;
      earOpen = true;  // claim BEFORE the flush below — its onDone chain calls followUp
      earClaimGen++;   // a stale borrow continuation must never mistake THIS claim for its own
      walkCancelled = true;  // BEFORE the flush: stopAudio may run the walk line's onDone this very instant
      stopAudio();     // barge-in: a mic tap mid-line means "let me speak" — she yields
      if (busy && replyPlaying && !currentAudio) {
        // The /speak fetch window (mirror recToggle): her reply is owed but
        // hasn't reached the speakers, so there was nothing to flush and
        // busy still holds. Retire the in-flight synth AND its turn-finish
        // checkpoints (speakSeq: the stale /speak resolution dies at
        // stale(); turnGen: the stale chain must never play her reply over
        // this open ear to be transcribed back as "their" words, release
        // busy over a NEW turn, or open a followUp ear) — and release the
        // floor here, ourselves. A send queued mid-window stays queued —
        // the next turn's finish runs it, as ever.
        speakSeq++;
        turnGen++;
        busy = false;
        replyPlaying = false;
      } else if (busy) { earOpen = false; return; }  // the flush handed the turn onward (a queued send owns it) — too early to yield
      takeover();
      if (wake) { wakeToken++; wake.pause(); }  // one recognizer at a time; kill stale resumes
      cancelled = false;
      foreignCancel = false;
      const draft = input.value;
      rec = new SR();
      rec.lang = 'en-US'; rec.interimResults = true; rec.maxAlternatives = 1;
      rec.continuous = true;  // Chrome must not hang up on a thinking human
      mic.classList.add('rec'); mic.textContent = '◉ LISTENING';
      // A non-empty box is someone's writing (the interview's house rule,
      // now every ear's): the auto follow-up window fires the instant her
      // reply ends — precisely when a typing visitor is mid-composition.
      // Seed the SR base from the box so speech APPENDS, never wipes.
      const seeded = input.value.trim();
      if (!seeded) input.value = '';
      input.placeholder = 'Take your time — I’m listening…';
      setMode('listening'); targetLevel = 0.5;
      // Same endpointing as the interview: WE decide when they're done, not
      // Chrome. Base pause 5s, pause-and-resumers 6.5s, trailing connectives
      // buy extra time. Up-front thinking silence: a deliberate tap earns a
      // generous 75s, but an AUTO follow-up window bows out at ~11s — a
      // silent visitor must not face a pulsing mic (wake word suspended)
      // for over a minute after she finishes a reply.
      let base = seeded;
      let lastHeardAt = Date.now();
      let sawPauseResume = false;
      const t0 = Date.now();
      const CONT = /\b(and|or|but|so|because|like|um|uh|then|also|plus|maybe|well)[\s.]*$/i;
      let endTimer = null;
      // Typing IS activity: the box renders the live transcript and invites
      // correction, but the idle clock reads lastHeardAt — which only
      // SPOKEN results refresh. A visitor who types instead, or edits the
      // transcript mid-capture, must not have the half-composed draft
      // auto-mailed ~5s after their last spoken word. 'input' fires for
      // real keystrokes only — never for onresult's programmatic
      // assignments — so a keystroke holds the floor as surely as a word.
      // And the correction must SURVIVE: onresult rebuilds the box
      // wholesale (base + heard), so the very next result — even an
      // interim-to-final refinement of words already spoken, with the room
      // silent — would stomp the edit mid-keystroke. Fold the edited box
      // into base instead: abort the recognizer, and the onend keep-alive's
      // base-fold + restart picks the ear back up appending to THEIR text.
      const onType = () => {
        lastHeardAt = Date.now();
        // Past the 90s wall this abort is the capture's LAST event — mark
        // the cause, so onend can tell a keystroke from an endpoint.
        if (rec) { rec._typed = true; try { rec.abort(); } catch { try { rec.stop(); } catch {} } }
      };
      input.addEventListener('input', onType);
      const armEnd = () => {
        clearTimeout(endTimer);
        endTimer = setTimeout(() => {
          const said = input.value.trim();
          const idle = Date.now() - lastHeardAt;
          let cap = sawPauseResume ? 6500 : 5000;
          if (CONT.test(said)) cap += 2500;
          if (!said && Date.now() - t0 < (auto ? 11000 : 75000)) { armEnd(); return; }
          if (said && idle < cap) { armEnd(); return; }
          try { rec._finish = true; rec.stop(); } catch {}
        }, 1200);
      };
      rec.onresult = e => {
        const gap = Date.now() - lastHeardAt;
        if (input.value.trim() && gap > 2000) sawPauseResume = true;
        lastHeardAt = Date.now();
        let heard = '';
        for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
        input.value = (base + ' ' + heard).trim();  // their words, appearing as they speak
      };
      rec.onend = () => {
        // Chrome gave up; if THEY haven't, quietly pick the ear back up.
        if (!cancelled && rec && !rec._finish && Date.now() - t0 < 90000) {
          base = input.value.trim();
          try { rec.start(); rec._typed = false; return; } catch {}
        }
        const blocked = !!(rec && rec._blocked);
        const typedOut = !!(rec && rec._typed && !rec._finish);  // the 90s wall met a keystroke, not an endpoint
        clearTimeout(endTimer);
        input.removeEventListener('input', onType);  // the capture's clock dies with it
        micIdle(); rec = null;
        earOpen = false;
        const said = input.value.trim();
        if (cancelled || !said) {
          input.value = draft;
          // Honest copy at a blocked mic (demo_wake's pattern) — never a
          // silent draft restore after a pulsing ear that could not hear.
          if (blocked) input.placeholder = 'Mic blocked — type instead';
          if (!busy) setMode('idle');
        } else if (typedOut) {
          // The 90s wall met a KEYSTROKE, not an endpoint: the abort that
          // landed here came from onType, with the visitor mid-edit — the
          // clock must not stop respecting keystrokes at exactly the
          // boundary, auto-sending a half-edited box. Hand back to manual:
          // their words stay in the box, and Enter/SEND submits when THEY
          // decide.
          if (!busy) setMode('idle');
        } else {
          input.value = '';
          lastInputVoice = true;
          send(said);
        }
        // A FOREIGN abort (send/glance retired this ear) owns wake now: its
        // turn-finish resumes the hotword — resuming here would arm it over
        // a flow that deliberately paused it (a glance's screen picker).
        if (wake && !foreignCancel) wake.resume();
      };
      rec.onerror = ev => {
        // 'not-allowed' must not spin the keep-alive loop (onerror → onend →
        // start → onerror… for up to 90 pulsing seconds at a mic that can
        // never hear): settle NOW — onend sees _finish and stands down —
        // and let onend surface the honest copy.
        if (rec && ev && (ev.error === 'not-allowed' || ev.error === 'service-not-allowed')) {
          rec._finish = true;
          rec._blocked = true;
        }
      };
      try { rec.start(); } catch {
        // A recognizer that can't even start must not hold the ear claim.
        input.removeEventListener('input', onType);
        micIdle(); rec = null; earOpen = false;
        input.value = draft;
        if (!busy) setMode('idle');
        if (wake) wake.resume();
        return;
      }
      armEnd();
    };
  }

  /* ---- push-to-talk: her server-side ears (worker /voice) ----
     Records real audio, Whisper transcribes it in the worker, and she answers
     in her real voice. Same hearing in every browser — no Web Speech roulette. */
  const canRecord = !!(API && navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    && (window.AudioContext || window.webkitAudioContext));
  let recording = null;

  function b64FromBuf(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function wavFrom(chunks, sourceRate) {
    let len = 0; for (const c of chunks) len += c.length;
    const flat = new Float32Array(len);
    let o = 0; for (const c of chunks) { flat.set(c, o); o += c.length; }
    const OUT = 16000;
    const ratio = sourceRate / OUT;
    const n = Math.floor(flat.length / ratio);
    const buf = new ArrayBuffer(44 + n * 2);
    const dv = new DataView(buf);
    const w = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, OUT, true); dv.setUint32(28, OUT * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    w(36, 'data'); dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const v = Math.max(-1, Math.min(1, flat[Math.floor(i * ratio)]));
      dv.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
    return buf;
  }

  let recStream = null, recCtx = null, recSrcNode = null;
  let earsGen = 0;        // generation token (ported from the interview): a stale borrow must never clobber a newer one
  let earBorrow = false;  // a grant is pending — the ear claim exists with no capture behind it yet
  // ?keepmic=1 — TEST SWITCH for the iOS permission-prompt storm.
  // Default (off) = today's behaviour: the mic track is STOPPED after every
  // listen, which releases iOS's audio session (that's what keeps her voice
  // out of the earpiece) but makes the next listen re-acquire — and iPhone
  // Chrome can re-prompt on every acquisition, which is the popup Kevin sees
  // every few seconds. On (=1) = keep the granted track alive but DISABLED
  // between listens: permission persists, no new prompt, and the session is
  // still released by closing the AudioContext below.
  const KEEP_MIC = /[?&]keepmic=1/.test(location.search);

  function releaseEars() {
    earsGen++;  // any borrow still awaiting its grant is now stale — it stands down
    try {
      if (recStream) recStream.getTracks().forEach(t => {
        t.onended = null;
        if (KEEP_MIC) t.enabled = false;   // keep the grant, mute the input
        else t.stop();                     // full release (re-prompts on iOS)
      });
    } catch {}
    if (!KEEP_MIC) recStream = null;
    try { if (recCtx) recCtx.close(); } catch {}
    recCtx = null; recSrcNode = null;
  }
  function retireBorrow() {
    // The third retire path, same one-rule: a borrow mid-grant (mic tapped,
    // permission prompt still up) is invisible to abortCapture (no SR
    // session yet) and to recordDiscard (`recording` is still null). Bump
    // the generation so the surviving continuation stands down instead of
    // opening a capture under her incoming reply, and clear the claim it
    // held — the retiring path owns the turn now.
    if (!earBorrow) return;
    earBorrow = false;
    earsGen++;
    earOpen = false;
  }
  async function ensureEars() {
    // Borrow-per-listen — the WHOLE audio session, not just the stream. The
    // PERMISSION persists after the first in-gesture grant, but iOS tears
    // its audio session down whenever the borrowed stream is released,
    // leaving a kept AudioContext suspended beyond resume()'s reach outside
    // a tap: LISTENING shows while the processor never fires, forever. So
    // each listen gets a context born fresh — created BEFORE the await,
    // inside the tap when there is one, which is when iOS lets it run.
    releaseEars();
    const gen = ++earsGen;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    recCtx = ctx;
    let stream = null;
    if (KEEP_MIC && recStream && recStream.getAudioTracks().some(k => k.readyState === 'live')) {
      stream = recStream;                                  // reuse the grant
      stream.getAudioTracks().forEach(k => { k.enabled = true; });
    } else {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}
    }
    if (gen !== earsGen) {
      // Superseded (or retired) while the grant was pending — stand down
      // without touching the newer borrow's stream or context.
      try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch {}
      try { ctx.close(); } catch {}
      return false;
    }
    if (!stream) { recStream = null; return false; }
    recStream = stream;
    recSrcNode = recCtx.createMediaStreamSource(recStream);
    return true;
  }

  async function recToggle(auto) {
    // Thinking/uplink in flight: blocked as ever. But a tap while HER REPLY
    // is on the speakers means barge-in — never a dead button (on iPhone the
    // recorder is the ONLY path, so a dead mic here is a dead mic, full stop).
    if (busy && !replyPlaying) return;
    if (recording) { recordFinish(); return; }
    if (earOpen) {
      // A live SR capture holds the ear (wake summon or ensureEars fallback
      // after the /health mic swap): the tap must still mean CANCEL — route
      // it to the capture's own cancel path, draft and wake restored as ever.
      if (abortCapture) abortCapture();
      return;
    }
    earOpen = true;  // claim BEFORE the flush — its onDone chain calls followUp
    const myClaim = ++earClaimGen;  // the generation this borrow serves — checked after the grant await
    walkCancelled = true;  // BEFORE the flush: stopAudio may run the walk line's onDone this very instant
    // Barge-in, mirror of captureOnce: silence her mid-reply BEFORE opening
    // the capture — her own words must never be recorded and mailed to
    // /voice as "their" speech.
    stopAudio();
    if (busy && replyPlaying && !currentAudio) {
      // The /speak fetch window: her reply is owed but hasn't reached the
      // speakers, so there was nothing to flush and busy still holds.
      // replyPlaying exists precisely so a tap here is barge-in, not a dead
      // button — retire the in-flight synth AND its turn-finish checkpoints
      // (turnGen: the stale chain must never release busy over the NEW turn,
      // setMode('idle') over its 'thinking', or read the LIVE lastInputVoice
      // and open a followUp ear under a reply still in flight), and release
      // the floor here, ourselves. A send queued mid-window stays queued —
      // the next turn's resume runs it, as ever.
      speakSeq++;
      turnGen++;
      busy = false;
      replyPlaying = false;
    } else if (busy) { earOpen = false; return; }  // the flush handed the turn onward (a queued send owns it) — too early to yield
    const tc = document.getElementById('talk-chip');
    if (tc) tc.remove();
    takeover();
    // A deliberate mic tap wants a spoken answer — the same contract SEND
    // already honors. (!auto: a machine-opened window claims no gesture;
    // userMuted stays sovereign — only the SOUND tap clears an explicit mute.)
    if (!auto && !soundOn && !userMuted) { soundOn = true; soundBtn.textContent = '🔊 SOUND'; }
    if (wake) { wakeToken++; wake.pause(); }
    earBorrow = true;  // the grant window: send()/glance() retire this claim via retireBorrow
    let earsOk = false;
    try { earsOk = await ensureEars(); } catch { earsOk = false; }
    if (!earOpen || myClaim !== earClaimGen) {
      // Retired mid-grant (a typed send or a glance claimed the turn while
      // the permission prompt lingered), or a NEWER claim re-took the ear
      // after such a retire (a fresh mic tap, a summon window): stand down
      // silently — opening now would put a live recorder under her incoming
      // reply, recorded and re-mailed to /voice as "their" words. The
      // retiring/claiming path owns busy/mode/wake — and earBorrow — now;
      // release only OUR borrow (a superseded ensureEars already cleaned
      // itself up).
      if (earsOk) releaseEars();
      return;
    }
    earBorrow = false;  // the grant window closed with this claim still ours
    if (!earsOk) {
      earOpen = false;
      if (captureOnce) { captureOnce(auto); return; }
      // No browser SR to fall back to (every iPhone): say so, never die mute.
      input.placeholder = 'Tap the mic so she can listen';
      if (wake) wake.resume();
      return;
    }
    // iOS reports a kicked session as 'interrupted', not 'suspended' —
    // anything short of running must resume or the mic hears nothing.
    if (recCtx.state !== 'running') { try { await recCtx.resume(); } catch {} }
    // A track iOS kills mid-listen must end the capture, not play dead.
    recStream.getTracks().forEach(t => { t.onended = () => recordFinish(); });
    const node = recCtx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    const rec = { node, chunks, rate: recCtx.sampleRate,
      auto: !!auto, spoke: false, quietMs: 0, frames: 0,
      draft: input.value,  // typed half-answers survive a silent/dead capture
      settleMs: 350,  // her own voice tail is still in the room — not an answer
      // Safety net ONLY — endpointing belongs to the RMS pause caps below
      // (auto) or the finish tap (manual). A wall clock must never cut a
      // visitor off mid-thought — but it must also fit the worker's 2.5MB
      // request cap: 95s of 16-bit 16kHz WAV is ~3.0MB (guaranteed 413);
      // 75s is ~2.4MB and lands. A wall the server always rejects is worse
      // than a shorter wall that transcribes.
      timer: setTimeout(recordFinish, 75000),
      // Dead-pipe watchdog: if no frame arrives at all, end the capture
      // fast and say so — a dead processor must never impersonate a quiet
      // room for ninety-five silent seconds.
      pulse: setTimeout(() => { if (recording === rec && !rec.frames) recordFinish(); }, 1500) };
    // Typing IS activity — the SR tier's rule, owed to the ONLY path an
    // iPhone has: the quiet clock below reads quietMs, which only RMS
    // zeroes, so a visitor who TYPES their follow-up instead of speaking
    // would read as a silent room and be bowed out mid-keystroke at 12s,
    // their half-typed message stomped by the stale draft restore. A
    // keystroke holds the floor as surely as a spoken word ('input' fires
    // for real keystrokes only — the recorder never writes the box).
    rec.onType = () => { rec.quietMs = 0; };
    input.addEventListener('input', rec.onType);
    node.onaudioprocess = e => {
      rec.frames++;
      const d = e.inputBuffer.getChannelData(0);
      const frameMs = (d.length / rec.rate) * 1000;
      if (rec.settleMs > 0) { rec.settleMs -= frameMs; return; }  // echo settle
      chunks.push(new Float32Array(d));
      if (!rec.auto) return;
      // Follow-up windows self-endpoint: speech then a pause sends; pure
      // silence bows out quietly instead of mailing ambience to the worker.
      let sum = 0;
      for (let i = 0; i < d.length; i += 8) sum += d[i] * d[i];
      const rms = Math.sqrt(sum / (d.length / 8));
      // ONE endpointing personality across all four ears: base 5000 matches
      // the SR path and the interview recorder — anything stricter cuts fast
      // starters off at their FIRST real mid-thought pause. Pause-and-
      // resumers get 6500. (Resume detection reads quietMs BEFORE speech
      // zeroes it — the other order can never fire.)
      if (rec.quietMs > 2000 && rms > 0.015) rec.pauser = true;
      if (rms > 0.015) { rec.spoke = true; rec.quietMs = 0; }
      else rec.quietMs += frameMs;
      const pcap = rec.pauser ? 6500 : 5000;
      if ((rec.spoke && rec.quietMs > pcap) || (!rec.spoke && rec.quietMs > 12000)) recordFinish();
    };
    recSrcNode.connect(node); node.connect(recCtx.destination);
    recording = rec;
    mic.classList.add('rec');
    // Recorder-tier tap grammar: a tap on a LIVE recorder SENDS (recToggle →
    // recordFinish) in BOTH window kinds — '◉ LISTENING' alone belongs to
    // the SR tier, where the same pulse means tap-to-CANCEL. State the
    // tap's real meaning, auto windows included, and a tap-to-shut-it-up
    // never mails a half-sentence by surprise.
    mic.textContent = auto ? '◉ TAP TO SEND' : '◉ TAP WHEN DONE';
    // The recorder inherits the same rule: a non-empty box is a live
    // composition — an auto-opened window must never wipe it.
    if (!input.value.trim()) input.value = '';
    input.placeholder = auto ? 'Go on — I’m still listening…'
      : 'Listening — speak, then tap the mic to finish…';
    setMode('listening'); targetLevel = 0.5;
  }

  function recordFinish() {
    if (!recording) return;
    const r = recording;
    recording = null;
    earOpen = false;
    clearTimeout(r.timer); clearTimeout(r.pulse);
    input.removeEventListener('input', r.onType);  // the capture's clock dies with it
    try { recSrcNode.disconnect(r.node); } catch {}
    try { r.node.disconnect(); } catch {}
    // RELEASE the whole session between listens: a held stream flips iOS
    // into the phone-call session, and a kept context wakes up dead (see
    // ensureEars). Site permission persists — the next listen re-borrows.
    releaseEars();
    micIdle();
    if (!r.frames) {
      // Their typed draft survives a dead pipe — and fresh typing beats the
      // stale snapshot: restore only into an empty box.
      if (!input.value.trim()) input.value = r.draft;
      // Not one frame arrived — the pipe was dead, not the room quiet.
      addLine('jarvis', 'My ears cut out for a moment \u2014 tap the mic and I\u2019ll listen again.');
      setMode('idle');
      if (wake) wake.resume();
      return;
    }
    let total = 0; for (const c of r.chunks) total += c.length;
    if ((r.auto && !r.spoke) || total < r.rate * 0.4) {
      // Their typed draft survives a silent bow-out — and fresh typing
      // beats the stale snapshot: restore only into an empty box.
      if (!input.value.trim()) input.value = r.draft;
      // Say why the ear closed — a blank idle after 12 quiet seconds reads
      // as "she ignored me" on the ONE platform with no console.
      input.placeholder = 'Didn’t catch that — tap the mic and try again';
      setMode('idle');
      if (wake) wake.resume();  // silence: the exchange is over, her name resumes duty
      return;
    }
    lastInputVoice = true;
    sendVoice(wavFrom(r.chunks, r.rate), r.draft);  // the typed draft rides along — failure paths restore it
  }

  function recordDiscard() {
    // The send landed another way mid-capture: release the ear, clear the
    // timers, drop the chunks — post nothing. Her reply must never come back
    // as "their" words.
    if (!recording) return;
    const r = recording;
    recording = null;
    earOpen = false;
    clearTimeout(r.timer); clearTimeout(r.pulse);
    input.removeEventListener('input', r.onType);  // the capture's clock dies with it
    try { recSrcNode.disconnect(r.node); } catch {}
    try { r.node.disconnect(); } catch {}
    releaseEars();
    micIdle();
    if (wake) wake.resume();  // the reply about to play will duck it as usual
  }

  async function sendVoice(wavBuf, draft) {
    busy = true;
    primeWeather();
    setMode('thinking');
    input.placeholder = 'On the wires…';
    let d = null;
    // send()'s watchdog, recorder tier: /voice carries the upload, Whisper,
    // the brain AND the synth in one round trip — but a stalled socket must
    // never hold busy for its lifetime. On iPhone this recorder is the ONLY
    // voice path, so a wedge here is a dead mic with no alternative. The
    // uplink line below and resume() already own the failure — abort only.
    const ctrl = AbortSignal.timeout ? null : new AbortController();
    const ctrlTimer = ctrl ? setTimeout(() => ctrl.abort(), 25000) : 0;
    try {
      const r = await fetch(API + '/voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audio: b64FromBuf(wavBuf), messages: sendWindow() }),
        signal: ctrl ? ctrl.signal : AbortSignal.timeout(25000),
      });
      d = await r.json().catch(() => null);
    } catch { d = null; }
    finally { if (ctrlTimer) clearTimeout(ctrlTimer); }
    input.placeholder = idleHint;
    // busy HOLDS through playback (mirror send()): while her reply speaks, a
    // typed send must queue — not bypass the queue and stomp the stage — and
    // a mic tap reads as barge-in via replyPlaying, not a free pass.
    const myTurn = ++turnGen;  // this finish chain owns the floor until a barge-in retires it
    const resume = () => {
      if (myTurn !== turnGen) return;  // superseded: a newer turn owns busy/mode/followUp — stand down
      busy = false;
      replyPlaying = false;
      setMode('idle');
      if (pendingSend.length) { send(pendingSend.shift()); return; }  // oldest first — the rest wait for that turn's finish
      if (lastInputVoice) followUp();     // keep the conversation going hands-free
      // Never over a live ear: a fetch-window barge-in retires this reply,
      // and its deferred release lands AFTER the new capture opened.
      else if (wake && !earOpen && !recording) wake.resume();
    };
    // Draft-survival is the house rule (mirror of the interview's hearFinish):
    // a typed half-message from before the mic tap must survive every path
    // where their speech produced no sent turn.
    if (d && d.error === 'silence') {
      if (!input.value.trim()) input.value = draft || '';  // fresh typing beats the stale snapshot — restore only into an empty box
      const line = 'I didn’t catch that — do try again, a touch closer to the microphone.';
      addLine('jarvis', line);
      // The one branch every deaf-pipe failure converges on — SPOKEN, like
      // its siblings below: a text-only line on a phone in a pocket is the
      // same silence the visitor already got.
      if (soundOn) { replyPlaying = true; setMode('speaking'); speakAloud(line, resume); }
      else resume();
      return;
    }
    // Error lines honor the mute like every sibling (the happy path, the
    // glance, the silence path above): userMuted's contract says only the
    // SOUND tap clears it — an error must not speak over it. Gate the way
    // glance does, and claim replyPlaying only when audio will actually
    // play — a barge-in target that never reaches the speakers is a lie.
    if (d && d.error === 'rate_limited') {
      if (!input.value.trim()) input.value = draft || '';  // fresh typing beats the stale snapshot — restore only into an empty box
      const line = 'You have rather exhausted my public allowance for the moment — do return later, or contact the management for the full experience.';
      addLine('jarvis', line);
      // Error lines flip to 'speaking' like the happy path does — without it
      // every timed-out turn held amber PROCESSING through its whole spoken line.
      if (soundOn) { replyPlaying = true; setMode('speaking'); speakAloud(line, resume); }
      else resume();
      return;
    }
    if (!d || !d.reply) {
      if (!input.value.trim()) input.value = draft || '';  // fresh typing beats the stale snapshot — restore only into an empty box
      const line = 'The uplink hiccuped. Once more, if you please.';
      addLine('jarvis', line);
      // Same rule as above: her recovery line is SPEAKING, not PROCESSING.
      if (soundOn) { replyPlaying = true; setMode('speaking'); speakAloud(line, resume); }
      else resume();
      return;
    }
    if (d.heard) { addLine('user', d.heard); history.push({ role: 'user', content: d.heard }); }
    history.push({ role: 'assistant', content: d.reply });
    setMode('speaking');
    addLine('jarvis', d.reply);
    replyPlaying = true;
    if (d.audio && soundOn) playB64(d.audio, d.reply, resume);
    else if (soundOn) speakReply(d.reply, resume);  // server synth flaked — one more try
    else resume();
  }

  /* ---- the glance: one frame of their world, entirely on request ----
     Desktop: the screen (getDisplayMedia — the browser's own picker decides
     exactly what she may see). Phone browsers ship no screen capture, so
     there the eye is the CAMERA: point it at anything — a letter, a text on
     another screen, the room. One frame, tracks stopped instantly, nothing
     stored anywhere. */
  const canScreen = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  const canCam = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (!API || (!canScreen && !canCam)) eye.style.display = 'none';
  else eye.title = canScreen
    ? 'Show her your screen — one look, on your terms'
    : 'Show her something — one look through your camera';

  async function grabFrame(kind) {
    let stream;
    try {
      stream = kind === 'screen'
        ? await navigator.mediaDevices.getDisplayMedia({ video: true })
        : await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch { return null; }  // they closed the picker — a choice, not an error
    try {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.srcObject = stream;
      await v.play();
      await new Promise(res => setTimeout(res, 350));  // let exposure settle
      const scale = Math.min(1, 1280 / (v.videoWidth || 1280));
      const c = document.createElement('canvas');
      c.width = Math.max(2, Math.round((v.videoWidth || 1280) * scale));
      c.height = Math.max(2, Math.round((v.videoHeight || 720) * scale));
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.72).split(',')[1];
    } catch { return null; }
    finally { stream.getTracks().forEach(t => t.stop()); }
  }

  async function glance(kind) {
    if (busy || !API) return;
    // One rule (same as send): a modality that produces a reply retires
    // every open ear first — a live capture would hear her spoken answer
    // and mail it back as "their" words.
    if (abortCapture) abortCapture();
    recordDiscard();
    retireBorrow();  // a borrow mid-grant retires too — no rogue ear may outlive the glance
    walkCancelled = true;  // showing her something is engagement — the scripted walk stands down
    takeover();
    if (wake) { wakeToken++; wake.pause(); }
    const frame = await grabFrame(kind);
    // Never over a live ear: a mic tap during the picker claimed it and
    // owns the pause now (same guard as every terminal resume).
    if (!frame) { if (wake && !earOpen && !recording) wake.resume(); return; }
    // A turn that COMPLETED in the picker gap owns the floor: a tap-to-send
    // on the recorder (or the SR endpoint) already set busy with its fetch
    // in flight, and the triple retire below kills only LIVE ears — running
    // on would stomp busy over a real turn and race two replies, whichever
    // lands second flushing the first mid-word. That turn's finish owns
    // busy/mode/wake now: stand down, the frame dies unsent.
    if (busy) return;
    // The picker gap is interactive and LONG (Firefox's non-modal picker,
    // camera permission prompts, the exposure settle) — and busy stayed
    // false the whole way, so a mic tap or the summon's deferred window
    // passed captureOnce's guards and holds a live ear NOW. Same one-rule
    // as entry: the reply this frame is about to earn retires every ear
    // first, or her /see answer plays into the capture — ducked
    // near-silent on Android — and mails back as "their" next words.
    if (abortCapture) abortCapture();
    recordDiscard();
    retireBorrow();
    busy = true;
    setMode('thinking');
    addLine('user', kind === 'screen' ? '◎ (showed her the screen)' : '◎ (showed her the camera)');
    let d = null;
    // The third of the three primary fetches gets the same watchdog: a
    // stalled /see would hold busy forever with the eye dead at its own
    // gate. Vision runs on the brain's clock — same generous budget; the
    // error line below and resume() already own the failure.
    const ctrl = AbortSignal.timeout ? null : new AbortController();
    const ctrlTimer = ctrl ? setTimeout(() => ctrl.abort(), 25000) : 0;
    try {
      const r = await fetch(API + '/see', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: frame, messages: sendWindow() }),
        signal: ctrl ? ctrl.signal : AbortSignal.timeout(25000),
      });
      d = await r.json().catch(() => null);
    } catch { d = null; }
    finally { if (ctrlTimer) clearTimeout(ctrlTimer); }
    // busy HOLDS through playback (the house rule — mirror sendVoice): a
    // typed send mid-reply queues instead of stomping the stage, a mic tap
    // reads as barge-in via replyPlaying, a second eye click stays blocked —
    // and this finish chain stands down at turnGen if a barge-in retires it.
    const myTurn = ++turnGen;  // this finish chain owns the floor until a barge-in retires it
    const resume = () => {
      if (myTurn !== turnGen) return;  // superseded: a newer turn owns busy/mode/wake — stand down
      busy = false;
      replyPlaying = false;
      setMode('idle');
      if (pendingSend.length) { send(pendingSend.shift()); return; }  // oldest first — the rest wait for that turn's finish
      if (wake && !earOpen && !recording) wake.resume();  // never over a live ear
    };
    if (!d || !d.reply) {
      const line = d && d.error === 'rate_limited'
        ? 'My eyes have had rather a full day — do show me again tomorrow.'
        : 'I couldn’t quite make that out. Once more, if you please.';
      addLine('jarvis', line);
      setMode('speaking');  // error lines speak like the happy path at :1181 does
      replyPlaying = true;
      if (soundOn) speakReply(line, resume); else resume();
      return;
    }
    history.push(
      { role: 'user', content: '(I just showed you one image of my ' + (kind === 'screen' ? 'screen' : 'surroundings') + ')' },
      { role: 'assistant', content: d.reply },
    );
    setMode('speaking');
    addLine('jarvis', d.reply);
    replyPlaying = true;
    if (d.audio && soundOn) playB64(d.audio, d.reply, resume);
    else if (soundOn) speakReply(d.reply, resume);
    else resume();
  }
  // Desktops have BOTH sights: a tiny two-button ask beats guessing. Phones
  // ship no screen capture, so the eye goes straight to the camera there.
  function pickSight() {
    if (document.getElementById('sight-pick')) return;
    const p = document.createElement('div');
    p.id = 'sight-pick';
    p.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:150px;' +
      'z-index:7;display:flex;gap:8px;background:rgba(8,22,34,0.95);' +
      'border:1px solid rgba(63,217,255,0.4);border-radius:6px;padding:8px;' +
      'font-family:Rajdhani,sans-serif';
    const mk = (label, kind) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.style.cssText = 'background:none;border:1px solid rgba(63,217,255,0.45);' +
        'border-radius:4px;color:#3fd9ff;font-family:inherit;font-size:11px;' +
        'letter-spacing:0.2em;padding:6px 14px;cursor:pointer';
      b.onclick = () => { p.remove(); glance(kind); };
      return b;
    };
    p.append(mk('SCREEN', 'screen'), mk('CAMERA', 'camera'));
    document.body.appendChild(p);
    setTimeout(() => { if (p.isConnected) p.remove(); }, 8000);
  }
  eye.onclick = () => {
    if (busy || !API) return;
    // Engagement BEFORE the branch: on desktop the picker sits open up to
    // 8s before glance() ever runs, and a tour/handoff line ending in that
    // window would navigate to the map over the visitor's in-progress
    // choice — same walkCancelled-before-anything ordering as the four
    // other engagement paths.
    walkCancelled = true;
    if (canScreen && canCam) pickSight();
    else glance(canScreen ? 'screen' : 'camera');
  };

  let earsServer = false;
  if (SR) mic.onclick = () => captureOnce();  // the click Event must not read as `auto`
  else if (canRecord) { earsServer = true; mic.onclick = () => recToggle(false); }
  else mic.style.display = 'none';
  if (canRecord) (async () => {
    // Upgrade to server ears once the worker confirms it has them.
    try {
      // Bounded: this probe decides which TIER the mic uses, so a hung
      // socket leaves the button wired to the wrong ear indefinitely.
      const ab = abortIn(8000);
      let h;
      try { h = await (await fetch(API + '/health', { signal: ab.signal })).json(); }
      finally { ab.done(); }
      if (h && h.ok && h.stt) { earsServer = true; mic.onclick = () => recToggle(false); }
    } catch { /* old worker, or the probe timed out: browser SR stays */ }
  })();

  let lastWake = -1e9;
  const wake = window.VERA_WAKE
    ? window.VERA_WAKE.init({ onWake: (cmd) => {
        // A summon is engagement by any modality — the sixth path, same
        // walkCancelled-before-flush ordering as the other five: the 'Yes?'
        // ack's stopAudio can run the tour/handoff walk line's onDone this
        // very instant (takeover() is spent by then — the entry gate
        // consumed the latch), and a visitor summoning her must not be
        // teleported to the map mid-summon. The visible map link remains
        // the door.
        walkCancelled = true;
        const now = performance.now();
        if (now - lastWake < 3000) { if (wake) wake.resume(); return; }  // no "yes yes yes" parroting
        lastWake = now;
        if (!soundOn) { soundOn = true; soundBtn.textContent = '🔊 SOUND'; }
        takeover();
        cmd = (cmd || '').trim();
        if (cmd.split(/\s+/).length >= 2) {
          lastInputVoice = true;
          send(cmd);                       // one breath: "Vera, …" went straight to the brain
          if (wake) wake.resume();
          return;
        }
        const a = (window.VERA_VOICE || {})['Yes?'];
        let acked = false;
        // Own the floor BEFORE any flush side-effect can claim it: speaking
        // the ack over a mid-flight reply flushes that reply's finish, whose
        // followUp would otherwise open an ear before 'Yes?' reaches the
        // speakers — Android ducks her near-inaudible, and the capture
        // mails the ack back as "their" words. followUp respects this
        // flag; the deferred window below clears it.
        summoning = true;
        // The summon is a floor-claimer like every other (captureOnce,
        // recToggle, glance all bump first, for exactly this): retire any
        // stale risky-resume timer NOW, or a chip-click barge-in over a
        // risky line re-arms the wake ear under the playing ack — Android
        // ducks its tail, and the deferred window's SR start can throw
        // against the re-armed ear, costing the summon.
        if (wake) wakeToken++;
        const then = () => {
          if (acked) return;
          acked = true;
          // onWake only exists where SR does (demo_wake bails without it),
          // and SR existing means captureOnce exists — no other branch.
          // Hands-free window: a bare summon may be a false trigger (TV, an
          // overheard name) — bow out on the ~11s auto clock, never 75
          // pulsing seconds with the hotword suspended.
          // Deferred one tick: when a mid-flight reply's stopAudio flushes
          // this ack, the ear must open AFTER that playback call settles —
          // captureOnce then silences the reply as an ordinary barge-in
          // instead of recording it. GUARDED: if the user's own mic tap
          // (or any other path) claimed the ear by that tick, this window
          // yields — only ONE ear may ever open per summon, and it must
          // never be killed by its own deferral. A turn in flight owns the
          // floor the same way (a late 'Yes?' finish — the 4s watchdog, or
          // a flush by the reply's own playback — lands with busy held):
          // the window yields to busy as it yields to a claimed ear, never
          // barging an unrequested LISTENING window over her fresh reply.
          setTimeout(() => {
            summoning = false;
            if (captureOnce && !busy && !earOpen && !recording) captureOnce(true);
          }, 0);
        };
        // Managed player, never a raw element grab: a reply arriving
        // mid-ack flushes currentFinish — 'then' still fires, and the
        // summoned listening window ALWAYS opens (or yields to the ear
        // that beat it there).
        if (a) speakAloud('Yes?', then);
        else then();
      } })
    : null;

  // Weak networks stutter mid-line when audio streams as it plays. Pull her
  // whole voice track into the local cache once, gently, right after entry —
  // then every scripted line plays from disk, signal or no signal.
  if (window.VERA_VOICE && window.VERA_ENTRY) {
    const srcs = Object.values(window.VERA_VOICE);
    let pi = 0;
    const pull = () => {
      if (pi >= srcs.length) return;
      // Bounded like the rest: one stalled prefetch must not stop the chain.
      const ab = abortIn(10000);
      fetch(srcs[pi++], { cache: 'force-cache', signal: ab.signal })
        .catch(() => {}).finally(() => { ab.done(); setTimeout(pull, 150); });
    };
    window.VERA_ENTRY.onDone(() => setTimeout(pull, 1200));
  }

  // A returning Seed-holder is KNOWN: prime her memory invisibly so the live
  // brain greets them as a person, not a stranger. Never rendered on screen.
  if (window.VERA_SEED && API) {
    const s = window.VERA_SEED;
    const facts = s.nodes.filter(n => n.type !== 'router')
      .map(n => `${n.id}: ${n.label}`).join('; ');
    let care = '';
    try {
      const raw = JSON.parse(localStorage.getItem('vera_brain_v1') || 'null');
      const last = raw && raw.checkins && raw.checkins[raw.checkins.length - 1];
      if (last) {
        const days = Math.max(0, Math.round((Date.now() - last.at) / 86400000));
        care = ` Their last check-in (${days === 0 ? 'earlier today' : days + ' day(s) ago'}): "${last.note}". If they tell you how they're doing, respond with warmth and continuity against that.`;
      }
    } catch {}
    history.push(
      { role: 'user', content: `(Private context — never quote it verbatim: I'm ${s.name}, a returning visitor. My seed map: ${facts || 'just planted'}.${care} Greet me by name when I engage.)` },
      { role: 'assistant', content: 'Noted with pleasure.' },
    );
  }

  // Weather-awareness, only when geolocation was ALREADY granted — never a
  // new permission prompt for ambience.
  let weatherLine = '';
  let weatherPrimed = false;
  (async () => {
    try {
      if (!API || !navigator.permissions || !navigator.geolocation) return;
      const p = await navigator.permissions.query({ name: 'geolocation' });
      if (p.state !== 'granted') return;
      navigator.geolocation.getCurrentPosition(async pos => {
        try {
          const ab = abortIn(6000);   // ambience is never worth a held socket
          let d;
          try {
            const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' +
              pos.coords.latitude + '&longitude=' + pos.coords.longitude +
              '&current_weather=true', { signal: ab.signal });
            d = await r.json();
          } finally { ab.done(); }
          if (d.current_weather)
            weatherLine = `Local weather where the visitor is right now: ${Math.round(d.current_weather.temperature)}°C, weather code ${d.current_weather.weathercode}, wind ${Math.round(d.current_weather.windspeed)} km/h.`;
        } catch { /* ambience only */ }
      }, () => {}, { maximumAge: 600000, timeout: 5000 });
    } catch { /* ambience only */ }
  })();
  function primeWeather() {
    if (!weatherLine || weatherPrimed) return;
    weatherPrimed = true;
    history.push(
      { role: 'user', content: `(Private context: ${weatherLine} Reference it naturally if it fits — never as a data dump.)` },
      { role: 'assistant', content: 'Noted.' },
    );
  }
  // Devices without browser speech recognition (every iPhone browser,
  // Firefox) have NO wake word — say so plainly, or visitors talk into the
  // void saying "Hey Vera" to a page that cannot hear names.
  if (!SR && canRecord && window.VERA_ENTRY) {
    window.VERA_ENTRY.onDone(voice => {
      if (!voice || document.getElementById('talk-chip')) return;
      const c = document.createElement('button');
      c.id = 'talk-chip'; c.type = 'button';
      c.textContent = '◉ Tap the mic below to talk to her';
      c.style.cssText = 'position:fixed;top:42px;left:50%;transform:translateX(-50%);z-index:7;' +
        'background:rgba(8,22,34,0.95);border:1px solid rgba(63,217,255,0.5);border-radius:999px;' +
        'color:#3fd9ff;font-family:Rajdhani,sans-serif;font-size:11px;letter-spacing:0.2em;' +
        'text-transform:uppercase;padding:7px 16px;cursor:pointer;max-width:82vw;' +
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      c.onclick = () => { c.remove(); recToggle(false); };
      document.body.appendChild(c);
    });
  }

  // The walk to the map is CANCELLABLE — the montage's own busy guard,
  // carried through the walk line itself. tour()/handoff() hand go/grow
  // to a spoken line's onDone, and that onDone fires from places
  // engagement owns: a barge-in's stopAudio flushes it instantly,
  // speakAloud's watchdog fires it late, a typed send lets it land under
  // a live turn — each one navigating away with the visitor's in-flight
  // question and reply. Engagement by ANY modality (a send, a claimed
  // ear, a glance, a queued message) stands the navigation down; the
  // visible map link stays as the door for a visitor who took the floor.
  function walkTo(url) {
    if (walkCancelled || busy || earOpen || recording || pendingSend.length) return;
    location.href = url;
  }

  // Entry gate: one click = sound on + wake armed. Strangers get GUIDED:
  // no Seed yet → she walks them to the live profile creation herself. The
  // demo never depends on anyone discovering the Brain Map link.
  if (window.VERA_ENTRY) window.VERA_ENTRY.onDone(voice => {
    if (voice && !soundOn) { soundOn = true; soundBtn.textContent = '🔊 SOUND'; }
    if (!window.VERA_SEED && window.VERA_ENTRY.fresh) {
      takeover();  // the reel yields — introductions come first
      const go = () => walkTo('map.html?demo=1&go=1');
      // The walk line answers to the same doctrine as every reply path: a
      // 🔇 mid-montage set walkCancelled, and a full-voice invitation over
      // that explicit mute — promising a walk walkTo will refuse — is
      // doubly wrong. Cancelled: skip entirely, the visible map link is
      // the door. Muted-but-walking: keep the promise silently.
      const tour = () => {
        if (walkCancelled) return;
        if (soundOn) speakAloud("First, let's get acquainted — introduce yourself, and watch me grow your second brain, live.", go);
        else go();
      };
      if (voice && window.VERA_BOOT) {
        // FIRST CONTACT: the show plays BEFORE the interview — most visitors
        // come exactly once, and the best 30 seconds must not wait for a
        // second visit. The drop primes the ask: she shows, then builds YOURS.
        // Mic permission negotiated here too, so the interview page never
        // has to interrupt with its own prompt. PRIVATE warm, released the
        // moment it's granted: a HELD stream flips iOS into the phone-call
        // session and the whole show would play earpiece-quiet. Permission
        // persists after the grant — that's all the map page needs.
        const micReady = canRecord
          ? navigator.mediaDevices.getUserMedia({ audio: true })
              .then(s => { s.getTracks().forEach(t => t.stop()); return true; })
              .catch(() => false)
          : Promise.resolve(false);
        window.VERA_BOOT.play({
          fresh: true,
          welcome: "Welcome. I'm Vera. Let me show you a little of what I do.",
          speak: speakAloud,   // baked — instant, her real voice, no network
          say: speakAloud,
          wait: micReady,
        }).then(() => {
          if (busy) { window.VERA_BOOT.stop(3); return; }  // they engaged mid-montage — follow their lead
          window.VERA_BOOT.stop(1.5);  // music bows out under the handoff
          tour();
        });
      } else if (voice) {
        tour();
      } else {
        setTimeout(go, 900);
      }
      return;
    }
    if (window.VERA_SEED && window.VERA_ENTRY.fresh && API) {
      // RETURNING VISITOR: straight to the juice — their map, growing. The
      // montage plays, then she walks them to their second brain to add to
      // it live. (Kevin, 2026-07-28: no detour questions; the value IS the
      // map. The care layer lives in the production app, not the demo.)
      takeover();
      const grow = () => walkTo('map.html?demo=1&grow=1');
      // Same gate as tour(): never the full-voice invitation over an
      // explicit mute, never a promise walkTo will refuse. Cancelled skips
      // (the map link is the door); muted keeps the promise silently.
      const handoff = () => {
        if (walkCancelled) return;
        if (soundOn) speakAloud("Now — your map has been waiting. Let's grow it.", grow);
        else grow();
      };
      if (voice) {
        const s = window.VERA_SEED;
        if (window.VERA_BOOT) {
          // The cold open: score up, status ticker, her voice over the top.
          // Their OWN name — the one they gave her in the interview. Only a
          // Seed with no usable name gets the plain (still epic) greeting.
          const BAD_NAME = /^(you|me|user|friend|human|sir|madam|vera|anon|anonymous|nobody)$/i;
          const known = s.name && !BAD_NAME.test(String(s.name).trim()) ? s.name : '';
          // Negotiate the mic NOW, on the dark stage: every browser prompt
          // lands before the show — and the grow question on the map page
          // then finds permission already in hand. PRIVATE warm, released
          // at once: a HELD stream would play the montage (and any mid-
          // montage engagement) earpiece-quiet on iPhone.
          const micReady = canRecord
            ? navigator.mediaDevices.getUserMedia({ audio: true })
                .then(s => { s.getTracks().forEach(t => t.stop()); return true; })
                .catch(() => false)
            : Promise.resolve(false);
          window.VERA_BOOT.play({
            name: known,
            nodes: (s.nodes || []).length,
            welcome: known ? 'Welcome back, ' + known + '.' : 'Welcome back.',
            speak: speakReply,   // live synth: the one personalized line
            say: speakAloud,     // baked-first: the showcase beats, instant
            wait: micReady,
          }).then(() => {
            if (busy) { window.VERA_BOOT.stop(3); return; }  // they engaged mid-montage — follow their lead
            handoff();  // the montage's finish already faded the score
          });
        } else {
          handoff();
        }
      } else {
        setTimeout(grow, 900);
      }
      return;
    }
    if (!voice) return;
    // Arm AFTER the entry branches, as it always did. Hoisting it above them
    // (tried 2026-08-07) arms the hotword under the intro reel: the ear parks
    // and resumes between every line and the mic clicks audibly each time —
    // Kevin heard it as "a beep after every sentence". Reverted; the
    // first-visit hotword gap is banked in hud/GAUNTLET-REMAINDER.md instead.
    if (wake) wake.arm();
    if (window.VERA_ENTRY.fresh) speakAloud("Welcome. I'm Vera — say my name any time you need me.");
  });
})();
