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
    return {
      start() {
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
        master.gain.cancelScheduledValues(now());
        master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now());
        master.gain.exponentialRampToValueAtTime(0.12, now() + 0.45);
      },
      swell() {
        master.gain.cancelScheduledValues(now());
        master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now());
        master.gain.linearRampToValueAtTime(0.3, now() + 0.8);
      },
      stop(fade) {
        if (dead) return;
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

  /* ---- the ticker ---- */
  function lines(o) {
    const name = String(o.name || '').trim().toUpperCase();
    return [
      name ? 'IDENTITY — ' + name + ' · VERIFIED' : 'IDENTITY — CONFIRMED',
      'RECONSTRUCTING BRAIN MAP — ' + (o.nodes || 0) + ' NODES ONLINE',
      'PRIMING FORECASTS',
      'LISTENING SYSTEMS — ONLINE',
      'GUARDIAN WATCH — ARMED',
      'ALL SYSTEMS — READY TO SAVE THE WORLD.',
    ];
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
        el.play().catch(() => {});
        ramp(0.55, 1.2, true);
      },
      pads() { if (understudy) understudy.pads(); },  // a produced track carries its own build
      lift() { if (understudy) understudy.lift(); },
      duck() {
        ducked = true;
        if (understudy) return understudy.duck();
        ramp(0.14, 0.45);
      },
      swell() {
        ducked = false;
        if (understudy) return understudy.swell();
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
    const score = (trackUrl && makeFileScore(trackUrl)) || makeScore();
    current = score;
    if (score) score.start();

    const veil = document.createElement('div');
    veil.id = 'boot-veil';
    veil.style.cssText =
      'position:fixed;inset:0;z-index:8;cursor:pointer;' +
      'background:radial-gradient(ellipse at 50% 42%,rgba(2,10,16,0.28) 0%,rgba(2,8,14,0.78) 100%);' +
      'opacity:0;transition:opacity 0.45s ease;display:flex;align-items:flex-end;justify-content:center';
    const col = document.createElement('div');
    col.style.cssText =
      'margin-bottom:16vh;font-family:Rajdhani,monospace,sans-serif;font-size:14px;' +
      'letter-spacing:0.22em;color:#3fd9ff;min-width:min(560px,86vw);max-width:86vw;' +
      'text-shadow:0 0 12px rgba(63,217,255,0.45)';
    veil.appendChild(col);
    document.body.appendChild(veil);
    requestAnimationFrame(() => { veil.style.opacity = '1'; });

    const LINES = lines(opts);
    let skipped = false;
    let finished = false;  // guards late speak-callbacks: after the montage
    const timers = [];     // hands off, its swell must never undo the duck
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));

    // Her line rides the intro; the score breathes down while she speaks.
    if (opts.speak && opts.welcome) {
      later(() => {
        if (skipped) return;
        if (score) score.duck();
        opts.speak(opts.welcome, () => {
          if (score && !skipped && !finished) score.swell();
        });
      }, 700);
    }

    function addLine(text, isLast) {
      const p = document.createElement('div');
      p.style.cssText = 'margin:7px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
        (isLast ? 'color:#eaf6fb;font-size:15px;text-shadow:0 0 16px rgba(63,217,255,0.8)' : '');
      col.appendChild(p);
      const full = '▸ ' + text;
      let i = 0;
      (function type() {
        if (skipped) { p.textContent = full + (isLast ? '' : '  ✓'); return; }
        p.textContent = full.slice(0, ++i) + '█';
        if (i < full.length) timers.push(setTimeout(type, 14));
        else p.textContent = full + (isLast ? '' : '  ✓');
      })();
    }

    return new Promise(resolve => {
      let settled = false;
      const finish = quick => {
        if (settled) return;
        settled = true;
        finished = true;
        timers.forEach(clearTimeout);
        if (score) score.lift();
        veil.style.opacity = '0';
        setTimeout(() => { veil.remove(); resolve(); }, quick ? 250 : 700);
      };

      LINES.forEach((text, n) => {
        const isLast = n === LINES.length - 1;
        later(() => {
          addLine(text, isLast);
          if (n === 2 && score) score.pads();       // the build begins
          if (isLast) {
            if (score) score.lift();                 // the drop lands with it
            later(() => finish(false), 1700);
          }
        }, 550 + n * 1150);
      });

      veil.addEventListener('pointerdown', () => {   // impatience is allowed
        skipped = true;
        // Complete any line frozen mid-type (its next timer tick is about to
        // be cleared), THEN backfill the not-yet-started ones.
        Array.prototype.forEach.call(col.children, (elDiv, i) => {
          elDiv.textContent = '▸ ' + LINES[i] + (i === LINES.length - 1 ? '' : '  ✓');
        });
        LINES.slice(col.childElementCount).forEach((t, i, arr) =>
          addLine(t, i === arr.length - 1));
        finish(true);
      }, { once: true });
    });
  }

  window.VERA_BOOT = {
    play,
    duck() { if (current) current.duck(); },
    stop(fade) { if (current) { current.stop(fade); current = null; } },
  };
})();
