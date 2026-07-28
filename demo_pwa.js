/* V.E.R.A. public site — service worker + EARLY ACCESS layer (all pages).
   The service worker stays (offline shell + cached voice = smooth repeats).
   The old install chip is gone by design: the keep-her moment now captures
   an EMAIL for the waitlist instead — the moment of delight builds the list.
   window.VERA_INSTALL.offer() keeps its name so every caller still works;
   what it offers changed. Never loaded in the personal HUD. */
(function () {
  'use strict';
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('sw.js').catch(() => {});

  const API = (window.DEMO_API || '').trim();
  if (!API) return;  // no worker, no list — never show a dead form
  let joined = false;
  try { joined = !!localStorage.getItem('vera_joined'); } catch {}
  if (joined) return;  // already on the list: never ask twice

  const css = document.createElement('style');
  css.textContent = `
    #join-chip { position: fixed; left: 50%; transform: translateX(-50%);
      bottom: 14px; z-index: 6; display: none; align-items: center; gap: 6px;
      background: rgba(8,22,34,0.92); border: 1px solid rgba(63,217,255,0.4);
      border-radius: 999px; color: #3fd9ff; font-family: 'Rajdhani', sans-serif;
      font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase;
      padding: 8px 16px; box-shadow: 0 0 18px rgba(63,217,255,0.15); }
    #join-chip button { background: none; border: none; color: inherit;
      font: inherit; letter-spacing: inherit; text-transform: inherit;
      cursor: pointer; padding: 0; }
    #join-chip input { display: none; background: none; border: none;
      outline: none; color: #eaf6fb; font-family: inherit; font-size: 13px;
      letter-spacing: 0.04em; text-transform: none; width: 210px; max-width: 46vw; }
    #join-chip.open input { display: block; }
    #join-chip.open #join-go { color: #3fffc2; }
    @media (max-width: 640px) {
      #join-chip { bottom: auto; top: 76px; max-width: 92vw; } }`;
  document.head.appendChild(css);

  const chip = document.createElement('div');
  chip.id = 'join-chip';
  const label = document.createElement('button');
  label.id = 'join-go'; label.type = 'button';
  label.textContent = '✦ Early access — the full her';
  const em = document.createElement('input');
  em.type = 'email'; em.placeholder = 'your email'; em.maxLength = 120;
  chip.append(label, em);
  document.body.appendChild(chip);

  const settle = msg => {
    chip.classList.remove('open');
    chip.replaceChildren(document.createTextNode(msg));
    setTimeout(() => chip.remove(), 6000);
  };

  label.onclick = async () => {
    if (!chip.classList.contains('open')) {  // first tap opens the field
      chip.classList.add('open');
      em.focus();
      return;
    }
    const v = em.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { em.focus(); return; }
    label.textContent = '…';
    try {
      const r = await fetch(API + '/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: v }),
      });
      if (r.ok) {
        try { localStorage.setItem('vera_joined', '1'); } catch {}
        settle('✦ You’re on the list.');
      } else if (r.status === 501) settle('✦ Early access opens soon.');
      else label.textContent = 'Retry';
    } catch { label.textContent = 'Retry'; }
  };
  em.addEventListener('keydown', e => { if (e.key === 'Enter') label.onclick(); });

  function showChip() {
    if (!chip.isConnected) return;
    if (document.getElementById('join-box')) return;  // map finale asks already
    chip.style.display = 'flex';
  }

  // Offered when they've just been delighted — never at the door.
  window.VERA_INSTALL = { offer: showChip };
})();
