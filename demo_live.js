/* VERA public demo — live-chat layer.
   Loaded ONLY in the demo build (never in Kevin's personal HUD).
   If window.DEMO_API is set (demo_config.js), visitors talk to the sandboxed
   demo brain; browser SpeechRecognition + speechSynthesis provide free voice.
   Without an API, typing still works — VERA explains he's in rehearsal. */
(function () {
  'use strict';
  if (!new URLSearchParams(location.search).has('demo')) return;

  const API = (window.DEMO_API || '').trim();

  /* ---- input bar ---- */
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
  bar.append(mic, input, sendBtn, soundBtn);
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
      50% { box-shadow: 0 0 22px rgba(63,255,194,0.8); } }`;
  document.head.appendChild(css);

  /* ---- browser voice out (free) ---- */
  let soundOn = false;
  let voices = [];
  const loadVoices = () => { voices = speechSynthesis.getVoices(); };
  loadVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = loadVoices;
  let currentAudio = null;
  let currentFinish = null;  // pending completion of the playing MP3
  let wakeToken = 0;         // invalidates stale wake-resume timers
  function stopAudio() {
    // Preempting a line must still run its completion (wake.resume, onDone…) —
    // a paused <audio> fires neither ended nor error, so flush it by hand.
    const a = currentAudio, f = currentFinish;
    currentAudio = null; currentFinish = null;
    if (a) { a.onended = a.onerror = null; try { a.pause(); } catch {} }
    if (f) f();
  }
  function speakAloud(text, onDone) {
    // She mustn't wake herself: pause the name-listener while a line contains it.
    const risky = wake && /\bvera\b/i.test(text);
    const myToken = risky ? ++wakeToken : 0;
    if (risky) wake.pause();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (currentFinish === finish) { currentAudio = null; currentFinish = null; }
      if (risky) setTimeout(() => { if (myToken === wakeToken) wake.resume(); }, 250);
      if (onDone) onDone();
    };
    // Pre-baked neural MP3 for scripted lines — her real voice.
    const src = (window.VERA_VOICE || {})[text];
    if (src) {
      try {
        stopAudio();
        currentAudio = new Audio(src);
        currentFinish = finish;
        currentAudio.onended = currentAudio.onerror = finish;
        currentAudio.play().catch(() => browserSpeak(text, finish));
        return;
      } catch { /* fall through */ }
    }
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
      // Neural voices only (Edge, Safari, phones). Chrome ships none, and a
      // cold robotic stand-in is worse than text — scripted lines stay MP3 anywhere.
      const en = vs.filter(x => /^en/i.test(x.lang) && !/\bmale\b/i.test(x.name));
      const v = en.find(x => /online|natural|neural/i.test(x.name) && /sonia|libby|maisie|female|aria|jenny|emma|ava|michelle/i.test(x.name))
        || en.find(x => /samantha|karen|moira|tessa|fiona/i.test(x.name))
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
    if (hinted) return;
    hinted = true;
    const h = document.createElement('div');
    h.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:142px;' +
      'z-index:6;font-family:Rajdhani,sans-serif;font-size:11px;letter-spacing:0.18em;' +
      'color:rgba(127,184,204,0.8);background:rgba(8,22,34,0.88);padding:5px 14px;' +
      'border-radius:999px;border:1px solid rgba(63,217,255,0.25)';
    h.textContent = 'TEXT MODE — FOR HER FULL VOICE ON LIVE REPLIES, OPEN IN MICROSOFT EDGE';
    document.body.appendChild(h);
    setTimeout(() => h.remove(), 14000);
  }

  // The scripted reel (page script) speaks through this — respecting the toggle.
  window.VERA_SPEAK = (text, onDone) => {
    if (soundOn) speakAloud(text, onDone);
    else if (onDone) onDone();
  };
  soundBtn.onclick = () => {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? '🔊 SOUND' : '🔇 SOUND';
    if (soundOn) speakAloud('Voice enabled. Lovely to be heard.');
    else { stopAudio(); speechSynthesis.cancel(); }
  };

  /* ---- conversation ---- */
  const history = [];
  let busy = false;
  let tookOver = false;
  function takeover() {
    // A visitor stepped up: stop the attract reel, clear the stage, theirs now.
    if (tookOver) return;
    tookOver = true;
    if (window.VERA_REEL_STOP) window.VERA_REEL_STOP();
    try { speechSynthesis.cancel(); } catch {}
    stopAudio();  // silence the in-flight reel MP3, not just future steps
    if (window.VERA_TRANSCRIPT_RESET) window.VERA_TRANSCRIPT_RESET();
    else { const t = document.getElementById('transcript'); if (t) t.replaceChildren(); }
    const c = document.getElementById('cards');
    if (c) c.replaceChildren();
    setMode('idle');
  }
  async function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    takeover();
    input.value = '';
    addLine('user', text);
    if (!soundOn) { soundOn = true; soundBtn.textContent = '🔊 SOUND'; }  // sending IS the gesture
    if (!API) {
      const line = "The live brain isn't connected on this deployment yet — you're watching the rehearsal. Do try the Brain Map, though: that part is fully live, and I build yours as we talk.";
      setMode('speaking'); addLine('jarvis', line);
      speakAloud(line, () => setMode('idle'));
      return;
    }
    busy = true;
    setMode('thinking');
    history.push({ role: 'user', content: text });
    let reply;
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-12) }),
      });
      const data = await r.json().catch(() => ({}));
      reply = (r.ok && data.reply) ? String(data.reply).slice(0, 600)
        : (data.error === 'rate_limited'
          ? 'You have rather exhausted my public allowance for the moment — do return later, or contact the management for the full experience.'
          : 'A gremlin in the wires. Do try again.');
    } catch {
      reply = 'The uplink hiccuped. Once more, if you please.';
    }
    history.push({ role: 'assistant', content: reply });
    setMode('speaking'); addLine('jarvis', reply);
    speakAloud(reply, () => { setMode('idle'); busy = false; });
  }
  sendBtn.onclick = () => send(input.value);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(input.value); });

  /* ---- browser voice in (free, Chrome/Edge) ---- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let captureOnce = null;
  if (!SR) { mic.style.display = 'none'; }
  else {
    let rec = null;
    const idleHint = input.placeholder;
    const micIdle = () => {
      mic.classList.remove('rec'); mic.textContent = '🎙'; input.placeholder = idleHint;
    };
    captureOnce = () => {
      if (rec) { rec.stop(); return; }
      takeover();
      if (wake) { wakeToken++; wake.pause(); }  // one recognizer at a time; kill stale resumes
      rec = new SR();
      rec.lang = 'en-US'; rec.interimResults = true; rec.maxAlternatives = 1;
      mic.classList.add('rec'); mic.textContent = '◉ LISTENING';
      input.value = '';
      input.placeholder = 'Listening — speak now…';
      setMode('listening'); targetLevel = 0.5;
      rec.onresult = e => {
        let heard = '';
        for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
        input.value = heard.trim();  // their words, appearing as they speak
      };
      rec.onend = () => {
        micIdle(); rec = null;
        const said = input.value.trim();
        input.value = '';
        if (said) send(said);
        else if (!busy) setMode('idle');
        if (wake) wake.resume();
      };
      rec.onerror = () => { micIdle(); rec = null; setMode('idle'); };
      rec.start();
    };
    mic.onclick = captureOnce;
  }

  let lastWake = -1e9;
  const wake = window.VERA_WAKE
    ? window.VERA_WAKE.init({ onWake: (cmd) => {
        const now = performance.now();
        if (now - lastWake < 3000) { if (wake) wake.resume(); return; }  // no "yes yes yes" parroting
        lastWake = now;
        if (!soundOn) { soundOn = true; soundBtn.textContent = '🔊 SOUND'; }
        takeover();
        cmd = (cmd || '').trim();
        if (cmd.split(/\s+/).length >= 2) {
          send(cmd);                       // one breath: "Vera, …" went straight to the brain
          if (wake) wake.resume();
          return;
        }
        const a = (window.VERA_VOICE || {})['Yes?'];
        const then = () => { if (captureOnce) captureOnce(); };
        if (a) { try { const au = new Audio(a); au.onended = then; au.play().catch(then); } catch { then(); } }
        else then();
      } })
    : null;

  // Entry gate: one click on "Enter with voice" = sound on + wake word armed.
  if (window.VERA_ENTRY) window.VERA_ENTRY.onDone(voice => {
    if (!voice) return;
    if (!soundOn) { soundOn = true; soundBtn.textContent = '🔊 SOUND'; }
    if (wake) wake.arm();
    if (window.VERA_ENTRY.fresh) speakAloud("Welcome. I'm Vera — say my name any time you need me.");
  });
})();
