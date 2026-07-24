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
      50% { box-shadow: 0 0 22px rgba(63,255,194,0.8); } }
    @media (max-width: 640px) {
      #demo-talk { bottom: 10px; width: calc(100vw - 20px); backdrop-filter: none;
        background: rgba(6, 16, 26, 0.96); }
      #demo-talk button { padding: 6px 9px; letter-spacing: 0.1em; } }`;
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
    const risky = wake && NAME_RE.test(text);
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
      // Neural voices only (Edge, Safari, Android's default). Desktop Chrome
      // ships none, and a cold robotic stand-in is worse than text — scripted
      // lines stay MP3 regardless.
      const android = /android/i.test(navigator.userAgent);
      const en = vs.filter(x => /^en/i.test(x.lang) && !/\bmale\b/i.test(x.name));
      const v = en.find(x => /online|natural|neural/i.test(x.name) && /sonia|libby|maisie|female|aria|jenny|emma|ava|michelle/i.test(x.name))
        || en.find(x => /samantha|karen|moira|tessa|fiona/i.test(x.name))
        || (android ? (en.find(x => x.default) || en[0] || null) : null);
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
    try {
      stopAudio();
      // The worker's engines return WAV (RIFF → 'UklGR') or MP3 — sniff it.
      const mime = b64audio.startsWith('UklGR') ? 'audio/wav' : 'audio/mpeg';
      currentAudio = new Audio('data:' + mime + ';base64,' + b64audio);
      currentFinish = finish;
      currentAudio.onended = currentAudio.onerror = finish;
      currentAudio.play().catch(finish);
    } catch { finish(); }
  }
  async function speakReply(text, onDone) {
    if (API) {
      for (let attempt = 0; attempt < 2; attempt++) {  // synth cold-starts flake once
        try {
          const r = await fetch(API + '/speak', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text }),
          });
          const d = await r.json();
          if (r.ok && d.audio) { playB64(d.audio, text, onDone); return; }
        } catch { /* retry, then fall through */ }
        await new Promise(res => setTimeout(res, 350));
      }
    }
    speakAloud(text, onDone);
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
  let pendingSend = null;  // a command that arrived mid-reply waits its turn
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
    if (!text) return;
    if (busy) { pendingSend = text; return; }  // queued, not swallowed
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
    speakReply(reply, () => {
      setMode('idle'); busy = false;
      const queued = pendingSend; pendingSend = null;
      if (queued) send(queued);
    });
  }
  sendBtn.onclick = () => send(input.value);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(input.value); });

  /* ---- voice in ---- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const idleHint = input.placeholder;
  const micIdle = () => {
    mic.classList.remove('rec'); mic.textContent = '🎙'; input.placeholder = idleHint;
  };
  let captureOnce = null;
  if (SR) {
    let rec = null;
    let cancelled = false;
    captureOnce = () => {
      if (rec) {  // second tap = cancel, and their typed draft survives
        cancelled = true;
        try { rec.abort(); } catch { try { rec.stop(); } catch {} }
        return;
      }
      takeover();
      if (wake) { wakeToken++; wake.pause(); }  // one recognizer at a time; kill stale resumes
      cancelled = false;
      const draft = input.value;
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
        if (cancelled || !said) {
          input.value = draft;
          if (!busy) setMode('idle');
        } else {
          input.value = '';
          send(said);
        }
        if (wake) wake.resume();
      };
      rec.onerror = () => { micIdle(); };  // onend always follows and settles state
      rec.start();
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

  async function recToggle() {
    if (busy) return;
    if (recording) { recordFinish(); return; }
    takeover();
    if (wake) { wakeToken++; wake.pause(); }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { if (captureOnce) captureOnce(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch {} }  // iOS Safari starts suspended
    const src = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    node.onaudioprocess = e => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    src.connect(node); node.connect(ctx.destination);
    recording = { stream, ctx, node, chunks, rate: ctx.sampleRate,
      timer: setTimeout(recordFinish, 12000) };
    mic.classList.add('rec'); mic.textContent = '◉ TAP WHEN DONE';
    input.value = '';
    input.placeholder = 'Listening — speak, then tap the mic to finish…';
    setMode('listening'); targetLevel = 0.5;
  }

  function recordFinish() {
    if (!recording) return;
    const r = recording;
    recording = null;
    clearTimeout(r.timer);
    try { r.node.disconnect(); } catch {}
    try { r.ctx.close(); } catch {}
    r.stream.getTracks().forEach(t => { try { t.stop(); } catch {} });
    micIdle();
    let total = 0; for (const c of r.chunks) total += c.length;
    if (total < r.rate * 0.4) { setMode('idle'); if (wake) wake.resume(); return; }
    sendVoice(wavFrom(r.chunks, r.rate));
  }

  async function sendVoice(wavBuf) {
    busy = true;
    setMode('thinking');
    input.placeholder = 'On the wires…';
    let d = null;
    try {
      const r = await fetch(API + '/voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audio: b64FromBuf(wavBuf), messages: history.slice(-12) }),
      });
      d = await r.json().catch(() => null);
    } catch { d = null; }
    input.placeholder = idleHint;
    busy = false;
    const resume = () => { setMode('idle'); if (wake) wake.resume(); };
    if (d && d.error === 'silence') {
      addLine('jarvis', 'I didn’t catch that — do try again, a touch closer to the microphone.');
      resume(); return;
    }
    if (d && d.error === 'rate_limited') {
      const line = 'You have rather exhausted my public allowance for the moment — do return later, or contact the management for the full experience.';
      addLine('jarvis', line); speakAloud(line, resume); return;
    }
    if (!d || !d.reply) {
      const line = 'The uplink hiccuped. Once more, if you please.';
      addLine('jarvis', line); speakAloud(line, resume); return;
    }
    if (d.heard) { addLine('user', d.heard); history.push({ role: 'user', content: d.heard }); }
    history.push({ role: 'assistant', content: d.reply });
    setMode('speaking');
    addLine('jarvis', d.reply);
    if (d.audio && soundOn) playB64(d.audio, d.reply, resume);
    else if (soundOn) speakReply(d.reply, resume);  // server synth flaked — one more try
    else resume();
  }

  if (SR) mic.onclick = captureOnce;
  else if (canRecord) mic.onclick = recToggle;
  else mic.style.display = 'none';
  if (canRecord) (async () => {
    // Upgrade to server ears once the worker confirms it has them.
    try {
      const h = await (await fetch(API + '/health')).json();
      if (h && h.ok && h.stt) mic.onclick = recToggle;
    } catch { /* old worker: browser SR stays */ }
  })();

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
        let acked = false;
        const then = () => {
          if (acked) return;
          acked = true;
          if (captureOnce) captureOnce();
          else if (canRecord) recToggle();
        };
        if (a) { try { const au = new Audio(a); au.onended = au.onerror = then; au.play().catch(then); } catch { then(); } }
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
      fetch(srcs[pi++], { cache: 'force-cache' }).catch(() => {}).finally(() => setTimeout(pull, 150));
    };
    window.VERA_ENTRY.onDone(() => setTimeout(pull, 1200));
  }

  // A returning Seed-holder is KNOWN: prime her memory invisibly so the live
  // brain greets them as a person, not a stranger. Never rendered on screen.
  if (window.VERA_SEED && API) {
    const s = window.VERA_SEED;
    const facts = s.nodes.filter(n => n.type !== 'router')
      .map(n => `${n.id}: ${n.label}`).join('; ');
    history.push(
      { role: 'user', content: `(Private context — never quote it verbatim: I'm ${s.name}, a returning visitor. My seed map: ${facts || 'just planted'}. Greet me by name when I engage.)` },
      { role: 'assistant', content: 'Noted with pleasure.' },
    );
  }

  // Entry gate: one click on "Enter with voice" = sound on + wake word armed.
  if (window.VERA_ENTRY) window.VERA_ENTRY.onDone(voice => {
    if (!voice) return;
    if (!soundOn) { soundOn = true; soundBtn.textContent = '🔊 SOUND'; }
    if (wake) wake.arm();
    if (window.VERA_ENTRY.fresh) speakAloud("Welcome. I'm Vera — say my name any time you need me.");
  });
})();
