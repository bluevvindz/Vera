/* V.E.R.A. demo wake word — "say Vera" activation (public pages only).
   One click arms the mic (browser permission), then continuous recognition
   listens for her name. Chrome/Edge only; pages keep their buttons as the
   universal path. window.VERA_WAKE.init({onWake}) → controller {pause, resume}. */
(function () {
  'use strict';
  if (!new URLSearchParams(location.search).has('demo')) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;  // no chip where it can't work

  const NAME = /\b(vera|veera|vira|viera|vieira)\b/i;

  window.VERA_WAKE = {
    NAME,  // shared so speakers can test their own lines against the hotword
    init({ onWake }) {
      const css = document.createElement('style');
      css.textContent = `
        #wake-chip { position: fixed; top: 22px; left: 50%; transform: translateX(-50%);
          z-index: 7; background: rgba(8,22,34,0.85); border: 1px solid rgba(63,217,255,0.5);
          border-radius: 999px; color: #3fd9ff; font-family: 'Rajdhani', sans-serif;
          font-size: 12px; letter-spacing: 0.3em; text-transform: uppercase;
          padding: 8px 20px; cursor: pointer; backdrop-filter: blur(8px); }
        #wake-chip.armed { animation: wake-pulse 2.2s ease-in-out infinite; }
        @media (max-width: 640px) {
          #wake-chip { top: 42px; font-size: 10px; letter-spacing: 0.16em;
            padding: 6px 12px; max-width: 76vw; white-space: nowrap;
            overflow: hidden; text-overflow: ellipsis; backdrop-filter: none;
            background: rgba(8, 22, 34, 0.95); } }
        @keyframes wake-pulse {
          0%, 100% { box-shadow: 0 0 12px rgba(63,217,255,0.25); }
          50% { box-shadow: 0 0 30px rgba(63,217,255,0.6); } }`;
      document.head.appendChild(css);

      const chip = document.createElement('button');
      chip.id = 'wake-chip';
      chip.textContent = '🎙 Demo mode — click, then say “Hey Vera”';
      document.body.appendChild(chip);

      let rec = null;
      let enabled = false;
      let paused = false;
      let pendingIdx = null;   // result index where her name was heard
      let pendingText = '';
      let pendingTimer = null;
      let fired = false;
      let duckPaused = false;  // set ONLY when the duck-guard itself pauses a live ear

      function fire(transcript) {
        // One breath: "Vera, what's the weather" → onWake("what's the weather").
        if (fired) return;
        const parts = String(transcript || '').split(NAME);
        if (parts.length === 1) {
          // An interim heard her name but the final rendition didn't — false
          // alarm ("very good" → "vera good" → "very good"). Keep listening.
          if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
          pendingIdx = null; pendingText = '';
          if (!rec) setTimeout(listen, 300);
          return;
        }
        fired = true;
        if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
        pendingIdx = null;
        stop();
        chip.style.display = 'none';
        const cmd = parts[parts.length - 1].replace(/^[\s,.!?]+/, '').trim();
        onWake(cmd);
      }

      function listen() {
        if (!enabled || paused || rec) return;
        if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
        pendingIdx = null; pendingText = ''; fired = false;
        rec = new SR();
        rec.lang = 'en-US';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = e => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (pendingIdx === null && NAME.test(e.results[i][0].transcript)) {
              pendingIdx = i;  // her name — now catch the rest of the breath
              pendingTimer = setTimeout(() => fire(pendingText), 2600);
            }
          }
          if (pendingIdx !== null) {
            pendingText = '';
            for (let i = pendingIdx; i < e.results.length; i++)
              pendingText += (pendingText ? ' ' : '') + e.results[i][0].transcript;
            if (e.results[e.results.length - 1].isFinal) fire(pendingText);
          }
        };
        rec.onend = () => {
          rec = null;
          if (pendingIdx !== null) fire(pendingText);  // recognizer died mid-breath: use what we heard
          else setTimeout(listen, 300);                // keep-alive
        };
        rec.onerror = ev => {
          rec = null;
          if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
            enabled = false;
            chip.textContent = '🎙 Mic blocked — use the buttons below';
            chip.classList.remove('armed');
          } else setTimeout(listen, 800);
        };
        try { rec.start(); } catch { rec = null; }
      }
      function stop() {
        duckPaused = false;  // any deliberate pause/stop revokes the duck-guard's claim
        paused = true;
        fired = true;  // disarm the in-flight breath — no late fire from timers or flushed results
        if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
        pendingIdx = null; pendingText = '';
        if (enabled) chip.style.display = 'none';  // never advertise a dead hotword
        if (rec) { try { rec.onresult = rec.onerror = rec.onend = null; rec.stop(); } catch {} rec = null; }
      }
      function arm() {
        if (enabled) return;
        enabled = true; paused = false;
        chip.textContent = '◉ Listening — say “Hey Vera”';
        chip.classList.add('armed');
        listen();
      }

      chip.onclick = () => {
        if (enabled) { stop(); chip.style.display = 'none'; onWake(); return; }  // click = wake too
        arm();
      };

      // Android ducks media system-wide while recognition runs — so the
      // wake ear yields whenever her voice is on the speakers, and takes
      // the ear back a beat after she finishes. iPhones (no SR) unaffected.
      // OWNERSHIP RULE: the guard resumes ONLY a listener it ducked itself.
      // Interview / chat-capture / entry pauses clear duckPaused (stop()
      // does that) and must NEVER be resumed from here.
      const duck = () => {
        // Live ear right now, or a pause the guard already owns (a pre-play
        // duck() followed by the 'play' event must not drop its own claim).
        const wasLive = (enabled && !paused) || duckPaused;
        stop();               // clears duckPaused
        duckPaused = wasLive; // reclaim only when the guard ducked a live ear
        if (wasLive) {
          // No chip flicker — but the ear IS off while she speaks, so the
          // chip must say so instead of advertising a deaf hotword. The
          // guard's back()/resume path restores the armed text.
          chip.style.display = '';
          chip.textContent = '◈ Speaking — one moment';
          chip.classList.remove('armed');
        }
      };
      const attachDuckGuard = () => {
        const el = window.VERA_AUDIO_EL;
        if (!el || el._wakeDuckGuard) return;
        el._wakeDuckGuard = true;
        el.addEventListener('play', duck);
        const back = () => setTimeout(() => {
          if (!duckPaused) return;              // not our pause — interview/chat owns it
          // Still playing — its own 'ended' re-calls us. (el.error escapes
          // this gate: a mid-play media error stops sound with paused still
          // false, and no further event would ever come.)
          if (!el.paused && !el.ended && !el.error) return;
          duckPaused = false;
          if (enabled) ctl.resume();
        }, 300);
        el.addEventListener('ended', back);
        el.addEventListener('pause', back);
        el.addEventListener('error', back);  // a media error fires neither 'ended' nor 'pause'
      };
      const ctl = {
        pause: stop,
        arm,  // entry gate arms listening without a chip click
        duck,                          // pre-play hook: duck BEFORE play() — zero ducked words
        duckAttach: attachDuckGuard,   // pages call this the moment VERA_AUDIO_EL is born
        resume() {
          duckPaused = false;  // an explicit resume supersedes any pending duck-return
          paused = false;
          if (!enabled) return;
          chip.style.display = '';  // wake hid it — always-on means it comes back
          chip.textContent = '◉ Listening — say “Hey Vera”';
          chip.classList.add('armed');
          listen();
        },
      };
      attachDuckGuard();                   // attach NOW if the element already exists
      setInterval(attachDuckGuard, 1500);  // safety net for late/foreign creations
      return ctl;
    },
  };
})();
