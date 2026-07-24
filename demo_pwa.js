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
  // Phone screens with a talk bar have no room for the chip — the browser
  // menu still offers Install; the landing page keeps the chip everywhere.
  if (matchMedia('(max-width: 640px)').matches
    && (document.getElementById('demo-talk') || document.getElementById('map-talk'))) return;

  const css = document.createElement('style');
  css.textContent = `
    #pwa-install { position: fixed; left: 50%; transform: translateX(-50%);
      bottom: 14px; z-index: 6;
      display: none; background: rgba(8,22,34,0.88); border: 1px solid rgba(63,217,255,0.4);
      border-radius: 999px; color: #3fd9ff; font-family: 'Rajdhani', sans-serif;
      font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase;
      padding: 8px 16px; cursor: pointer; backdrop-filter: blur(6px);
      box-shadow: 0 0 18px rgba(63,217,255,0.15); }
    #pwa-install:hover { background: rgba(63,217,255,0.12); }`;
  document.head.appendChild(css);

  const btn = document.createElement('button');
  btn.id = 'pwa-install'; btn.type = 'button';
  btn.textContent = '⬇ Install the app';
  document.body.appendChild(btn);

  let deferred = null;
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    btn.style.display = 'block';
  });
  btn.onclick = async () => {
    if (deferred) {
      const p = deferred; deferred = null;
      btn.style.display = 'none';
      try { p.prompt(); await p.userChoice; } catch {}
    } else {
      btn.remove();  // iOS hint: dismiss on tap
    }
  };

  // iOS/iPadOS Safari: no install prompt API exists — offer the manual path.
  // (Modern iPads masquerade as Macs; touch points give them away.)
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    btn.textContent = '⬇ Install: Share → Add to Home Screen';
    btn.style.display = 'block';
    setTimeout(() => { if (!deferred && btn.isConnected) btn.remove(); }, 30000);
  }
})();
