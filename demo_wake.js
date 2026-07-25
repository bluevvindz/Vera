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

      return {
        pause: stop,
        arm,  // entry gate arms listening without a chip click
        resume() {
          paused = false;
          if (!enabled) return;
          chip.style.display = '';  // wake hid it — always-on means it comes back
          chip.textContent = '◉ Listening — say “Hey Vera”';
          chip.classList.add('armed');
          listen();
        },
      };
    },
  };
})();
