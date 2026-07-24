/* V.E.R.A. demo — the hub act (public reactor page only).
   During the attract reel she "builds a live operations hub from nothing":
   a market feed (CoinGecko, real), a scoreboard (ESPN MLB, real), a vitals
   monitor (simulated, and labeled so), and an uplink log of the actual
   requests flowing. The reel narrates; this module builds and feeds panels.
   If the wires fail (offline, CORS, rate limit) each panel degrades to a
   plausible simulation tagged SIM — the show must go on.
   window.VERA_HUB = { show(name), reset() } — called from the page reel. */
(function () {
  'use strict';
  if (!new URLSearchParams(location.search).has('demo')) return;

  const css = document.createElement('style');
  css.textContent = `
    #hub-dock { position: fixed; right: 18px; top: 118px; z-index: 4;
      display: flex; flex-direction: column; gap: 12px; width: 272px;
      pointer-events: none; }
    .hub-panel { background: rgba(6,16,26,0.86); border: 1px solid rgba(63,217,255,0.35);
      border-radius: 6px; padding: 10px 12px 12px; backdrop-filter: blur(8px);
      box-shadow: 0 0 24px rgba(63,217,255,0.12); font-family: 'Rajdhani', sans-serif;
      color: #cfe4ec; animation: hub-in 0.55s cubic-bezier(0.2, 0.9, 0.3, 1); }
    @keyframes hub-in { from { opacity: 0; transform: translateX(46px) scale(0.96); }
      to { opacity: 1; transform: none; } }
    .hub-panel h4 { margin: 0 0 8px; font-size: 11px; letter-spacing: 0.24em;
      color: #3fd9ff; text-transform: uppercase; display: flex;
      justify-content: space-between; align-items: baseline; }
    .hub-panel h4 .tag { font-size: 9px; letter-spacing: 0.18em; color: rgba(127,184,204,0.6); }
    .hub-panel h4 .tag.live { color: #3fffc2; }
    .hub-row { display: flex; justify-content: space-between; font-size: 13.5px;
      line-height: 1.75; }
    .hub-row .up { color: #3fffc2; } .hub-row .dn { color: #ff5f6b; }
    .hub-row .lbl { color: #9fc3d2; letter-spacing: 0.08em; }
    .hub-sub { font-size: 10.5px; color: rgba(127,184,204,0.6); letter-spacing: 0.08em; }
    #hub-vitals canvas { width: 100%; height: 54px; display: block; margin: 2px 0 6px; }
    #hub-log .hub-line { font-size: 10.5px; line-height: 1.65; color: rgba(159,195,210,0.75);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #hub-log .hub-line b { color: #3fd9ff; font-weight: 500; }
    @media (max-width: 900px) {
      #hub-dock { top: auto; bottom: 152px; left: 8px; right: 8px; width: auto;
        flex-direction: row; overflow-x: auto; pointer-events: auto;
        -webkit-overflow-scrolling: touch; }
      .hub-panel { min-width: 208px; flex: 0 0 auto; } }`;
  document.head.appendChild(css);

  const dock = document.createElement('div');
  dock.id = 'hub-dock';
  document.body.appendChild(dock);

  const timers = [];
  const every = (ms, fn) => { fn(); timers.push(setInterval(fn, ms)); };
  let raf = null;

  function panel(id, title, tag) {
    const div = document.createElement('div');
    div.className = 'hub-panel'; div.id = id;
    const h = document.createElement('h4');
    const t = document.createElement('span'); t.textContent = title;
    const badge = document.createElement('span'); badge.className = 'tag'; badge.textContent = tag;
    h.append(t, badge);
    const body = document.createElement('div');
    div.append(h, body);
    dock.appendChild(div);
    return { body, live(on) { badge.textContent = on ? 'LIVE' : 'SIM'; badge.classList.toggle('live', on); } };
  }
  const row = (parent, lbl, val, cls) => {
    const r = document.createElement('div'); r.className = 'hub-row';
    const a = document.createElement('span'); a.className = 'lbl'; a.textContent = lbl;
    const b = document.createElement('span'); if (cls) b.className = cls; b.textContent = val;
    r.append(a, b); parent.appendChild(r);
  };

  /* ---- uplink log: the real traffic, visibly flowing ---- */
  let logBody = null;
  function log(line) {
    if (!logBody) return;
    const d = document.createElement('div'); d.className = 'hub-line';
    const ts = new Date().toTimeString().slice(0, 8);
    const b = document.createElement('b'); b.textContent = ts + ' ';
    d.appendChild(b); d.appendChild(document.createTextNode(line));
    logBody.prepend(d);
    while (logBody.children.length > 6) logBody.lastChild.remove();
  }
  async function timedFetch(url, name) {
    const t0 = performance.now();
    const r = await fetch(url);
    log(`GET ${name} · ${r.status} · ${Math.round(performance.now() - t0)}ms`);
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }

  /* ---- markets: CoinGecko, no key, CORS-open; SIM drift on failure ---- */
  function showMarkets() {
    const p = panel('hub-markets', 'Markets', 'LIVE');
    const sim = { bitcoin: { usd: 118400, c: 1.8 }, ethereum: { usd: 4120, c: 2.4 }, solana: { usd: 212, c: -1.1 } };
    const NAMES = [['bitcoin', 'BTC'], ['ethereum', 'ETH'], ['solana', 'SOL']];
    const render = (data, live) => {
      p.live(live);
      p.body.replaceChildren();
      for (const [id, sym] of NAMES) {
        const d = data[id]; if (!d || typeof d.usd !== 'number') continue;
        const chg = d.usd_24h_change ?? d.c ?? 0;
        const price = d.usd >= 1000 ? Math.round(d.usd).toLocaleString('en-US') : d.usd.toFixed(2);
        row(p.body, sym, `$${price}  ${chg >= 0 ? '▲' : '▼'}${Math.abs(chg).toFixed(1)}%`, chg >= 0 ? 'up' : 'dn');
      }
    };
    every(30000, async () => {
      try {
        const data = await timedFetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true',
          'coingecko /simple/price');
        render(data, true);
      } catch {
        for (const k in sim) { sim[k].usd *= 1 + (Math.random() - 0.5) * 0.004; sim[k].c += (Math.random() - 0.5) * 0.2; }
        render(sim, false);
        log('coingecko unreachable · simulating');
      }
    });
  }

  /* ---- scoreboard: ESPN public JSON; SIM innings on failure ---- */
  function showScores() {
    const p = panel('hub-scores', 'Scoreboard — MLB', 'LIVE');
    const sim = [
      { line: 'SEA 4 @ NYY 3', status: 'Top 7th' },
      { line: 'LAD 2 @ SF 1', status: 'Bot 5th' },
      { line: 'HOU 6 @ TEX 6', status: 'Bot 9th' },
    ];
    const render = (games, live) => {
      p.live(live);
      p.body.replaceChildren();
      for (const g of games.slice(0, 4)) {
        row(p.body, g.line, g.status);
      }
      if (!games.length) row(p.body, 'No games on the wire', '');
    };
    every(60000, async () => {
      try {
        const data = await timedFetch(
          'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard',
          'espn /mlb/scoreboard');
        const games = (data.events || []).map(ev => {
          const c = (ev.competitions || [])[0] || {};
          const comps = c.competitors || [];
          const away = comps.find(x => x.homeAway === 'away') || comps[1] || {};
          const home = comps.find(x => x.homeAway === 'home') || comps[0] || {};
          const nm = x => (x.team && (x.team.abbreviation || x.team.shortDisplayName)) || '—';
          const sc = x => x.score != null ? x.score : '0';
          return {
            line: `${nm(away)} ${sc(away)} @ ${nm(home)} ${sc(home)}`,
            status: ((c.status || ev.status || {}).type || {}).shortDetail || '',
          };
        });
        render(games, true);
      } catch {
        if (Math.random() < 0.4) { const g = sim[(Math.random() * sim.length) | 0]; g.line = g.line.replace(/(\d+)(?=[^\d]*$)/, n => String(+n + 1)); }
        render(sim, false);
        log('espn unreachable · simulating');
      }
    });
  }

  /* ---- vitals: an ECG trace. Honest about being a simulation. ---- */
  function showVitals() {
    const p = panel('hub-vitals', 'Vitals — Principal', 'SIM');
    const canvas = document.createElement('canvas');
    p.body.appendChild(canvas);
    const rows = document.createElement('div');
    p.body.appendChild(rows);
    let bpm = 71;
    const renderRows = () => {
      rows.replaceChildren();
      row(rows, 'HEART RATE', `${Math.round(bpm)} BPM`, 'up');
      row(rows, 'HYDRATION', '▮▮▮▮▮▯▯  71%');
      row(rows, 'FOCUS', '▮▮▮▮▮▮▯  86%');
    };
    renderRows();
    timers.push(setInterval(() => { bpm += (Math.random() - 0.5) * 3; bpm = Math.max(62, Math.min(84, bpm)); renderRows(); }, 2400));

    // One heartbeat of PQRST-ish shape, repeated as the trace scrolls.
    const beat = x => {
      if (x < 0.12) return Math.sin(x / 0.12 * Math.PI) * 0.14;          // P
      if (x < 0.22) return 0;
      if (x < 0.26) return -(x - 0.22) / 0.04 * 0.22;                    // Q
      if (x < 0.32) return -0.22 + (x - 0.26) / 0.06 * 1.22;             // R
      if (x < 0.38) return 1.0 - (x - 0.32) / 0.06 * 1.32;               // S
      if (x < 0.5) return -0.32 + (x - 0.38) / 0.12 * 0.32;
      if (x < 0.72) return Math.sin((x - 0.5) / 0.22 * Math.PI) * 0.26;  // T
      return 0;
    };
    const ctx = canvas.getContext('2d');
    const draw = () => {
      const w = canvas.clientWidth || 240, h = 54;
      if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(63,255,194,0.9)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const period = 60 / bpm;                       // seconds per beat
      const t = performance.now() / 1000;
      for (let px = 0; px < w; px++) {
        const sec = t - (w - px) * 0.012;            // 12ms per pixel
        const phase = ((sec / period) % 1 + 1) % 1;
        const y = h * 0.62 - beat(phase) * h * 0.5;
        px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
      }
      ctx.stroke();
      raf = requestAnimationFrame(draw);
    };
    draw();
  }

  /* ---- uplink log panel ---- */
  function showLog() {
    const p = panel('hub-log', 'Uplink', 'LIVE');
    p.live(true);
    logBody = p.body;
    log('hub online · all feeds attached');
    timers.push(setInterval(() => log('sync · reactor nominal'), 14000));
  }

  const ACTS = { markets: showMarkets, scores: showScores, vitals: showVitals, log: showLog };

  window.VERA_HUB = {
    show(name) {
      if (document.getElementById('hub-' + name)) return;  // already on stage
      const act = ACTS[name];
      if (act) act();
    },
    reset() {
      timers.splice(0).forEach(clearInterval);
      if (raf) cancelAnimationFrame(raf);
      raf = null; logBody = null;
      dock.replaceChildren();
    },
  };
})();
