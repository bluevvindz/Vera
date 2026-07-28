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
  const eye = document.createElement('button');
  eye.id = 'eye-btn'; eye.type = 'button'; eye.textContent = '👁';
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
  let voices = [];
  const loadVoices = () => { voices = speechSynthesis.getVoices(); };
  loadVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = loadVoices;
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
        const el = audioEl();
        el.onended = el.onerror = finish;
        el.src = src;
        currentAudio = el;
        currentFinish = finish;
        el.play().catch(() => browserSpeak(text, finish));
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
      const el = audioEl();
      el.onended = el.onerror = finish;
      el.src = 'data:' + mime + ';base64,' + b64audio;
      currentAudio = el;
      currentFinish = finish;
      el.play().catch(finish);
    } catch { finish(); }
  }
  let speakSeq = 0;  // supersede token: a newer line silences a stale in-flight one
  async function speakReply(text, onDone) {
    const my = ++speakSeq;
    const stale = () => my !== speakSeq;
    if (API) {
      for (let attempt = 0; attempt < 2; attempt++) {  // synth cold-starts flake once
        try {
          const r = await fetch(API + '/speak', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text }),
            // A stalled response must fall through to the fallbacks, not hang.
            signal: AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined,
          });
          const d = await r.json();
          if (stale()) { if (onDone) onDone(); return; }  // superseded mid-flight
          if (r.ok && d.audio) { playB64(d.audio, text, onDone); return; }
        } catch { /* retry, then fall through */ }
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
    soundBtn.textContent = soundOn ? '🔊 SOUND' : '🔇 SOUND';
    if (soundOn) speakAloud('Voice enabled. Lovely to be heard.');
    else { stopAudio(); speechSynthesis.cancel(); }
  };

  /* ---- conversation ---- */
  const history = [];
  let busy = false;
  let pendingSend = null;      // a command that arrived mid-reply waits its turn
  let lastInputVoice = false;  // voice questions earn a hands-free follow-up window
  let tookOver = false;
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
    if (busy) { pendingSend = text; return; }  // queued, not swallowed
    takeover();
    primeWeather();
    recordCheckin(text);
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
        body: JSON.stringify({ messages: sendWindow() }),
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
      else if (lastInputVoice) followUp();  // conversation mode: no wake word between turns
    });
  }
  sendBtn.onclick = () => { lastInputVoice = false; send(input.value); };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { lastInputVoice = false; send(input.value); } });

  // Conversation mode: she just answered a spoken question — open the mic for
  // the follow-up without demanding her name again. Silence ends the exchange
  // and hands control back to the wake word.
  function followUp() {
    if (!API || busy || recording) return;
    if (canRecord && earsServer) recToggle(true);
    else if (captureOnce) captureOnce();
  }

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
          lastInputVoice = true;
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

  let recStream = null, recCtx = null, recSrcNode = null;
  async function ensureEars() {
    // Permission is a ONE-TIME toll: keep the stream and context alive for
    // the whole visit. A fresh getUserMedia per capture makes iOS re-prompt
    // every single time — the "permissions over and over" misery.
    if (recStream && recStream.getTracks().some(t => t.readyState === 'live')) return true;
    try { recStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { recStream = null; return false; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!recCtx) recCtx = new Ctx();
    recSrcNode = recCtx.createMediaStreamSource(recStream);
    return true;
  }

  async function recToggle(auto) {
    if (busy) return;
    if (recording) { recordFinish(); return; }
    const tc = document.getElementById('talk-chip');
    if (tc) tc.remove();
    takeover();
    if (wake) { wakeToken++; wake.pause(); }
    if (!(await ensureEars())) { if (captureOnce) captureOnce(); return; }
    if (recCtx.state === 'suspended') { try { await recCtx.resume(); } catch {} }  // iOS starts suspended
    const node = recCtx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    const rec = { node, chunks, rate: recCtx.sampleRate,
      auto: !!auto, spoke: false, quietMs: 0,
      timer: setTimeout(recordFinish, 12000) };
    node.onaudioprocess = e => {
      const d = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(d));
      if (!rec.auto) return;
      // Follow-up windows self-endpoint: speech then a pause sends; pure
      // silence bows out quietly instead of mailing ambience to the worker.
      let sum = 0;
      for (let i = 0; i < d.length; i += 8) sum += d[i] * d[i];
      const rms = Math.sqrt(sum / (d.length / 8));
      const frameMs = (d.length / rec.rate) * 1000;
      if (rms > 0.015) { rec.spoke = true; rec.quietMs = 0; }
      else rec.quietMs += frameMs;
      // People think mid-sentence: give them a real 3-second breath.
      if ((rec.spoke && rec.quietMs > 3200) || (!rec.spoke && rec.quietMs > 7000)) recordFinish();
    };
    recSrcNode.connect(node); node.connect(recCtx.destination);
    recording = rec;
    mic.classList.add('rec');
    mic.textContent = auto ? '◉ LISTENING' : '◉ TAP WHEN DONE';
    input.value = '';
    input.placeholder = auto ? 'Go on — I’m still listening…'
      : 'Listening — speak, then tap the mic to finish…';
    setMode('listening'); targetLevel = 0.5;
  }

  function recordFinish() {
    if (!recording) return;
    const r = recording;
    recording = null;
    clearTimeout(r.timer);
    try { recSrcNode.disconnect(r.node); } catch {}
    try { r.node.disconnect(); } catch {}
    micIdle();  // stream and context stay warm: no re-prompt, ever
    let total = 0; for (const c of r.chunks) total += c.length;
    if ((r.auto && !r.spoke) || total < r.rate * 0.4) {
      setMode('idle');
      if (wake) wake.resume();  // silence: the exchange is over, her name resumes duty
      return;
    }
    lastInputVoice = true;
    sendVoice(wavFrom(r.chunks, r.rate));
  }

  async function sendVoice(wavBuf) {
    busy = true;
    primeWeather();
    setMode('thinking');
    input.placeholder = 'On the wires…';
    let d = null;
    try {
      const r = await fetch(API + '/voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audio: b64FromBuf(wavBuf), messages: sendWindow() }),
      });
      d = await r.json().catch(() => null);
    } catch { d = null; }
    input.placeholder = idleHint;
    busy = false;
    const resume = () => {
      setMode('idle');
      if (lastInputVoice) followUp();     // keep the conversation going hands-free
      else if (wake) wake.resume();
    };
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
    if (d.heard) { recordCheckin(d.heard); addLine('user', d.heard); history.push({ role: 'user', content: d.heard }); }
    history.push({ role: 'assistant', content: d.reply });
    setMode('speaking');
    addLine('jarvis', d.reply);
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

  async function grabFrame() {
    let stream;
    try {
      stream = canScreen
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

  async function glance() {
    if (busy || !API) return;
    takeover();
    if (wake) { wakeToken++; wake.pause(); }
    const frame = await grabFrame();
    if (!frame) { if (wake) wake.resume(); return; }
    busy = true;
    setMode('thinking');
    addLine('user', canScreen ? '👁 (showed her the screen)' : '👁 (showed her the camera)');
    let d = null;
    try {
      const r = await fetch(API + '/see', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: frame, messages: sendWindow() }),
      });
      d = await r.json().catch(() => null);
    } catch { d = null; }
    busy = false;
    const resume = () => { setMode('idle'); if (wake) wake.resume(); };
    if (!d || !d.reply) {
      const line = d && d.error === 'rate_limited'
        ? 'My eyes have had rather a full day — do show me again tomorrow.'
        : 'I couldn’t quite make that out. Once more, if you please.';
      addLine('jarvis', line);
      if (soundOn) speakReply(line, resume); else resume();
      return;
    }
    history.push(
      { role: 'user', content: '(I just showed you one image of my ' + (canScreen ? 'screen' : 'surroundings') + ')' },
      { role: 'assistant', content: d.reply },
    );
    setMode('speaking');
    addLine('jarvis', d.reply);
    if (d.audio && soundOn) playB64(d.audio, d.reply, resume);
    else if (soundOn) speakReply(d.reply, resume);
    else resume();
  }
  eye.onclick = glance;

  let earsServer = false;
  if (SR) mic.onclick = captureOnce;
  else if (canRecord) { earsServer = true; mic.onclick = () => recToggle(false); }
  else mic.style.display = 'none';
  if (canRecord) (async () => {
    // Upgrade to server ears once the worker confirms it has them.
    try {
      const h = await (await fetch(API + '/health')).json();
      if (h && h.ok && h.stt) { earsServer = true; mic.onclick = () => recToggle(false); }
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
          lastInputVoice = true;
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
        if (a) {
          try {
            const el = audioEl();
            el.onended = el.onerror = then;
            el.src = a;
            el.play().catch(then);
          } catch { then(); }
        }
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
  let checkinPending = false;
  let checkinAskedAt = 0;
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
          const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' +
            pos.coords.latitude + '&longitude=' + pos.coords.longitude + '&current_weather=true');
          const d = await r.json();
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
  function recordCheckin(text) {
    if (!checkinPending) return;
    checkinPending = false;
    // Only a prompt answer is a check-in: minutes later it's just chat, and
    // storing "what's the weather" as their wellbeing note poisons the Seed.
    if (Date.now() - checkinAskedAt > 120000) return;
    try {
      const s = JSON.parse(localStorage.getItem('vera_brain_v1') || 'null');
      if (!s) return;
      (s.checkins = s.checkins || []).push({ at: Date.now(), note: String(text).slice(0, 140) });
      s.checkins = s.checkins.slice(-5);
      s.v = 1;
      localStorage.setItem('vera_brain_v1', JSON.stringify(s));
    } catch { /* device-local best effort */ }
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

  // Entry gate: one click = sound on + wake armed. Strangers get GUIDED:
  // no Seed yet → she walks them to the live profile creation herself. The
  // demo never depends on anyone discovering the Brain Map link.
  if (window.VERA_ENTRY) window.VERA_ENTRY.onDone(voice => {
    if (voice && !soundOn) { soundOn = true; soundBtn.textContent = '🔊 SOUND'; }
    if (!window.VERA_SEED && window.VERA_ENTRY.fresh) {
      takeover();  // the reel yields — introductions come first
      const go = () => { location.href = 'map.html?demo=1&go=1'; };
      const tour = () => speakAloud("First, let's get acquainted — introduce yourself, and watch me grow your second brain, live.", go);
      if (voice && window.VERA_BOOT) {
        // FIRST CONTACT: the show plays BEFORE the interview — most visitors
        // come exactly once, and the best 30 seconds must not wait for a
        // second visit. The drop primes the ask: she shows, then builds YOURS.
        // Mic permission negotiated here too, so the interview page never
        // has to interrupt with its own prompt.
        const micReady = canRecord ? ensureEars() : Promise.resolve(false);
        window.VERA_BOOT.play({
          fresh: true,
          welcome: "Welcome. I'm Vera. Let me show you a little of what I do.",
          speak: speakAloud,   // baked — instant, her real voice, no network
          say: speakAloud,
          wait: micReady,
        }).then(() => {
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
      // The Daily Check-In: a returning friend gets asked how they ARE.
      // checkinPending arms only at the moment she ASKS — anything they say
      // before that (mid-montage) is chat, never a wellbeing note.
      takeover();
      // The brain must know she asked, or its reply to the answer is blind.
      history.push({ role: 'assistant', content: 'Welcome back. Before anything else — how are you, really?' });
      const openEars = () => {
        if (recording) return;  // already listening — a toggle would close it
        if (canRecord && earsServer) recToggle(true);
        else if (captureOnce) captureOnce();
        else input.focus();
      };
      const askCheckin = () => {
        checkinPending = true;
        checkinAskedAt = Date.now();
      };
      if (voice) {
        const s = window.VERA_SEED;
        if (window.VERA_BOOT) {
          // The cold open: score up, status ticker, her voice over the top.
          // Their OWN name — the one they gave her in the interview. Only a
          // Seed with no usable name gets the plain (still epic) greeting.
          // Pronouns and placeholders are not names — "Welcome back, You."
          // sounds broken; those Seeds get the plain greeting instead.
          const BAD_NAME = /^(you|me|user|friend|human|sir|madam|vera|anon|anonymous|nobody)$/i;
          const known = s.name && !BAD_NAME.test(String(s.name).trim()) ? s.name : '';
          // Negotiate the mic NOW, on the dark stage: every browser prompt
          // ("allow microphone?", the OS ask, the granted banner) lands before
          // the show begins — never over it. The montage holds until settled,
          // and the later openEars() finds permission already in hand.
          const micReady = canRecord ? ensureEars() : Promise.resolve(false);
          window.VERA_BOOT.play({
            name: known,
            nodes: (s.nodes || []).length,
            // Short greeting up front; "Are you ready to save the world?" is
            // the montage's own drop line now — the show earns it first.
            welcome: known ? 'Welcome back, ' + known + '.' : 'Welcome back.',
            speak: speakReply,   // live synth: the one personalized line
            say: speakAloud,     // baked-first: the showcase beats, instant
            wait: micReady,
          }).then(() => {
            if (busy) { window.VERA_BOOT.stop(3); return; }  // they engaged mid-montage — follow their lead
            if (wake) wake.arm();
            askCheckin();
            window.VERA_BOOT.duck();
            const q = 'Before anything else — how are you, really?';
            addLine('jarvis', q);  // the question must exist SOMEWHERE even if every voice fails
            let asked = false;
            const askDone = () => {
              if (asked) return;
              asked = true;
              // Quick fade: phone speakers bleed into the mic, and their
              // answer must reach Whisper clean, not over a music bed.
              window.VERA_BOOT.stop(1.2);
              openEars();
            };
            setTimeout(askDone, 12000);  // a hung synth must never strand the ears
            speakReply(q, askDone);
          });
        } else {
          if (wake) wake.arm();
          askCheckin();
          speakAloud('Welcome back. Before anything else — how are you, really?', openEars);
        }
      } else {
        askCheckin();
        addLine('jarvis', 'Welcome back. Before anything else — how are you, really?');
        input.focus();
      }
      return;
    }
    if (!voice) return;
    if (wake) wake.arm();
    if (window.VERA_ENTRY.fresh) speakAloud("Welcome. I'm Vera — say my name any time you need me.");
  });
})();
