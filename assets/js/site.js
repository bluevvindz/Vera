/* V.E.R.A. — site behaviour. No dependencies. Every module is a no-op when its elements are absent. */
(() => {
  'use strict';

  // The head script hides reveal targets under html.js, then un-hides everything
  // after 2.5 s unless this flag is set, so a failed load never leaves the page blank.
  window.__veraReady = true;
  const root = document.documentElement;
  root.classList.add('js');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- Header: glass once the page scrolls ---------- */
  function header() {
    const sentinel = $('.top-sentinel');
    if (!sentinel || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(([e]) => root.classList.toggle('is-scrolled', !e.isIntersecting)).observe(sentinel);
  }

  /* ---------- Mobile menu ---------- */
  function menu() {
    const btn = $('.menu-btn');
    const sheet = $('#sheet');
    if (!btn || !sheet) return;
    sheet.inert = true;
    const set = (open) => {
      root.classList.toggle('menu-open', open);
      btn.setAttribute('aria-expanded', String(open));
      const label = btn.querySelector('span:last-child');
      if (label) label.textContent = open ? 'Close' : 'Menu';
      sheet.inert = !open;
      if (open) sheet.focus({ preventScroll: true });
    };
    btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
    sheet.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && root.classList.contains('menu-open')) { set(false); btn.focus(); }
    });
    window.matchMedia('(min-width: 901px)').addEventListener('change', (m) => { if (m.matches) set(false); });
  }

  /* ---------- Reveals ---------- */
  function reveals() {
    const els = $$('[data-reveal], [data-finale]');
    if (!els.length) return;
    if (reduced || !('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- Evening timeline: the rail draws as you scroll ---------- */
  function timeline() {
    const list = $('[data-timeline]');
    if (!list) return;
    const beats = $$('.beat', list);
    let ticking = false;
    const update = () => {
      ticking = false;
      const r = list.getBoundingClientRect();
      const mid = window.innerHeight * 0.55;
      list.style.setProperty('--p', clamp((mid - r.top) / r.height, 0, 1).toFixed(4));
      beats.forEach((b) => b.classList.toggle('is-now', b.getBoundingClientRect().top < mid));
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  /* ---------- Lazy video loops ---------- */
  function videos() {
    const vids = $$('video[data-src]');
    if (!vids.length || reduced || saveData || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(({ target: v, isIntersecting }) => {
        if (isIntersecting) {
          if (!v.src) { v.src = v.dataset.src; v.addEventListener('playing', () => v.classList.add('is-playing'), { once: true }); }
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
        } else if (!v.paused) {
          v.pause();
        }
      });
    }, { rootMargin: '200px 0px' });
    vids.forEach((v) => io.observe(v));
  }

  /* ---------- Her presence: a constellation ring that leans toward you and moves with her voice ---------- */
  const voice = { level: 0 };
  const presences = [];

  function makeSprite(size, rgb) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(0.25, `rgba(${rgb},0.55)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  function Presence(canvas, mode) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const small = window.matchMedia('(max-width: 760px)').matches;
    const cfg = {
      hero: { ring: small ? 460 : 940, stars: small ? 90 : 190, cx: 0.75, cy: 0.5, r: 0.19, intro: true },
      voice: { ring: small ? 380 : 640, stars: 26, cx: 0.5, cy: 0.5, r: 0.36, intro: false },
      lost: { ring: 160, stars: small ? 120 : 260, cx: 0.78, cy: 0.3, r: 0.07, intro: true },
    }[mode] || {};
    const sprite = makeSprite(32, '160,232,244');
    const spriteWarm = makeSprite(32, '255,236,214');
    let W = 0, H = 0, R = 0, CX = 0, CY = 0, dpr = 1;
    let visible = true, raf = 0, last = 0, t0 = 0;
    const ptr = { x: -9999, y: -9999, tx: -9999, ty: -9999, on: false };
    const rand = (a, b) => a + Math.random() * (b - a);
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

    // Three layers: a dense bright band, a fainter halo of dust, and a few named stars
    // that share one speed so the constellation lines between them hold their shape.
    const ring = Array.from({ length: cfg.ring }, (_, i) => {
      const r = Math.random();
      const kind = r < 0.07 ? 'star' : r < 0.72 ? 'band' : 'dust';
      return {
        kind,
        a: rand(0, Math.PI * 2),
        w: kind === 'star' ? 0.03 : kind === 'band' ? rand(0.022, 0.06) : rand(0.008, 0.028),
        off: gauss() * (kind === 'dust' ? 0.17 : kind === 'star' ? 0.045 : 0.032),
        k: rand(0.4, 1.4),
        s: kind === 'star' ? rand(2.4, 3.8) : kind === 'band' ? rand(0.8, 1.7) : rand(0.5, 1.1),
        al: kind === 'dust' ? rand(0.16, 0.5) : rand(0.5, 1),
        tw: rand(0.6, 2.2),
        ph: rand(0, Math.PI * 2),
        warm: Math.random() < 0.06,
        sx: rand(-0.2, 1.2), sy: rand(-0.2, 1.2),
        x: 0, y: 0, alpha: 0,
      };
    });
    const named = ring.filter((p) => p.kind === 'star');
    const links = [];
    named.forEach((p, i) => named.slice(i + 1).forEach((q) => {
      let d = Math.abs(p.a - q.a); d = Math.min(d, Math.PI * 2 - d);
      if (d < 0.42 && links.length < named.length * 1.4) links.push([p, q]);
    }));
    const stars = Array.from({ length: cfg.stars }, () => ({
      x: Math.random(), y: Math.random(), s: Math.random() < 0.08 ? 1.6 : rand(0.5, 1.1),
      al: rand(0.15, 0.7), tw: rand(0.3, 1.4), ph: rand(0, 6.28), d: rand(0.2, 1), warm: Math.random() < 0.18,
    }));

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (mode === 'hero' && window.matchMedia('(max-width: 900px)').matches) {
        const header = parseFloat(getComputedStyle(root).getPropertyValue('--header-h')) || 64;
        R = Math.min(W * 0.26, 150);
        CX = W * 0.5; CY = header + 18 + R;
      } else if (mode === 'hero') {
        R = Math.min(Math.max(Math.min(W, H) * 0.3, 200), W * cfg.r * 1.45, 330);
        CX = W * cfg.cx; CY = H * cfg.cy;
      } else {
        R = Math.min(W, H) * cfg.r;
        CX = W * cfg.cx; CY = H * cfg.cy;
      }
      // Let CSS place things (her spoken caption) inside the ring.
      const host = canvas.closest('section');
      if (host) {
        host.style.setProperty('--ring-x', `${Math.round(CX)}px`);
        host.style.setProperty('--ring-y', `${Math.round(CY)}px`);
        host.style.setProperty('--ring-r', `${Math.round(R)}px`);
      }
    }

    function draw(time) {
      const t = time / 1000;
      const lvl = voice.level;
      const intro = cfg.intro && !reduced ? Math.min(1, (time - t0) / 1900) : 1;
      const e = 1 - Math.pow(1 - intro, 3);
      ctx.clearRect(0, 0, W, H);

      // Pointer, eased.
      ptr.x += (ptr.tx - ptr.x) * 0.08;
      ptr.y += (ptr.ty - ptr.y) * 0.08;
      const px = ptr.on ? (ptr.x - CX) / W : 0;
      const py = ptr.on ? (ptr.y - CY) / H : 0;

      // Background stars (slow twinkle, a touch of parallax).
      for (const s of stars) {
        const a = s.al * (0.55 + 0.45 * Math.sin(t * s.tw + s.ph)) * (0.4 + 0.6 * e);
        const x = s.x * W - px * 14 * s.d;
        const y = s.y * H - py * 14 * s.d;
        if (s.s > 1.2) {
          ctx.globalAlpha = a;
          ctx.drawImage(s.warm ? spriteWarm : sprite, x - 4, y - 4, 8, 8);
        } else {
          ctx.globalAlpha = a;
          ctx.fillStyle = s.warm ? '#ffe9d2' : '#cfe9f0';
          ctx.fillRect(x, y, s.s, s.s);
        }
      }

      const cx = CX + px * 18;
      const cy = CY + py * 18;
      const breathe = reduced ? 0 : Math.sin(t * 1.25) * 0.012;
      const rr = R * (1 + breathe + lvl * 0.07);

      // Inner glow + halo (layered strokes, never shadowBlur).
      const glow = ctx.createRadialGradient(cx, cy, rr * 0.2, cx, cy, rr * 1.35);
      glow.addColorStop(0, `rgba(127,219,234,${(0.012 + lvl * 0.06) * e})`);
      glow.addColorStop(0.72, `rgba(127,219,234,${(0.05 + lvl * 0.1) * e})`);
      glow.addColorStop(0.86, `rgba(127,219,234,${(0.018 + lvl * 0.05) * e})`);
      glow.addColorStop(1, 'rgba(127,219,234,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      ctx.fillRect(cx - rr * 1.4, cy - rr * 1.4, rr * 2.8, rr * 2.8);
      ctx.lineWidth = 16;
      ctx.strokeStyle = `rgba(127,219,234,${(0.035 + lvl * 0.08) * e})`;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(127,219,234,${(0.07 + lvl * 0.12) * e})`;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(190,240,247,${(0.22 + lvl * 0.4) * e})`;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();

      // The ring of stars.
      const swirl = reduced ? 0 : t * (1 + lvl * 2.2);
      const lean = mode === 'voice' ? 0 : 26;
      for (const p of ring) {
        const ang = p.a + swirl * p.w;
        const wob = lvl * Math.sin(ang * 5 + t * 6 * p.k) * 0.045;
        const rad = rr * (1 + p.off * (1 + lvl * 1.05) + wob);
        let x = cx + Math.cos(ang) * rad;
        let y = cy + Math.sin(ang) * rad;
        if (ptr.on && lean) {
          const dx = ptr.x - x, dy = ptr.y - y;
          const d = Math.hypot(dx, dy);
          if (d < 190 && d > 0.1) { const f = Math.pow(1 - d / 190, 2) * lean; x += (dx / d) * f; y += (dy / d) * f; }
        }
        if (e < 1) { x = p.sx * W + (x - p.sx * W) * e; y = p.sy * H + (y - p.sy * H) * e; }
        const a = clamp(p.al * (0.62 + 0.38 * Math.sin(t * p.tw + p.ph)) * (1 + lvl * 0.9), 0, 1);
        const s = p.s * (1 + lvl * 0.7);
        p.x = x; p.y = y; p.alpha = a;
        ctx.globalAlpha = a;
        if (p.kind === 'star' || s > 1.9) {
          ctx.drawImage(p.warm ? spriteWarm : sprite, x - s * 2.4, y - s * 2.4, s * 4.8, s * 4.8);
        } else {
          ctx.fillStyle = p.warm ? '#ffe2c2' : '#c4f1f8';
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }

      // Constellation lines between neighbouring named stars.
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = '#aeeaf3';
      for (const [p, q] of links) {
        ctx.globalAlpha = Math.min(p.alpha, q.alpha) * (0.16 + lvl * 0.3) * e;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function loop(time) {
      raf = 0;
      if (!visible || document.hidden) return;
      const small = W < 761;
      if (!small || time - last > 30) { last = time; draw(time); }
      raf = requestAnimationFrame(loop);
    }
    function kick() { if (!raf && !reduced) raf = requestAnimationFrame(loop); }

    resize();
    t0 = performance.now();
    if (reduced) { requestAnimationFrame((ts) => { t0 = ts - 5000; draw(ts); }); }
    else kick();

    const host = canvas.closest('section') || canvas.parentElement;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) kick(); }).observe(canvas);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { resize(); if (reduced) draw(performance.now()); }, 120); }, { passive: true });
    host.addEventListener('pointermove', (ev) => {
      const r = canvas.getBoundingClientRect();
      ptr.tx = ev.clientX - r.left; ptr.ty = ev.clientY - r.top;
      if (!ptr.on) { ptr.x = ptr.tx; ptr.y = ptr.ty; ptr.on = true; }
    }, { passive: true });
    host.addEventListener('pointerleave', () => { ptr.on = false; }, { passive: true });

    return { redraw: () => { if (reduced) draw(performance.now()); else kick(); } };
  }

  function presence() {
    $$('canvas[data-presence]').forEach((c) => {
      const p = Presence(c, c.dataset.presence);
      if (p) presences.push(p);
    });
  }

  /* ---------- Her voice: real recordings, and the rings listen ---------- */
  function voicePlayer() {
    const cards = $$('[data-voice]');
    const heroBtn = $('[data-voice-btn]');
    if (!cards.length && !heroBtn) return;
    const section = $('[data-voice-section]');
    const state = $('[data-voice-state]');
    const caption = $('[data-caption]');

    // Split each transcript into words once, weighted by length for timing.
    const words = new Map();
    const splitInto = (el) => {
      const text = el.textContent.trim();
      el.textContent = '';
      const spans = [];
      let total = 0;
      text.split(/\s+/).forEach((wd, i) => {
        if (i) el.appendChild(document.createTextNode(' '));
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = wd;
        el.appendChild(s);
        total += wd.length + 1;
        spans.push({ el: s, end: total });
      });
      spans.forEach((w) => { w.end /= total; });
      return spans;
    };
    cards.forEach((c) => { const line = $('[data-words]', c); if (line) words.set(c.dataset.voice, { card: c, text: line.textContent.trim(), spans: splitInto(line) }); });

    let audio = null, actx = null, analyser = null, buf = null;
    let current = null, rafId = 0, captionSpans = null;

    // iPhones mute Web Audio when the ring/silent switch is on, but not a plain <audio>
    // element. So on iOS we skip the analyser and animate the rings from a speech-like
    // envelope instead; everywhere else the rings follow her real waveform.
    const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    function ensureAudio() {
      if (!audio) { audio = new Audio(); audio.preload = 'auto'; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!actx && AC && !iOS) {
        try {
          actx = new AC();
          const src = actx.createMediaElementSource(audio);
          analyser = actx.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.6;
          buf = new Uint8Array(analyser.fftSize);
          src.connect(analyser);
          analyser.connect(actx.destination);
        } catch (err) { actx = null; analyser = null; }
      }
      if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
    }

    function setPressed(key, on) {
      const w = words.get(key);
      if (w) w.card.setAttribute('aria-pressed', String(on));
      if (heroBtn && heroBtn.dataset.voiceBtn === key) heroBtn.setAttribute('aria-pressed', String(on));
    }

    function paint(progress) {
      const w = words.get(current);
      const mark = (list) => list && list.forEach((s) => s.el.classList.toggle('is-said', s.end <= progress + 0.06));
      if (w) {
        mark(w.spans);
        const bar = $('.voice-card__bar', w.card);
        if (bar) bar.style.transform = `scaleX(${progress.toFixed(4)})`;
      }
      mark(captionSpans);
    }

    function tick() {
      rafId = 0;
      if (!current || !audio) return;
      if (!reduced) {
        let target;
        if (analyser) {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
          target = Math.min(1, Math.sqrt(sum / buf.length) * 4.2);
        } else {
          const s = audio.currentTime;
          target = audio.paused ? 0 : 0.22 + 0.3 * Math.abs(Math.sin(s * 7.1)) * (0.65 + 0.35 * Math.sin(s * 2.3 + 1));
        }
        voice.level += (target - voice.level) * (target > voice.level ? 0.4 : 0.1);
      }
      const d = audio.duration || 1;
      paint(clamp(audio.currentTime / d, 0, 1));
      rafId = requestAnimationFrame(tick);
    }

    function settle() {
      const fade = () => {
        voice.level *= 0.9;
        if (voice.level > 0.01 && !current) requestAnimationFrame(fade);
        else if (!current) voice.level = 0;
      };
      requestAnimationFrame(fade);
    }

    function stop() {
      if (!current) return;
      const key = current;
      current = null;
      if (audio) audio.pause();
      setPressed(key, false);
      const w = words.get(key);
      if (w) {
        w.spans.forEach((s) => s.el.classList.remove('is-said'));
        const bar = $('.voice-card__bar', w.card);
        if (bar) bar.style.transform = 'scaleX(0)';
      }
      if (section) section.classList.remove('is-playing');
      if (state) state.textContent = 'Press play';
      if (caption) setTimeout(() => { if (!current) { caption.textContent = ''; captionSpans = null; } }, 1600);
      settle();
    }

    function play(key, src, withCaption) {
      if (current === key) { stop(); return; }
      stop();
      ensureAudio();
      current = key;
      setPressed(key, true);
      if (section) section.classList.add('is-playing');
      if (state) state.textContent = 'Speaking';
      if (caption && withCaption) {
        const w = words.get(key);
        caption.textContent = w ? w.text : '';
        captionSpans = splitInto(caption);
      }
      audio.src = src;
      audio.currentTime = 0;
      audio.onended = () => { if (current === key) { paint(1); stop(); } };
      audio.onerror = () => fail(key);
      const p = audio.play();
      if (p && p.catch) p.catch(() => fail(key));
      if (!rafId) rafId = requestAnimationFrame(tick);
    }

    function fail(key) {
      const w = words.get(key);
      stop();
      if (w && !$('.voice-card__err', w.card)) {
        const m = document.createElement('span');
        m.className = 'voice-card__err';
        m.textContent = 'That clip didn’t play. Check your sound, then try again.';
        w.card.appendChild(m);
      }
    }

    cards.forEach((c) => c.addEventListener('click', () => play(c.dataset.voice, c.dataset.src, false)));
    if (heroBtn) {
      heroBtn.addEventListener('click', () => {
        const key = heroBtn.dataset.voiceBtn;
        const w = words.get(key);
        play(key, w ? w.card.dataset.src : `assets/voice/${key}.mp3`, true);
      });
    }
  }

  /* ---------- Founders list ---------- */
  function waitlist() {
    $$('form[data-waitlist]').forEach((form) => {
      const input = $('input[type="email"]', form);
      const btn = $('button[type="submit"]', form);
      const status = $('.waitlist__status', form);
      const endpoint = form.dataset.endpoint;
      if (!input || !btn || !status || !endpoint) return;
      const label = btn.textContent;
      const say = (msg, tone) => { status.textContent = msg; status.dataset.tone = tone || ''; };
      let joined = false;
      try { joined = localStorage.getItem('vera.joined') === '1'; } catch (e) { /* storage blocked */ }
      if (joined) { form.classList.add('is-done'); say('You’re on the founders list. We’ll email you when there’s news.', 'ok'); }

      input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); if (status.dataset.tone === 'err') say(''); });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = input.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          input.setAttribute('aria-invalid', 'true');
          say('Enter your full email address, like name@example.com.', 'err');
          input.focus();
          return;
        }
        if (endpoint === 'preview') {
          say('This is a private preview, so nothing was saved. Signups work on veraisreal.com.', 'ok');
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Saving…';
        say('');
        const ctrl = 'AbortController' in window ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 12000) : 0;
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email }),
            signal: ctrl ? ctrl.signal : undefined,
          });
          if (res.ok) {
            form.classList.add('is-done');
            say('You’re on the founders list. We’ll email you when there’s news.', 'ok');
            try { localStorage.setItem('vera.joined', '1'); } catch (err) { /* storage blocked */ }
          } else if (res.status === 400) {
            input.setAttribute('aria-invalid', 'true');
            say('That email didn’t look right. Check it and try again.', 'err');
          } else if (res.status === 429) {
            say('Too many tries from this network. Try again in a little while.', 'err');
          } else {
            say('We couldn’t save that just now. Try again, or email vera@veraisreal.com.', 'err');
          }
        } catch (err) {
          say('That took too long. Check your connection and try again.', 'err');
        } finally {
          clearTimeout(timer);
          btn.disabled = false;
          btn.textContent = label;
        }
      });
    });
  }

  /* ---------- Privacy page: highlight the section you're reading ---------- */
  function toc() {
    const links = $$('.doc__toc a[href^="#"]');
    if (!links.length) return;
    const sections = links.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
    let ticking = false;
    const update = () => {
      ticking = false;
      const line = window.innerHeight * 0.35;
      let current = -1;
      sections.forEach((s, i) => { if (s.getBoundingClientRect().top <= line) current = i; });
      links.forEach((a, i) => a.classList.toggle('is-active', i === current));
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  const start = () => { header(); menu(); reveals(); timeline(); videos(); presence(); voicePlayer(); waitlist(); toc(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
