/* V.E.R.A. public site — PWA install layer (all public pages, incl. landing).
   Registers the service worker (offline shell + cached voice lines) and offers
   a tasteful install chip: Chromium fires beforeinstallprompt → real prompt;
   iOS has no prompt API → a one-line Share → Add to Home Screen hint.
   Never loaded in the personal HUD — this file ships only in the demo build. */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});

  // Already running as an installed app? Nothing to sell.
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;

  const small = matchMedia('(max-width: 640px)').matches;
  const onDemoPage = !!(document.getElementById('demo-talk') || document.getElementById('map-talk'));

  const css = document.createElement('style');
  css.textContent = `
    #pwa-install { position: fixed; left: 50%; transform: translateX(-50%);
      bottom: 14px; z-index: 6;
      display: none; background: rgba(8,22,34,0.92); border: 1px solid rgba(63,217,255,0.4);
      border-radius: 999px; color: #3fd9ff; font-family: 'Rajdhani', sans-serif;
      font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase;
      padding: 8px 16px; cursor: pointer;
      box-shadow: 0 0 18px rgba(63,217,255,0.15); }
    #pwa-install:hover { background: rgba(63,217,255,0.12); }
    @media (max-width: 640px) {
      #pwa-install { bottom: auto; top: 76px; max-width: 88vw; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis; } }`;
  document.head.appendChild(css);

  const btn = document.createElement('button');
  btn.id = 'pwa-install'; btn.type = 'button';
  btn.textContent = '⬇ Install the app — keep her';
  document.body.appendChild(btn);

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) btn.textContent = '⬇ Keep her: Share → Add to Home Screen';

  function showBtn() {
    if (!btn.isConnected) return;
    btn.style.display = 'block';
    if (small) setTimeout(() => { if (btn.isConnected) btn.remove(); }, 20000);
  }

  let deferred = null;
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    // Desktop and the landing page offer immediately; phones wait for the
    // delight moment (reel finale / Seed planted) via VERA_INSTALL.offer().
    if (!(small && onDemoPage)) showBtn();
  });
  if (isIOS && !(small && onDemoPage)) showBtn();

  btn.onclick = async () => {
    if (deferred) {
      const p = deferred; deferred = null;
      btn.style.display = 'none';
      try { p.prompt(); await p.userChoice; } catch {}
    } else {
      btn.remove();  // iOS hint: dismiss on tap
    }
  };

  // Install is offered when they've just been delighted — never at the door.
  window.VERA_INSTALL = {
    offer() { if (deferred || isIOS) showBtn(); },
  };
})();
