/* V.E.R.A. boot montage — the cinematic cold open for returning Seed-holders.
 *
 * A generative Web Audio score (no files, no licensing, zero page weight)
 * pulses under a HUD status ticker while she greets them by name. The score
 * is synthesized live: ~124 BPM minor-key melodic pulse — kick, sidechained
 * bass, delayed arpeggio, pads — with a filter-open "drop" on the final line.
 *
 * window.VERA_BOOT.play(opts) MUST be called synchronously inside a user tap
 * (iOS audio law: an AudioContext only runs when born in a gesture).
 *   opts: { name, nodes, welcome, speak(text, cb) }
 * Returns a Promise that resolves when the montage visuals finish.
 * VERA_BOOT.duck() / .stop(fadeSeconds) control the score afterwards.
 * Tap anywhere during the montage to skip.
 */
(() => {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;

  // While the show runs, the page's own chrome leaves the stage — the veil
  // already makes it unclickable, and it collides with ticker/panels on
  // phones, tablets and narrow windows. Hidden, not moved: no layout shift.
  const bootCss = document.createElement('style');
  bootCss.textContent =
    '.boot-on #demo-talk,.boot-on #nav-map,.boot-on #talk-chip{visibility:hidden !important}';
  document.head.appendChild(bootCss);

  /* ---- the score ---- */
  const BPM = 124;
  const STEP = 60 / BPM / 4;             // one 16th note, in seconds
  // A-minor progression, one chord per bar: Am — F — C — G.
  const BASS = [55.0, 43.65, 65.41, 49.0];
  const ARPS = [
    [220.0, 261.63, 329.63, 440.0],
    [174.61, 220.0, 261.63, 349.23],
    [261.63, 329.63, 392.0, 523.25],
    [196.0, 246.94, 293.66, 392.0],
  ];
  const PADS = [
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [196.0, 261.63, 329.63],
    [196.0, 246.94, 293.66],
  ];

  function makeScore() {
    if (!AC) return null;
    let ctx;
    try { ctx = new AC(); } catch { return null; }
    try { if (ctx.state === 'suspended') ctx.resume(); } catch {}

    const master = ctx.createGain();
    master.gain.value = 0;
    const veilFilter = ctx.createBiquadFilter();   // the whole mix behind one
    veilFilter.type = 'lowpass';                   // lowpass: closed = distant,
    veilFilter.frequency.value = 750;              // open = the drop
    veilFilter.Q.value = 0.6;
    veilFilter.connect(master);
    master.connect(ctx.destination);

    // Dotted-eighth delay for the arp — the classic melodic-house shimmer.
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = STEP * 6;
    const fbk = ctx.createGain(); fbk.gain.value = 0.34;
    const wet = ctx.createGain(); wet.gain.value = 0.3;
    delay.connect(fbk); fbk.connect(delay); delay.connect(wet); wet.connect(veilFilter);

    // Kick bypasses the veil filter — the pulse must always be felt.
    const kickBus = ctx.createGain(); kickBus.gain.value = 0.85; kickBus.connect(master);
    const bassBus = ctx.createGain(); bassBus.gain.value = 0.3;  bassBus.connect(veilFilter);
    const arpBus = ctx.createGain();  arpBus.gain.value = 0.12;
    arpBus.connect(veilFilter); arpBus.connect(delay);
    const padBus = ctx.createGain();  padBus.gain.value = 0.0;   padBus.connect(veilFilter);

    function kick(t) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(43, t + 0.11);
      g.gain.setValueAtTime(1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g); g.connect(kickBus);
      o.start(t); o.stop(t + 0.32);
    }
    function bass(t, f) {
      const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = f;
      lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 1.1;
      // Late attack = the sidechain "breath" after each kick.
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.09);
      g.gain.exponentialRampToValueAtTime(0.001, t + STEP * 2);
      o.connect(lp); lp.connect(g); g.connect(bassBus);
      o.start(t); o.stop(t + STEP * 2 + 0.03);
    }
    function pluck(t, f, vel) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(vel, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g); g.connect(arpBus);
      o.start(t); o.stop(t + 0.24);
    }
    function pad(t, freqs, dur) {
      freqs.forEach(f => [0.9975, 1.0025].forEach(det => {
        const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = f * det;
        lp.type = 'lowpass'; lp.frequency.value = 700;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05, t + 1.1);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(lp); lp.connect(g); g.connect(padBus);
        o.start(t); o.stop(t + dur + 0.05);
      }));
    }

    // Lookahead scheduler — 16th-note grid, bars cycle the progression.
    let step = 0, nextT = ctx.currentTime + 0.08, timer = null, dead = false;
    let padsOn = false;
    function tick() {
      if (dead) return;
      if (nextT < ctx.currentTime) {
        // Timers stalled (backgrounded tab, main-thread jank): drop the missed
        // steps instead of bursting them all at once — Web Audio clamps past
        // start times to "now", which sounds like the song falling downstairs.
        step += Math.ceil((ctx.currentTime - nextT) / STEP);
        nextT = ctx.currentTime + 0.02;
      }
      while (nextT < ctx.currentTime + 0.28) {
        const bar = Math.floor(step / 16) % 4;
        const s16 = step % 16;
        if (s16 % 4 === 0) kick(nextT);
        if (s16 % 2 === 0) bass(nextT, BASS[bar]);
        const arp = ARPS[bar];
        pluck(nextT, arp[[0, 2, 1, 3, 2, 0, 3, 1][s16 % 8]], s16 % 4 === 0 ? 0.9 : 0.55);
        if (padsOn && s16 === 0) pad(nextT, PADS[bar], STEP * 16);
        step++; nextT += STEP;
      }
      timer = setTimeout(tick, 90);
    }

    const now = () => ctx.currentTime;
    let live = false;  // level moves before start() are meaningless — and a
    return {           // duck on a never-started score must not fade music IN
      start() {
        live = true;
        // Linear up-ramps: an exponential fade-IN from a near-zero floor is
        // dB-linear, i.e. inaudible for most of its length. Exponential stays
        // for the fade-outs, where that same shape is what sounds natural.
        master.gain.cancelScheduledValues(now());
        master.gain.setValueAtTime(0.0001, now());
        master.gain.linearRampToValueAtTime(0.3, now() + 1.2);
        tick();
      },
      pads() { padsOn = true; },
      lift() {  // the drop: the veil opens, the shimmer doubles
        veilFilter.frequency.cancelScheduledValues(now());
        veilFilter.frequency.setValueAtTime(veilFilter.frequency.value, now());
        veilFilter.frequency.exponentialRampToValueAtTime(3600, now() + 1.4);
        wet.gain.linearRampToValueAtTime(0.42, now() + 1.4);
        padsOn = true;
      },
      duck() {
        if (!live) return;
        master.gain.cancelScheduledValues(now());
        master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now());
        master.gain.exponentialRampToValueAtTime(0.12, now() + 0.45);
      },
      bed() {  // showcase level: the music stays present, her voice stays clear
        if (!live) return;
        master.gain.cancelScheduledValues(now());
        master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now());
        master.gain.linearRampToValueAtTime(0.18, now() + 0.6);
      },
      swell() {
        if (!live) return;
        master.gain.cancelScheduledValues(now());
        master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now());
        master.gain.linearRampToValueAtTime(0.3, now() + 0.8);
      },
      stop(fade) {
        if (dead) return;
        live = false;  // level moves during the fade must not resurrect it
        const f = Math.max(0.2, fade || 2);
        master.gain.cancelScheduledValues(now());
        master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now());
        master.gain.exponentialRampToValueAtTime(0.0001, now() + f);
        setTimeout(() => {
          dead = true;
          clearTimeout(timer);
          try { ctx.close(); } catch {}
        }, f * 1000 + 120);
      },
    };
  }

  /* ---- the show: one cue at a time, voice landing WITH its panel ----
     Three acts: BOOT (dark veil, identity ticker), SHOW (veil thins, the hub
     panels build one by one while she lands a beat on each), DROP (music
     opens, the question). Every `say` string must byte-match a VOICE_LINES
     entry in build_demo.py — the exact-string law of her baked voice. */
  function cues(o) {
    const name = String(o.name || '').trim().toUpperCase();
    const hub = n => () => {
      if (!window.VERA_HUB) return;
      window.VERA_HUB.show(n);
      // Phones dock panels in a horizontal row — follow the build, or the
      // audience only ever sees the first panel of the show.
      const dock = document.getElementById('hub-dock');
      const el = document.getElementById('hub-' + n);
      if (dock && el && dock.scrollWidth > dock.clientWidth)
        dock.scrollTo({ left: Math.max(0, el.offsetLeft - 12), behavior: 'smooth' });
    };
    // Two scripts, one machine. FIRST CONTACT owns the honest demo flag and
    // promises nothing personal; the returning cut flexes her memory.
    const boot = o.fresh ? [
      { t: 550,   line: 'PUBLIC DEMO — SANDBOXED · CAPABILITIES LIMITED' },
      { t: 1900,  line: 'LIVE SYSTEMS — ONLINE' },
    ] : [
      { t: 550,   line: name ? 'IDENTITY — ' + name + ' · VERIFIED' : 'IDENTITY — CONFIRMED' },
      { t: 1700,  line: 'RECONSTRUCTING BRAIN MAP — ' + (o.nodes || 0) + ' NODES ONLINE' },
      { t: 2850,  line: 'LISTENING SYSTEMS — ONLINE' },
    ];
    return boot.concat([
      { t: 4000,  phase: 'show', line: 'UPLINK — ATTACHED', act: hub('log') },
      { t: 5600,  line: 'MARKET FEEDS — STREAMING', act: hub('markets'),
        say: 'Markets, tracked while you sleep.' },
      { t: 10200, line: 'SCOREBOARD — SYNCED', act: hub('scores'),
        say: 'Scores, the moment they change.' },
      { t: 14800, line: 'BIOMETRICS — NOMINAL', act: hub('vitals'),
        say: 'Vitals, watched with care.' },
      { t: 19400, line: 'SIGHT & HEARING — ON REQUEST',
        say: 'And with your leave — I can see your screen, and hear your world.' },
      { t: 24600, phase: 'drop', line: 'ALL SYSTEMS — YOURS.', big: true },
      { t: 25400, say: 'Are you ready to save the world?' },
      { t: 29800, phase: 'end' },
    ]);
  }

  /* ---- optional produced track (e.g. a Suno export) ----
     Drop boot_score.mp3 next to the site files and it replaces the generative
     score. Routed through Web Audio because iOS ignores <audio>.volume — the
     gain node is the only way to duck her music under her voice there. */
  let trackUrl = 'boot_score.mp3';  // build stamps 'boot_score.mp3' here when the track ships
  if (!trackUrl) {
    // Dev-server fallback probe. Content-type gated: an SPA catch-all rewrite
    // answers 200 text/html for missing files, which is not a song.
    fetch('boot_score.mp3', { method: 'HEAD' })
      .then(r => {
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        if (r.ok && (ct.indexOf('audio') === 0 || ct.indexOf('application/octet-stream') === 0))
          trackUrl = 'boot_score.mp3';
      })
      .catch(() => {});
  }

  function makeFileScore(url) {
    if (!AC) return null;
    let ctx;
    try { ctx = new AC(); } catch { return null; }
    try { if (ctx.state === 'suspended') ctx.resume(); } catch {}
    const el = new Audio();
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.src = url;
    el.loop = true;
    // Bless playback inside the tap: roll silently at zero gain until start()
    // — iOS only honors play() calls descended from a user gesture.
    el.play().catch(() => {});
    const g = ctx.createGain();
    g.gain.value = 0;
    try {
      ctx.createMediaElementSource(el).connect(g);
      g.connect(ctx.destination);
    } catch { try { ctx.close(); } catch {} return null; }
    const now = () => ctx.currentTime;
    const ramp = (v, t, linear) => {  // linear up (audible whole ramp), exp down
      g.gain.cancelScheduledValues(now());
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), now());
      if (linear) g.gain.linearRampToValueAtTime(v, now() + t);
      else g.gain.exponentialRampToValueAtTime(v, now() + t);
    };
    // If the media dies mid-show (bad file, dropped connection), the synth
    // score takes over in the same state — the montage must never go mute.
    let dead = false, started = false, ducked = false, understudy = null;
    el.addEventListener('error', () => {
      if (dead || understudy) return;
      try { ctx.close(); } catch {}
      understudy = makeScore();
      if (!understudy) return;
      if (started) understudy.start();
      if (ducked) understudy.duck();
    });
    return {
      start() {
        started = true;
        if (understudy) return understudy.start();
        try { el.currentTime = 0; } catch {}  // rewind the silent pre-roll
        el.play().catch(() => {});
        ramp(0.55, 1.2, true);
      },
      pads() { if (understudy) understudy.pads(); },  // a produced track carries its own build
      lift() { if (understudy) understudy.lift(); },
      duck() {
        if (dead) return;
        ducked = true;
        if (understudy) return understudy.duck();
        if (!started) return;  // ducking silence would fade the track IN
        ramp(0.14, 0.45);
      },
      bed() {
        if (dead) return;
        ducked = false;
        if (understudy) return understudy.bed();
        if (!started) return;
        ramp(0.3, 0.6, true);
      },
      swell() {
        if (dead) return;
        ducked = false;
        if (understudy) return understudy.swell();
        if (!started) return;
        ramp(0.55, 0.8, true);
      },
      stop(fade) {
        if (dead) return;
        dead = true;
        if (understudy) return understudy.stop(fade);
        const f = Math.max(0.2, fade || 2);
        ramp(0.0001, f);
        setTimeout(() => {
          try { el.pause(); } catch {}
          try { ctx.close(); } catch {}
        }, f * 1000 + 120);
      },
    };
  }

  let current = null;  // the live score, for duck/stop after play resolves

  function play(opts) {
    opts = opts || {};
    // Born in the tap — do this FIRST (iOS blesses the whole call stack).
    // The SHOW may wait (opts.wait: e.g. the mic-permission prompt), but the
    // audio graph must exist right now, inside the gesture.
    const score = (trackUrl && makeFileScore(trackUrl)) || makeScore();
    current = score;

    const veil = document.createElement('div');
    veil.id = 'boot-veil';
    veil.style.cssText =
      'position:fixed;inset:0;z-index:8;cursor:pointer;' +
      'background:radial-gradient(ellipse at 50% 42%,rgba(2,10,16,0.06) 0%,rgba(2,8,14,0.42) 100%);' +
      'opacity:0;transition:opacity 0.45s ease;display:flex;align-items:flex-end;justify-content:center';
    // The boot darkness is its own layer so act two can CROSSFADE it away —
    // swapping a gradient in place is a one-frame flash-cut, not a thinning.
    const shade = document.createElement('div');
    shade.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:0;' +
      'background:radial-gradient(ellipse at 50% 42%,rgba(2,10,16,0.24) 0%,rgba(2,8,14,0.62) 100%);' +
      'transition:opacity 0.9s ease';
    const col = document.createElement('div');
    col.style.cssText =
      'position:relative;z-index:1;' +
      'margin-bottom:16vh;font-family:Rajdhani,monospace,sans-serif;font-size:14px;' +
      'letter-spacing:0.22em;color:#3fd9ff;min-width:min(560px,86vw);max-width:86vw;' +
      'text-shadow:0 0 12px rgba(63,217,255,0.45)';
    veil.append(shade, col);
    document.body.appendChild(veil);
    document.body.classList.add('boot-on');  // competing chrome leaves the stage
    requestAnimationFrame(() => { veil.style.opacity = '1'; });

    const CUES = cues(opts);
    const TEXTS = CUES.filter(c => c.line);
    let skipped = false;
    let finished = false;  // guards late speak-callbacks: after the montage
    let act = 'boot';      // boot -> show -> drop: level moves are act-aware
    let welcomeDone = !(opts.speak && opts.welcome);
    const timers = [];     // hands off, its swell must never undo the duck
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const sayLine = opts.say || opts.speak;  // baked-first for the beats

    // Her line rides the intro; the score breathes down while she speaks.
    const speakWelcome = () => {
      if (!opts.speak || !opts.welcome) return;
      later(() => {
        if (skipped) return;
        if (score) score.duck();
        opts.speak(opts.welcome, () => {
          welcomeDone = true;
          // Never bed during the DROP — it would deflate the climax.
          if (score && !skipped && !finished && act !== 'drop') score.bed();
        });
      }, 700);
    };

    let pruned = 0;  // docked ticker keeps only the recent past — count what left
    function addLine(text, big) {
      const p = document.createElement('div');
      p.style.cssText = 'margin:7px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
        (big ? 'color:#eaf6fb;font-size:15px;text-shadow:0 0 16px rgba(63,217,255,0.8)' : '');
      col.appendChild(p);
      if (docked) {  // short viewports: 4 lines, or the ticker meets the panels
        while (col.childElementCount > 4) { col.firstChild.remove(); pruned++; }
      }
      const full = '▸ ' + text;
      let i = 0;
      (function type() {
        if (skipped) { p.textContent = full + (big ? '' : '  ✓'); return; }
        p.textContent = full.slice(0, ++i) + '█';
        if (i < full.length) timers.push(setTimeout(type, 14));
        else p.textContent = full + (big ? '' : '  ✓');
      })();
    }

    // Act two: the veil thins so the hub builds in plain view; the ticker
    // docks small in a corner — the panels are the show now, not the text.
    const mobileLayout = matchMedia('(max-width: 900px)').matches;
    let docked = false;
    const thinVeil = () => {
      docked = true;
      shade.style.opacity = '0';  // crossfade — the stage brightens, no pop
      veil.style.display = 'block';
      col.style.position = 'absolute';
      col.style.margin = '0';
      col.style.fontSize = '11px';
      col.style.minWidth = '0';
      // Top corner on phones (nav chrome is hidden while boot-on, so the band
      // is free even in landscape); bottom-left on desktop (talk bar hidden).
      if (mobileLayout) { col.style.top = '12px'; col.style.left = '12px'; col.style.maxWidth = '92vw'; }
      else { col.style.left = '18px'; col.style.bottom = '20px'; col.style.maxWidth = '40vw'; }
    };

    return new Promise(resolve => {
      let settled = false;
      const finish = quick => {
        if (settled) return;
        settled = true;
        finished = true;
        timers.forEach(clearTimeout);
        // The music leaves WITH the veil: any tail under her next line reads
        // as echo — and on phone speakers it bleeds into the microphone.
        if (score) score.stop(quick ? 0.5 : 1.6);
        // Stage, not cockpit: the panels were a performance — they leave, and
        // the empty stage is the invitation to answer her.
        if (window.VERA_HUB) window.VERA_HUB.dissolve();
        document.body.classList.remove('boot-on');  // the chrome returns
        veil.style.opacity = '0';
        setTimeout(() => { veil.remove(); resolve(); }, quick ? 250 : 700);
      };

      const runCue = c => {
        if (skipped || settled) return;
        if (c.phase === 'show') {
          act = 'show';
          thinVeil();
          // Stay ducked while her greeting still plays — its own completion
          // callback performs the bed the moment she finishes.
          if (score) { score.pads(); if (welcomeDone) score.bed(); }
        }
        if (c.phase === 'drop') { act = 'drop'; if (score) { score.lift(); score.swell(); } }
        if (c.act) c.act();
        if (c.line) addLine(c.line, c.big);
        if (c.say && sayLine) sayLine(c.say);
        if (c.phase === 'end') finish(false);
      };

      // The dark stage holds until permissions settle (opts.wait) — browser
      // mic prompts land HERE, on an empty veil, never over the show itself.
      let began = false;
      let standbyEl = null;
      const standby = setTimeout(() => {
        if (began || settled) return;
        standbyEl = document.createElement('div');
        standbyEl.style.cssText = 'margin:7px 0;opacity:0.55';
        standbyEl.textContent = '▸ MIC CHANNEL — AWAITING PERMISSION';
        col.appendChild(standbyEl);
      }, 450);
      const begin = () => {
        if (began || settled) return;
        began = true;
        clearTimeout(standby);
        if (standbyEl) { standbyEl.remove(); standbyEl = null; }
        if (window.VERA_HUB) window.VERA_HUB.reset();  // clean stage, no reel leftovers
        if (score) score.start();
        speakWelcome();
        CUES.forEach(c => later(() => runCue(c), c.t));
      };
      Promise.resolve(opts.wait).catch(() => {}).then(begin);

      // Skip is a TAP, not a touch: a finger that moves is trying to look at
      // the panels (or just resting), and must not kill the show.
      let downAt = null;
      veil.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
      veil.addEventListener('pointerup', e => {
        if (skipped || settled || !downAt) return;
        const dx = e.clientX - downAt[0], dy = e.clientY - downAt[1];
        downAt = null;
        if (dx * dx + dy * dy > 144) return;  // moved >12px: a swipe, not a skip
        skipped = true;
        if (standbyEl) { standbyEl.remove(); standbyEl = null; }
        // Complete any line frozen mid-type (its next timer tick is about to
        // be cleared), THEN backfill the not-yet-started ones. Text only —
        // skipping runs no panels and speaks no beats.
        Array.prototype.forEach.call(col.children, (elDiv, i) => {
          const c = TEXTS[i + pruned];
          if (c) elDiv.textContent = '▸ ' + c.line + (c.big ? '' : '  ✓');
        });
        TEXTS.slice(col.childElementCount + pruned).forEach(c => addLine(c.line, c.big));
        finish(true);
      });
    });
  }

  window.VERA_BOOT = {
    play,
    duck() { if (current) current.duck(); },
    stop(fade) { if (current) { current.stop(fade); current = null; } },
  };
})();
