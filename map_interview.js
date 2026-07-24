/* V.E.R.A. — the live brain-building interview (public map page only).
   The visitor answers a two-minute get-to-know-you; their second brain
   assembles in the galaxy as they speak. Entirely tab-local: no server,
   no storage, gone when the tab closes. The mini reactor rides along via
   the page's jstate. */
(function () {
  'use strict';
  if (!new URLSearchParams(location.search).has('demo')) return;
  if (!window.MAP_API) return;

  /* ---- UI ---- */
  const css = document.createElement('style');
  css.textContent = `
    #build-cta { position: fixed; left: 50%; transform: translateX(-50%); bottom: 92px;
      z-index: 6; background: rgba(8,22,34,0.85); border: 1px solid rgba(63,217,255,0.55);
      border-radius: 6px; color: #3fd9ff; font-family: 'Rajdhani', sans-serif;
      font-size: 14px; letter-spacing: 0.28em; text-transform: uppercase;
      padding: 13px 26px; cursor: pointer; backdrop-filter: blur(8px);
      box-shadow: 0 0 30px rgba(63,217,255,0.2); }
    #build-cta:hover { background: rgba(63,217,255,0.12); }
    #vera-q { position: fixed; left: 50%; transform: translateX(-50%); bottom: 148px;
      z-index: 6; width: min(560px, 86vw); text-align: center; color: #eaf6fb;
      font-family: 'Rajdhani', sans-serif; font-size: 17.5px; display: none;
      text-shadow: 0 0 14px rgba(63,217,255,0.35); }
    #map-talk { position: fixed; left: 50%; transform: translateX(-50%); bottom: 92px;
      z-index: 6; display: none; gap: 8px; width: min(560px, 86vw);
      background: rgba(8,22,34,0.85); border: 1px solid rgba(63,217,255,0.4);
      border-radius: 6px; padding: 8px; backdrop-filter: blur(8px); }
    #map-talk input { flex: 1; background: none; border: none; outline: none;
      color: #eaf6fb; font-family: 'Rajdhani', sans-serif; font-size: 15px; }
    #map-talk button { background: none; border: 1px solid rgba(63,217,255,0.45);
      border-radius: 4px; color: #3fd9ff; font-family: inherit; font-size: 12px;
      letter-spacing: 0.2em; padding: 6px 12px; cursor: pointer; }
    #map-talk .rec { border-color: #ff5f6b !important; color: #ff5f6b !important; }`;
  document.head.appendChild(css);

  const cta = document.createElement('button');
  cta.id = 'build-cta'; cta.textContent = '◈ Build my own brain — 2 min';
  const qEl = document.createElement('div'); qEl.id = 'vera-q';
  const bar = document.createElement('div'); bar.id = 'map-talk';
  const mic = document.createElement('button'); mic.textContent = '🎙'; mic.type = 'button';
  const input = document.createElement('input'); input.maxLength = 60;
  input.placeholder = 'Type your answer… or press the mic';
  const go = document.createElement('button'); go.textContent = 'ANSWER'; go.type = 'button';
  bar.append(mic, input, go);
  document.body.append(cta, qEl, bar);

  /* ---- voice ---- */
  let voices = [];
  const loadVoices = () => { voices = speechSynthesis.getVoices(); };
  loadVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = loadVoices;
  let currentAudio = null;
  function say(text, onDone) {
    qEl.textContent = text;
    qEl.style.display = 'block';
    jstate = 'speaking';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      jstate = 'listening';
      if (onDone) onDone();
    };
    // Watchdog: audio/speech can be blocked silently — always advance.
    setTimeout(finish, Math.max(4000, text.length * 80));

    // Scripted lines ship as pre-baked neural MP3s (her REAL voice).
    const src = (window.VERA_VOICE || {})[text];
    if (src) {
      try {
        if (currentAudio) currentAudio.pause();
        currentAudio = new Audio(src);
        currentAudio.onended = currentAudio.onerror = finish;
        currentAudio.play().catch(() => speakBrowser(text, finish));
        return;
      } catch { /* fall through */ }
    }
    speakBrowser(text, finish);
  }
  function speakBrowser(text, finish) {
    try {
      const vs = speechSynthesis.getVoices();  // fresh — never trust the cache
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = vs.find(x => /en-GB/i.test(x.lang) && /sonia|libby|hazel|maisie|female|natural/i.test(x.name))
        || vs.find(x => /en-GB/i.test(x.lang) && /google/i.test(x.name))
        || vs.find(x => /en-GB/i.test(x.lang)) || null;
      if (v) u.voice = v;
      u.rate = 1.04;
      u.onend = u.onerror = finish;
      speechSynthesis.speak(u);
    } catch { finish(); }
  }

  /* ---- the interview ---- */
  const steps = [
    { q: 'First — what shall I call you?', handle(ans, name) {
        window.MAP_API.relabel('you', `${name}'s Brain`);
        return 'A pleasure. Do go on.'; } },
    { q: 'What do you do for work?', handle(ans) {
        window.MAP_API.add('work', ans, 'business', ['you']);
        return 'A noble trade — filed.'; } },
    { q: 'What project is on your mind lately?', handle(ans) {
        window.MAP_API.add('project', ans, 'project', ['you', 'work']);
        return 'On the map, linked to your work.'; } },
    { q: 'Something you’re learning, or curious about?', handle(ans) {
        window.MAP_API.add('idea', ans, 'idea', ['you']);
        return 'Curiosity suits you.'; } },
    { q: 'And how do you recharge?', handle(ans) {
        window.MAP_API.add('recharge', ans, 'note', ['you']);
        return 'Essential maintenance — noted.'; } },
  ];
  let step = -1;
  let name = 'friend';
  let awaiting = false;  // only accept answers once the current question is fully asked

  function nextQuestion() {
    step++;
    if (step >= steps.length) return finale();
    setTimeout(() => say(steps[step].q, () => { awaiting = true; }), 650);
  }

  function finale() {
    bar.style.display = 'none';
    window.MAP_API.focus('you');
    say('And there it is — the seed of your second brain, built as we spoke. It lives only in this tab and vanishes when you leave. The production system grows one of these from every conversation… and never forgets.',
      () => { jstate = 'idle'; });
  }

  function answer(text) {
    text = (text || '').trim();
    if (!text || !awaiting || step < 0 || step >= steps.length) return;
    awaiting = false;
    input.value = '';
    jstate = 'thinking';
    if (step === 0) {
      name = text
        .replace(/^(hi|hello|hey)[,!\s]+/i, '')
        .replace(/^(i am|i'm|im|my name is|it's|its|call me|name's|the name is)\s+/i, '')
        .split(/\s+/)[0].replace(/[^\p{L}\p{N}'-]/gu, '').slice(0, 20) || 'friend';
      name = name.charAt(0).toUpperCase() + name.slice(1);
    }
    const ack = steps[step].handle(text, name);
    say(ack, nextQuestion);
  }

  let started = false;
  function begin() {
    if (started) return;
    started = true;
    if (wake) wake.pause();
    cta.style.display = 'none';
    bar.style.display = 'flex';
    window.MAP_API.begin();
    say('Splendid. Five questions, and I shall build your map as you answer.', nextQuestion);
  }
  cta.onclick = begin;
  const wake = window.VERA_WAKE
    ? window.VERA_WAKE.init({ onWake: () => {
        const a = (window.VERA_VOICE || {})['Yes?'];
        if (a) { try { new Audio(a).play().catch(() => {}); } catch {} }
        setTimeout(begin, 600);
      } })
    : null;
  go.onclick = () => answer(input.value);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') answer(input.value); });

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { mic.style.display = 'none'; }
  else {
    let rec = null;
    mic.onclick = () => {
      if (rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
      mic.classList.add('rec');
      rec.onresult = e => answer(e.results[0][0].transcript);
      rec.onend = () => { mic.classList.remove('rec'); rec = null; };
      rec.onerror = () => { mic.classList.remove('rec'); rec = null; };
      rec.start();
    };
  }
})();
