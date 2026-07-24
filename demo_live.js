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
  bar.append(mic, input, sendBtn);
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
    #demo-talk .rec { border-color: #ff5f6b !important; color: #ff5f6b !important; }`;
  document.head.appendChild(css);

  /* ---- browser voice out (free) ---- */
  let voices = [];
  const loadVoices = () => { voices = speechSynthesis.getVoices(); };
  loadVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = loadVoices;
  function speakAloud(text, onDone) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = voices.find(v => /en-GB/i.test(v.lang) && /sonia|libby|hazel|maisie|female/i.test(v.name))
        || voices.find(v => /en-GB/i.test(v.lang)) || null;
      if (v) u.voice = v;
      u.rate = 1.04; u.pitch = 1.0;
      u.onend = u.onerror = () => onDone && onDone();
      speechSynthesis.speak(u);
    } catch { onDone && onDone(); }
  }

  /* ---- conversation ---- */
  const history = [];
  let busy = false;
  async function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    input.value = '';
    addLine('user', text);
    if (!API) {
      const line = "The live brain isn't connected on this deployment, sir — you're watching the rehearsal. The production system answers this himself.";
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
          : 'A gremlin in the wires, sir. Do try again.');
    } catch {
      reply = 'The uplink hiccuped, sir. Once more, if you please.';
    }
    history.push({ role: 'assistant', content: reply });
    setMode('speaking'); addLine('jarvis', reply);
    speakAloud(reply, () => { setMode('idle'); busy = false; });
    busy = false;
  }
  sendBtn.onclick = () => send(input.value);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(input.value); });

  /* ---- browser voice in (free, Chrome/Edge) ---- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { mic.style.display = 'none'; }
  else {
    let rec = null;
    mic.onclick = () => {
      if (rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
      mic.classList.add('rec'); setMode('listening'); targetLevel = 0.5;
      rec.onresult = e => send(e.results[0][0].transcript);
      rec.onend = () => { mic.classList.remove('rec'); rec = null; if (!busy) setMode('idle'); };
      rec.onerror = () => { mic.classList.remove('rec'); rec = null; setMode('idle'); };
      rec.start();
    };
  }
})();
