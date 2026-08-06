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
    #map-talk .rec { border-color: #3fffc2 !important; color: #3fffc2 !important;
      animation: mic-live 1.1s ease-in-out infinite; }
    @keyframes mic-live { 0%, 100% { box-shadow: 0 0 6px rgba(63,255,194,0.35); }
      50% { box-shadow: 0 0 22px rgba(63,255,194,0.8); } }
    #build-cta.urge { font-size: 17px; padding: 16px 32px;
      border-color: rgba(63, 217, 255, 0.9);
      animation: cta-pulse 1.8s ease-in-out infinite; }
    @keyframes cta-pulse { 0%, 100% { box-shadow: 0 0 18px rgba(63, 217, 255, 0.25); }
      50% { box-shadow: 0 0 44px rgba(63, 217, 255, 0.7); } }
    #show-link { position: fixed; left: 50%; transform: translateX(-50%); bottom: 92px;
      z-index: 6; background: rgba(8, 22, 34, 0.92); border: 1px solid rgba(63, 217, 255, 0.75);
      border-radius: 6px; color: #3fd9ff; font-family: 'Rajdhani', sans-serif;
      font-size: 15px; letter-spacing: 0.26em; text-transform: uppercase;
      padding: 14px 28px; text-decoration: none;
      animation: cta-pulse 1.8s ease-in-out infinite; }`;
  document.head.appendChild(css);

  const cta = document.createElement('button');
  cta.id = 'build-cta'; cta.textContent = '◈ Map your second brain — 2 min';
  const qEl = document.createElement('div'); qEl.id = 'vera-q';
  const bar = document.createElement('div'); bar.id = 'map-talk';
  const mic = document.createElement('button'); mic.textContent = '🎙'; mic.type = 'button';
  const input = document.createElement('input'); input.maxLength = 60;
  input.placeholder = 'Type your answer… or press the mic';
  const go = document.createElement('button'); go.textContent = 'ANSWER'; go.type = 'button';
  bar.append(mic, input, go);
  document.body.append(cta, qEl, bar);

  /* ---- voice ---- */
  // Kick the async voice-list load early; speakBrowser hooks onvoiceschanged
  // itself whenever the list hasn't landed yet.
  try { speechSynthesis.getVoices(); } catch {}
  let currentAudio = null;
  let soundOn = true;   // 'enter muted' at the gate is honored here too
  let voiceMode = false;  // set once they enter with voice or touch the mic
  const guided = new URLSearchParams(location.search).has('go');    // she walked them here
  const growing = new URLSearchParams(location.search).has('grow'); // returning: one question, map grows
  let growSession = false;
  let sayGen = 0;      // bumps on every say() and on interrupts — stale finishes die
  let sayTimer = 0;
  function say(text, onDone) {
    sayGen++; clearTimeout(sayTimer);
    const gen = sayGen;
    qEl.textContent = text;
    qEl.style.display = 'block';
    jstate = 'speaking';
    let done = false;
    const finish = () => {
      if (done || gen !== sayGen) return;
      done = true;
      jstate = 'listening';
      if (onDone) onDone();
    };
    if (!soundOn) { sayTimer = setTimeout(finish, 900 + text.length * 35); return; }  // text-only pace
    // Watchdog: audio/speech can be blocked silently — always advance.
    sayTimer = setTimeout(finish, Math.max(4000, text.length * 80));

    // Scripted lines ship as pre-baked neural MP3s (her REAL voice), played
    // through ONE shared element — iOS WebKit only trusts a tap-blessed one.
    const src = (window.VERA_VOICE || {})[text];
    if (src) {
      try {
        if (currentAudio) currentAudio.pause();
        if (!window.VERA_AUDIO_EL) {
          window.VERA_AUDIO_EL = new Audio();
          window.VERA_AUDIO_EL.playsInline = true;
          window.VERA_AUDIO_EL.setAttribute('playsinline', '');
          if (wake && wake.duckAttach) wake.duckAttach();  // guard on from the first play
        }
        const el = window.VERA_AUDIO_EL;
        el.onended = el.onerror = finish;
        el.src = src;
        currentAudio = el;
        el.play().catch(() => speakBrowser(text, finish));
        return;
      } catch { /* fall through */ }
    }
    speakBrowser(text, finish);
  }
  function speakBrowser(text, finish) {
    if (!speechSynthesis.getVoices().length) {  // list loads async — wait for it
      let fired = false;
      const go = () => { if (!fired) { fired = true; speakBrowserNow(text, finish); } };
      speechSynthesis.onvoiceschanged = go;
      setTimeout(go, 800);
      return;
    }
    speakBrowserNow(text, finish);
  }
  function speakBrowserNow(text, finish) {
    try {
      const vs = speechSynthesis.getVoices();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      // Only a voice matching her recordings may speak — strangers read as
      // glitches. Everything scripted is MP3 anyway; this is a rare fallback.
      const en = vs.filter(x => /^en/i.test(x.lang) && !/\bmale\b/i.test(x.name));
      const v = en.find(x => /online|natural|neural/i.test(x.name) && /sonia|libby|maisie|female|aria|jenny|emma|ava|michelle/i.test(x.name))
        || null;
      if (!v) { finish(); return; }
      u.voice = v;
      u.rate = 1.04;
      u.onend = u.onerror = finish;
      speechSynthesis.speak(u);
    } catch { finish(); }
  }
  function bargeIn() {
    // An answer — or a deliberate mic engagement — mid-line means "let me
    // speak": she yields the floor, and her interrupted line can't finish
    // late (sayGen) or fire a stale watchdog (sayTimer). Without this, an
    // eager tap opens an ear UNDER her live MP3: iPhone records her own
    // question through the speaker; Android ducks her mid-word.
    if (currentAudio) { try { currentAudio.pause(); } catch {} }
    try { speechSynthesis.cancel(); } catch {}
    sayGen++; clearTimeout(sayTimer);
  }

  /* ---- phones: the map and the conversation ARE the page — the analysis
     panels (Top Hubs, Filter) are desktop chrome and read as clutter. */
  const declutter = document.createElement('style');
  declutter.textContent = '@media (max-width: 640px){ #hubs, #filters { display: none; } }';
  document.head.appendChild(declutter);

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
    { q: 'Now — something fun about you. A favorite memory, a hidden talent, anything.', handle(ans) {
        freestyle(ans);  // her intelligence, visible: stars bloom as she threads it
        return 'In it goes — give me one breath to thread it.'; } },
    { q: 'And how do you recharge?', handle(ans) {
        window.MAP_API.add('recharge', ans, 'note', ['you']);
        return 'Essential maintenance — noted.'; } },
    { q: 'Last one — how are you actually doing today?', handle(ans) {
        checkins.push({ at: Date.now(), note: ans.slice(0, 140) });
        return 'Noted — and thank you for telling me the truth.'; } },
  ];
  const checkins = [];  // the daily check-in: care as the product
  let step = -1;
  let name = 'friend';
  let awaiting = false;  // only accept answers once the current question is fully asked
  let micBusy = false;   // ANY live ear — SR or recorder — nudges/autolisten must never talk over or cancel it
  let ansGen = 0;        // answer generation: a stale /hear continuation must never land as an answer

  /* ---- persistence: their map, their device, nothing anywhere else ---- */
  const KEY = 'vera_brain_v1';
  function saveBrain() {
    try {
      let prior = [];
      try { prior = (JSON.parse(localStorage.getItem(KEY) || 'null') || {}).checkins || []; } catch {}
      localStorage.setItem(KEY, JSON.stringify({
        v: 1,
        name,
        nodes: nodes.map(n => ({ id: n.id, label: n.label, type: n.type })),
        edges: edges.map(e => [e.a.id, e.b.id]),
        checkins: prior.concat(checkins).slice(-5),
      }));
      checkins.length = 0;  // persisted — a later save must not re-concat them
    } catch { /* private mode etc. — gracefully tab-only */ }
  }
  function loadSaved() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!(s && Array.isArray(s.nodes) && s.nodes.length)) return null;
      if (!Array.isArray(s.edges)) s.edges = [];  // tolerate truncated/old saves
      return s;
    } catch { return null; }
  }
  function restore(saved) {
    started = true;
    window.MAP_API.begin();
    name = saved.name || 'friend';
    const router = saved.nodes.find(n => n.type === 'router');
    if (router) window.MAP_API.relabel('you', router.label);
    for (const n of saved.nodes) {
      if (n.type === 'router') continue;
      const links = saved.edges
        .filter(([a, b]) => a === n.id || b === n.id)
        .map(([a, b]) => (a === n.id ? b : a))
        .filter(id => id === 'you' || nodes.some(x => x.id === id));
      window.MAP_API.add(n.id, n.label, n.type, links.length ? links : ['you']);
    }
    window.MAP_API.focus('you');
  }

  /* ---- freestyle: one open answer, threaded into stars by the live brain.
     Fire-and-forget — the interview keeps moving while she parses; the new
     stars bloom mid-conversation. Any failure quietly falls back to storing
     the whole answer as a single node, exactly like the fixed questions. */
  function freestyle(ans) {
    // Unique ids per session: a grow visit must never collide with the fun
    // stars already saved from the first interview. Stars persist THEMSELVES
    // the moment they land — in grow mode no later answer re-saves the map,
    // and an async star that misses the save would vanish on reload.
    const sid = 'fun' + (Date.now() % 1e7) + '_';
    const fallback = () => { window.MAP_API.add(sid + 0, ans.slice(0, 40), 'idea', ['you']); saveBrain(); };
    if (!API) { fallback(); return; }
    fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'extract',
        messages: [{ role: 'user', content: ans.slice(0, 500) }] }),
    }).then(r => r.json()).then(d => {
      let items = [];
      try {  // trim any prose the model wrapped around the array
        items = JSON.parse(String(d.reply || '').replace(/^[^\[]*/, '').replace(/[^\]]*$/, ''));
      } catch { /* fall through */ }
      items = (Array.isArray(items) ? items : [])
        .filter(x => x && x.label).slice(0, 3);
      if (!items.length) { fallback(); return; }
      const TYPES = ['business', 'project', 'idea', 'note', 'person', 'place'];
      items.forEach((x, i) => setTimeout(() => {
        window.MAP_API.add(
          sid + i,
          String(x.label).slice(0, 26),
          TYPES.indexOf(x.type) >= 0 ? x.type : 'idea',
          ['you']
        );
        saveBrain();  // each star lands persisted, whatever happens next
      }, 400 + i * 700));  // staggered births — the delight beat
    }).catch(fallback);
  }

  /* ---- hand-holds: one soft example per question if the visitor stalls.
     Spoken once each, never repeated — hand-holding, not nagging. */
  const NUDGES = [
    'Just a first name will do — whatever you’d like me to call you.',
    'Anything counts — job, study, or whatever fills your days.',
    'Big or small — the thing you keep coming back to.',
    'Anything at all — a memory, a talent, the strangest thing you love.',
    'Games, walks, music, naps — whatever brings you back to life.',
    'Truly — however today actually feels.',
  ];
  let nudgeTimer = null;
  let nudged = -1;
  function armNudge() {
    clearTimeout(nudgeTimer);
    if (step === nudged || step < 0 || step >= steps.length) return;
    nudgeTimer = setTimeout(() => {
      if (!awaiting || step === nudged) return;
      if (micBusy || recording) { armNudge(); return; }  // a live ear — never talk over it
      if (input.value.trim()) return;   // they're mid-thought — stay quiet
      nudged = step;
      const nline = (steps[step] && steps[step].nudge) || NUDGES[step];
      say(nline, () => { if (voiceMode) autoListen(); });
    }, 12000);
  }

  function nextQuestion() {
    step++;
    if (step >= steps.length) return finale();
    // Accept answers from the moment the question STARTS — people talk over
    // her, and discarding their words reads as "she can't hear me".
    setTimeout(() => {
      awaiting = true;
      say(steps[step].q, () => { if (voiceMode) autoListen(); armNudge(); });
    }, 650);
  }

  function finale() {
    if (growSession) {
      // Grow close: short, warm, done — the star birth was the show.
      bar.style.display = 'none';
      window.MAP_API.focus('you');
      saveBrain();
      say('Threaded in. Your map remembers — and so do I.', () => {
        jstate = 'idle'; if (wake) wake.resume();
        if (!document.getElementById('show-link')) {
          const s = document.createElement('a');
          s.id = 'show-link';
          s.href = 'reactor.html?demo=1';
          s.textContent = '◈ Back to her';
          document.body.appendChild(s);
        }
        joinBox();
      });
      return;
    }
    bar.style.display = 'none';
    window.MAP_API.focus('you');
    saveBrain();
    say('And there it is — your second brain, mapped as we spoke. It lives in this browser — and only this browser — and it will remember you when you return. The production system grows one of these from every conversation… and never forgets.',
      () => { jstate = 'idle'; if (wake) wake.resume();
        window.VERA_INSTALL && window.VERA_INSTALL.offer();  // Seed planted = the moment to keep her
        const s = document.createElement('a');            // …and the show is next, one tap away
        s.id = 'show-link';
        s.href = 'reactor.html?demo=1';
        s.textContent = '◈ Now — the show';
        document.body.appendChild(s);
        joinBox();  // the peak of delight is when you ask
      });
    // The Seed's birth gives their interface its own color — from here on,
    // this visitor's V.E.R.A. is subtly, permanently theirs.
    try {
      const sig = name + '|' + nodes.map(n => n.label).join('|');
      const hue = [...sig].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
      if (hue > 8 && hue < 352) document.documentElement.style.filter = `hue-rotate(${hue}deg)`;
    } catch {}
  }

  function answer(text) {
    text = (text || '').trim();
    if (!text || !awaiting || step < 0 || step >= steps.length) return;
    awaiting = false;
    clearTimeout(nudgeTimer);
    // One rule: an answer by ANY modality retires every open ear first — a
    // stale capture left running would hear her ack (ducked on Android, a
    // held-stream session on iPhone) and record it as the NEXT answer.
    if (abortSR) abortSR();
    hearDiscard();
    ansGen++;         // an in-flight /hear round trip is retired too — its transcript must not land
    micBusy = false;  // …and the hold it kept on the ear claim goes with it
    input.value = '';
    bargeIn();  // they answered — she yields
    jstate = 'thinking';
    if (step === 0 && !growSession) {  // grow answers are content, never a name
      name = text
        .replace(/^(hi|hello|hey)[,!\s]+/i, '')
        .replace(/^(you (can|may) call me|just call me|please call me|everyone calls me|they call me|people call me|i am|i'm|im|my name is|it's|its|call me|name's|the name is)\s+/i, '')
        .split(/\s+/)[0].replace(/[^\p{L}\p{N}'-]/gu, '').slice(0, 20) || 'friend';
      // A pronoun that survived the stripping is not a name.
      if (/^(you|me|user|human|sir|madam|vera|anon|anonymous|nobody)$/i.test(name)) name = 'friend';
      name = name.charAt(0).toUpperCase() + name.slice(1);
    }
    const ack = steps[step].handle(text, name);
    saveBrain();
    say(ack, nextQuestion);
  }

  let started = false;
  function begin() {
    if (started) return;
    started = true;
    // The CTA tap is a gesture: bless the shared audio element here too, for
    // visitors who arrived with a prior session and never clicked the gate.
    try {
      if (!window.VERA_AUDIO_EL) {
        const el = new Audio();
        el.playsInline = true;
        el.setAttribute('playsinline', '');
        el.volume = 0;
        el.muted = true;  // iOS ignores element.volume — muted it honors
        el.src = 'voice/wake.mp3';
        el.play().then(() => { el.pause(); el.muted = false; el.volume = 1; el.currentTime = 0; })
          .catch(() => { el.muted = false; el.volume = 1; });
        window.VERA_AUDIO_EL = el;
        if (wake && wake.duckAttach) wake.duckAttach();  // guard on from the first play
      }
    } catch {}
    if (wake) wake.pause();
    cta.style.display = 'none';
    bar.style.display = 'flex';
    window.MAP_API.begin();
    say('Splendid. Five questions, and I shall build your map as you answer.', nextQuestion);
  }
  /* Grow session: ONE open question for a returning visitor, threaded into
     their existing constellation by the live brain. The juice, 30 seconds. */
  function growAsk() {
    if (growSession) return;
    growSession = true;
    if (wake) wake.pause();
    cta.style.display = 'none';
    qEl.style.display = 'none';
    bar.style.display = 'flex';
    steps.length = 0;
    steps.push({
      q: "What's new in your world since we last spoke? Anything at all.",
      nudge: 'Anything at all — a memory, a talent, the strangest thing you love.',
      handle(ans) {
        freestyle(ans);
        return 'In it goes — give me one breath to thread it.';
      },
    });
    step = -1;
    nextQuestion();
  }

  cta.onclick = () => {
    // Permission-warm only: a PRIVATE getUserMedia inside the tap earns the
    // site its mic permission (which persists), then stops its own tracks —
    // holding a stream while she talks flips iOS into the phone-call session,
    // and it must NEVER share recStream/recCtx with a real listen: a slow
    // grant would let the warm's continuation clobber question 1's borrow
    // and strand micBusy forever.
    if (canRecord) navigator.mediaDevices.getUserMedia({ audio: true })
      .then(s => { try { s.getTracks().forEach(t => t.stop()); } catch {} })
      .catch(() => {});
    if (growing && loadSaved() && !growSession) { growAsk(); return; }
    if (started) {  // returning visitor: CTA means "start over"
      try { localStorage.removeItem(KEY); } catch {}
      started = false;
      step = -1;
    }
    begin();
  };
  const wake = window.VERA_WAKE
    ? window.VERA_WAKE.init({ onWake: () => {
        const a = (window.VERA_VOICE || {})['Yes?'];
        if (a && window.VERA_AUDIO_EL) {
          try {
            const el = window.VERA_AUDIO_EL;
            el.onended = el.onerror = null;
            el.src = a;
            el.play().catch(() => {});
          } catch {}
        }
        setTimeout(() => {
          if (growing && !growSession && loadSaved()) { growAsk(); return; }
          if (!started) { begin(); return; }
          // Returning visitor: a voice summon must NEVER wipe their saved
          // Seed — that is exclusively the labeled replant button's job.
          qEl.textContent = 'Your map stands. The rebuild button below starts fresh.';
          qEl.style.display = 'block';
          if (wake) wake.resume();
        }, 600);
      } })
    : null;

  /* Returning visitor: their galaxy, restored before a single click. */
  const saved = loadSaved();
  if (saved) {
    restore(saved);
    if (growing) {  // she walked them here to ADD, not to start over
      cta.textContent = '◈ Grow your map — 30 sec';
      cta.classList.add('urge');
      qEl.textContent = 'One question. Watch it thread in, live.';
    } else {
      cta.textContent = '◈ Rebuild your map — 2 min';
      qEl.textContent = 'Back again? Your Seed — precisely as you left it, and it remembers you.';
    }
    qEl.style.display = 'block';
  }
  go.onclick = () => answer(input.value);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') answer(input.value); });

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const API = (window.DEMO_API || '').trim();
  const idleHint = input.placeholder;
  const micIdle = () => {
    mic.classList.remove('rec'); mic.textContent = '🎙'; input.placeholder = idleHint;
  };
  let startSR = null;
  let abortSR = null;
  if (SR) {
    let rec = null;
    let cancelled = false;
    abortSR = () => {  // the answer landed another way — this ear retires silently
      if (!rec) return;
      cancelled = true;
      try { rec.abort(); } catch { try { rec.stop(); } catch {} }
    };
    startSR = (manual) => {
      if (rec) {  // second tap = cancel; their typed draft survives
        cancelled = true;
        try { rec.abort(); } catch { try { rec.stop(); } catch {} }
        return;
      }
      if (manual) bargeIn();  // a mic tap mid-line means "let me speak" — she yields
      jstate = 'listening';   // the reactor shows the ear, not her interrupted line
      voiceMode = true;
      cancelled = false;
      micBusy = true;
      const draft = input.value;
      rec = new SR();
      rec.lang = 'en-US'; rec.interimResults = true; rec.maxAlternatives = 1;
      rec.continuous = true;  // Chrome must not hang up on a thinking human
      mic.classList.add('rec'); mic.textContent = '◉ LISTENING';
      input.value = '';
      input.placeholder = 'Take your time — I\u2019m listening\u2026';
      // Two-scenario endpointing: WE decide when they're done, not Chrome.
      // Base pause 5s — generous enough that the FIRST thinking pause
      // survives too, not just the second; pause-and-resumers get 6.5s;
      // trailing connectives ('and', 'because', 'um'...) buy extra time.
      // Up-front thinking silence: a generous 75s before giving up.
      let base = '';
      let lastHeardAt = Date.now();
      let sawPauseResume = false;
      const t0 = Date.now();
      const CONT = /\b(and|or|but|so|because|like|um|uh|then|also|plus|maybe|well)[\s.]*$/i;
      let endTimer = null;
      const armEnd = () => {
        clearTimeout(endTimer);
        endTimer = setTimeout(() => {
          const said = input.value.trim();
          const idle = Date.now() - lastHeardAt;
          let cap = sawPauseResume ? 6500 : 5000;
          if (CONT.test(said)) cap += 2500;
          if (!said && Date.now() - t0 < 75000) { armEnd(); return; }
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
        input.value = (base + ' ' + heard).trim();
      };
      rec.onend = () => {
        // Chrome gave up; if THEY haven't, quietly pick the ear back up.
        if (!cancelled && rec && !rec._finish && Date.now() - t0 < 90000) {
          base = input.value.trim();
          try { rec.start(); return; } catch {}
        }
        clearTimeout(endTimer);
        micIdle(); rec = null;
        micBusy = false;
        const said = input.value.trim();
        if (cancelled || !said) {
          jstate = 'idle';  // no answer landed — never leave the reactor stuck on 'speaking'
          input.value = draft;
          // Either way the hand-back-to-manual is FINAL for this question:
          // kill the pending nudge, or within 12s she'd contradict herself
          // and reopen the very ear the user just closed. Mic-off means
          // mic-off — they re-engage by tap or typing.
          if (cancelled) {
            clearTimeout(nudgeTimer); nudged = step;
          } else if (awaiting) {
            // 75 quiet seconds must not end in a silent dead mic — leave a
            // soft door open. (A deliberate cancel tap stays silent.)
            clearTimeout(nudgeTimer); nudged = step;
            say('No hurry at all — tap the mic when you’re ready, or simply type.');
          }
          return;
        }
        answer(said);
      };
      rec.onerror = () => {};  // onend follows and settles state
      try { rec.start(); } catch {
        // A recognizer that can't even start must not strand micBusy with a
        // pulsing mic and no endTimer — that kills autoListen and loops the
        // nudge forever. Restore everything and hand back to the buttons.
        micIdle(); rec = null; micBusy = false;
        jstate = 'idle';  // the ear never opened — don't leave 'listening' pulsing
        input.value = draft;
        return;
      }
      armEnd();
    };
  }

  /* ---- server ears (worker /hear): iPhones and Firefox ship no speech
     recognition, and the interview must not depend on typing there.
     Borrow-per-listen: permission persists after the first in-gesture grant,
     but a HELD stream flips iOS into the phone-call session (earpiece-quiet
     voice, tracks killed at whim) — acquire per capture, release after. */
  const canRecord = !!(API && navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    && (window.AudioContext || window.webkitAudioContext));
  let recStream = null, recCtx = null, recSrcNode = null, recording = null;
  let earsGen = 0;  // generation token: a stale borrow must never clobber a newer one
  function releaseEars() {
    earsGen++;  // any borrow still awaiting its grant is now stale — it stands down
    try { if (recStream) recStream.getTracks().forEach(t => { t.onended = null; t.stop(); }); } catch {}
    recStream = null;
    try { if (recCtx) recCtx.close(); } catch {}
    recCtx = null; recSrcNode = null;
  }
  async function ensureEars() {
    // Borrow-per-listen for the WHOLE session — a context kept across
    // listens wakes up suspended once iOS tears the audio session down,
    // and LISTENING shows while nothing is heard. Fresh context each
    // listen, created BEFORE the await so a tap's gesture blesses it.
    releaseEars();
    const gen = ++earsGen;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    recCtx = ctx;
    let stream = null;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}
    if (gen !== earsGen) {
      // Superseded (or released) while the grant was pending — stand down
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
  async function listenOnce(auto) {
    if (recording) return;
    if (!auto) { bargeIn(); jstate = 'listening'; }  // a mic tap mid-line means "let me speak" — she yields; the reactor shows the ear
    micBusy = true;  // covers the getUserMedia await too — no nudge over a borrowing ear
    voiceMode = true;
    let ok = false;
    try { ok = await ensureEars(); } catch { ok = false; }  // a rejection must never strand micBusy
    if (!ok) {
      micBusy = false;
      jstate = 'idle';  // the ear never opened — don't leave 'listening' pulsing
      // Never die silently: the visitor must know one tap fixes hearing.
      input.placeholder = 'Tap the mic so she can listen';
      return;
    }
    // iOS reports a kicked audio session as 'interrupted', not 'suspended' —
    // anything short of running must be resumed or the mic hears nothing.
    if (recCtx.state !== 'running') { try { await recCtx.resume(); } catch {} }
    // A track iOS kills mid-listen must end the capture, not play dead.
    recStream.getTracks().forEach(t => { t.onended = () => hearFinish(); });
    const node = recCtx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    const r2 = { node, chunks, rate: recCtx.sampleRate, spoke: false, quietMs: 0,
      frames: 0,
      draft: input.value,  // typed half-answers survive a silent/dead capture
      settleMs: 350,  // her own voice tail is still in the room — not an answer
      timer: setTimeout(hearFinish, 95000),
      // Dead-pipe watchdog: a capture that never produces a frame ends
      // fast and says so, instead of impersonating a quiet room.
      pulse: setTimeout(() => { if (recording === r2 && !r2.frames) hearFinish(); }, 1500) };
    node.onaudioprocess = e => {
      r2.frames++;
      const d = e.inputBuffer.getChannelData(0);
      const frameMs = (d.length / r2.rate) * 1000;
      if (r2.settleMs > 0) { r2.settleMs -= frameMs; return; }  // echo settle
      chunks.push(new Float32Array(d));
      let sum = 0;
      for (let i = 0; i < d.length; i += 8) sum += d[i] * d[i];
      const rms = Math.sqrt(sum / (d.length / 8));
      // A real thinking pause: three seconds, not a nervous one.
      // Two scenarios, one rule: a pause is only 'done' when it outlasts
      // this speaker's own habits. Anyone who pauses >2s and RESUMES is a
      // thinker — their tolerance rises for the rest of the answer. And an
      // interview question deserves a real thinking silence up front (75s),
      // not a shot clock. (Resume detection reads quietMs BEFORE speech
      // zeroes it — the other order can never fire.)
      if (r2.spoke && r2.quietMs > 2000 && rms > 0.015) r2.pauser = true;
      if (rms > 0.015) { r2.spoke = true; r2.quietMs = 0; }
      else r2.quietMs += frameMs;
      // Base 5000 matches the SR path — RMS silence counts from true acoustic
      // quiet, so anything stricter cuts fast starters off at their FIRST
      // real mid-thought pause on the one platform with no other voice path.
      const pauseCap = r2.pauser ? 6500 : 5000;
      if ((r2.spoke && r2.quietMs > pauseCap) || (!r2.spoke && r2.quietMs > 75000)) hearFinish();
    };
    recSrcNode.connect(node); node.connect(recCtx.destination);
    recording = r2;
    mic.classList.add('rec'); mic.textContent = '◉ LISTENING';
    input.value = '';
    input.placeholder = auto ? 'Go on — she’s listening…' : 'Listening — speak, then pause…';
  }
  async function hearFinish() {
    if (!recording) return;
    const r = recording;
    recording = null;
    clearTimeout(r.timer); clearTimeout(r.pulse);
    try { recSrcNode.disconnect(r.node); } catch {}
    try { r.node.disconnect(); } catch {}
    // RELEASE the whole session between listens. A held stream flips iOS
    // into the phone-call session; a kept context wakes up dead (see
    // ensureEars). Site permission persists — the next listen re-borrows.
    releaseEars();
    micIdle();
    // micBusy HOLDS through the /hear round-trip: the answer is still in
    // flight, and a nudge or autoListen during it would reopen an ear that
    // records her own ack as the next answer.
    if (!r.frames) {
      micBusy = false;
      input.value = r.draft;
      // Not one frame arrived — dead pipe, not a quiet visitor. Say so.
      input.placeholder = 'Her ears cut out \u2014 tap the mic and she\u2019ll listen again';
      return;
    }
    let total = 0; for (const c of r.chunks) total += c.length;
    if (!r.spoke || total < r.rate * 0.4) {  // silence — wait for them; their typed draft survives
      micBusy = false;
      input.value = r.draft;
      return;
    }
    input.placeholder = 'On the wires…';
    const gen = ansGen;  // if an answer lands another way mid-flight, this transcript is stale
    try {
      const resp = await fetch(API + '/hear', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audio: b64FromBuf(wavFrom(r.chunks, r.rate)) }),
      });
      const d = await resp.json().catch(() => null);
      if (gen !== ansGen) return;  // superseded — a newer answer owns micBusy/input now; drop this transcript
      input.placeholder = idleHint;
      micBusy = false;
      if (d && d.heard) { input.value = d.heard; answer(d.heard); return; }
      // Nothing heard: say so in her register, and their typed half-answer
      // from before the mic tap survives — draft-survival is the house rule.
      input.value = r.draft;
      input.placeholder = 'Didn’t catch that — tap the mic, or type';
      say('I didn’t catch that — do try again, a touch closer to the microphone.',
        () => { if (voiceMode) autoListen(); });  // the spoken 'try again' must reopen the ear itself
    } catch {
      if (gen !== ansGen) return;  // superseded mid-flight — stand down silently
      // The uplink failed AFTER they spoke a full answer — silence here
      // reads as being ignored. Acknowledge the loss; the draft survives.
      micBusy = false;
      input.value = r.draft;
      input.placeholder = 'The uplink hiccuped — tap the mic, or type';
      say('The uplink hiccuped. Once more, if you please.',
        () => { if (voiceMode) autoListen(); });  // keep the hands-free chain alive after a failure
    }
  }
  function hearDiscard() {
    // The visitor answered another way mid-capture: release the ear, clear
    // the timers, drop the chunks — post nothing. Her reply must never come
    // back as "their" words.
    if (!recording) return;
    const r = recording;
    recording = null;
    micBusy = false;
    clearTimeout(r.timer); clearTimeout(r.pulse);
    try { recSrcNode.disconnect(r.node); } catch {}
    try { r.node.disconnect(); } catch {}
    releaseEars();
    micIdle();
  }

  // Hands-free chain: once they've used voice, each question reopens the mic
  // by itself — no button between answers.
  function autoListen() {
    if (!voiceMode) return;
    if (micBusy || recording) return;  // an ear is already open — starting again would CANCEL it
    if (startSR) startSR();
    else if (canRecord) listenOnce(true);
  }

  if (startSR) mic.onclick = () => startSR(true);  // a tap is manual — never pass the Event
  else if (canRecord) mic.onclick = () => (recording ? hearFinish() : listenOnce(false));
  else mic.style.display = 'none';

  // Early-access capture — shown once the Seed is planted. Degrades politely
  // if the worker has no SIGNUPS storage yet.
  function joinBox() {
    if (document.getElementById('join-box')) return;
    try { if (localStorage.getItem('vera_joined')) return; } catch {}
    const box = document.createElement('div');
    box.id = 'join-box';
    box.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:34px;' +
      'z-index:6;display:flex;gap:6px;align-items:center;background:rgba(8,22,34,0.92);' +
      'border:1px solid rgba(63,217,255,0.35);border-radius:6px;padding:7px 8px;' +
      'font-family:Rajdhani,sans-serif;max-width:92vw';
    const em = document.createElement('input');
    em.type = 'email'; em.placeholder = 'email — early access to the full her';
    em.maxLength = 120;
    em.style.cssText = 'background:none;border:none;outline:none;color:#eaf6fb;' +
      'font-family:inherit;font-size:13px;width:230px;max-width:52vw';
    const jb = document.createElement('button');
    jb.type = 'button'; jb.textContent = 'JOIN';
    jb.style.cssText = 'background:none;border:1px solid rgba(63,217,255,0.5);border-radius:4px;' +
      'color:#3fd9ff;font-family:inherit;font-size:11px;letter-spacing:0.2em;' +
      'padding:5px 12px;cursor:pointer';
    jb.onclick = async () => {
      const v = em.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { em.focus(); return; }
      jb.disabled = true; jb.textContent = '…';
      const settle = msg => {  // terminal states collapse the box to a line
        box.textContent = msg;
        box.style.color = '#9fc3d2'; box.style.fontSize = '12px';
        box.style.letterSpacing = '0.18em'; box.style.padding = '10px 16px';
      };
      try {
        const r = await fetch(API + '/join', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: v }),
        });
        if (r.ok) {
          try { localStorage.setItem('vera_joined', '1'); } catch {}
          settle('✦ You’re on the list.');
        }
        else if (r.status === 501) settle('✦ Early access opens soon.');
        else { jb.disabled = false; jb.textContent = 'RETRY'; }  // keep the form — never reload
      } catch { jb.disabled = false; jb.textContent = 'RETRY'; }
    };
    box.append(em, jb);
    document.body.appendChild(box);
  }

  // Entry gate: voice choice arms the name-listener; muted stays truly silent.
  // Guided muted arrivals start the interview instantly (no audio to bless);
  // guided voiced arrivals get the pulsing one-tap invitation instead.
  if (window.VERA_ENTRY) window.VERA_ENTRY.onDone(voice => {
    soundOn = voice;
    voiceMode = voice;
    if (voice && wake) wake.arm();
    // Muted arrivals start instantly (no audio to bless); voiced arrivals
    // need the one CTA tap — a new page means a new gesture, iOS law.
    if (growing && !voice && !growSession && loadSaved()) { growAsk(); return; }
    if (guided && !voice && !started) begin();
  });

  if (guided && !started) {
    cta.classList.add('urge');
    cta.textContent = '◈ Introduce yourself — 2 min';
    qEl.textContent = 'She’d like to meet you — one tap.';
    qEl.style.display = 'block';
  }
})();
