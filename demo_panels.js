/* V.E.R.A. demo — the hub act (public reactor page only).
   During the attract reel she "builds a live operations hub from nothing":
   a market feed (CoinGecko, real, with rolling sparklines), a scoreboard
   (ESPN MLB, real, live-status pills), a vitals monitor (simulated, labeled
   SIM, gridded ECG trace), and an uplink log of the actual requests flowing.
   If the wires fail, each panel degrades to a plausible simulation tagged SIM.
   Design bar: instrument cluster, not text-in-boxes — tabular numerals,
   hierarchy, motion, HUD corner brackets. window.VERA_HUB = { show, reset }. */
(function () {
  'use strict';
  if (!new URLSearchParams(location.search).has('demo')) return;

  const css = document.createElement('style');
  css.textContent = `
    #hub-dock { position: fixed; right: 18px; top: 118px; z-index: 4;
      display: flex; flex-direction: column; gap: 12px; width: 276px;
      pointer-events: none; font-family: 'Rajdhani', sans-serif; }
    .hub-panel { position: relative; background: rgba(5,14,23,0.9);
      border: 1px solid rgba(63,217,255,0.26); border-radius: 4px;
      box-shadow: 0 0 26px rgba(63,217,255,0.1), inset 0 0 40px rgba(63,217,255,0.03);
      color: #cfe4ec; overflow: hidden;
      animation: hub-in 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
    .hub-panel::before, .hub-panel::after { content: ''; position: absolute;
      width: 11px; height: 11px; pointer-events: none; }
    .hub-panel::before { top: -1px; left: -1px;
      border-top: 2px solid rgba(63,217,255,0.9); border-left: 2px solid rgba(63,217,255,0.9); }
    .hub-panel::after { bottom: -1px; right: -1px;
      border-bottom: 2px solid rgba(63,217,255,0.9); border-right: 2px solid rgba(63,217,255,0.9); }
    @keyframes hub-in { from { opacity: 0; transform: translateX(46px) scale(0.97); }
      to { opacity: 1; transform: none; } }
    @keyframes hub-out { to { opacity: 0; transform: translateX(46px) scale(0.96); } }
    .hub-panel h4 { margin: 0; padding: 8px 12px 7px; font-size: 11px;
      letter-spacing: 0.26em; color: #3fd9ff; text-transform: uppercase;
      display: flex; justify-content: space-between; align-items: baseline;
      border-bottom: 1px solid rgba(63,217,255,0.14);
      background: rgba(63,217,255,0.05); }
    .hub-panel h4 .glyph { color: rgba(63,217,255,0.65); margin-right: 6px; }
    .hub-panel h4 .tag { font-size: 9px; letter-spacing: 0.2em; color: rgba(127,184,204,0.55); }
    .hub-panel h4 .tag.live { color: #3fffc2; }
    .hub-panel h4 .tag.live::before { content: '●'; font-size: 7px;
      margin-right: 4px; vertical-align: 1px; animation: hub-blip 2s ease-in-out infinite; }
    @keyframes hub-blip { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
    .hub-body { padding: 8px 12px 10px; }

    .mkt-row { display: grid; grid-template-columns: 36px 1fr auto auto;
      gap: 8px; align-items: center; padding: 4px 0; }
    .mkt-row + .mkt-row { border-top: 1px solid rgba(63,217,255,0.07); }
    .mkt-row .sym { font-size: 12px; font-weight: 600; letter-spacing: 0.12em; color: #9fc3d2; }
    .mkt-row canvas { width: 100%; height: 18px; display: block; opacity: 0.9; }
    .mkt-row .px { font-size: 14px; font-variant-numeric: tabular-nums; color: #eaf6fb; }
    .chip { font-size: 10.5px; letter-spacing: 0.05em; padding: 2px 6px;
      border-radius: 3px; font-variant-numeric: tabular-nums; }
    .chip.up { color: #3fffc2; background: rgba(63,255,194,0.1); }
    .chip.dn { color: #ff5f6b; background: rgba(255,95,107,0.1); }

    .sc-row { display: flex; justify-content: space-between; align-items: center;
      padding: 5px 0; font-size: 13px; font-variant-numeric: tabular-nums; }
    .sc-row + .sc-row { border-top: 1px solid rgba(63,217,255,0.07); }
    .sc-row .st { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
      color: rgba(127,184,204,0.6); }
    .sc-row .st.on { color: #3fffc2; }
    .sc-row .st.on::before { content: '●'; font-size: 6px; margin-right: 4px;
      vertical-align: 1px; animation: hub-blip 1.6s ease-in-out infinite; }

    #hub-vitals canvas { width: 100%; height: 58px; display: block; margin: 2px 0 8px; }
    .vit-foot { display: flex; justify-content: space-between; align-items: flex-end; }
    .vit-bpm { font-size: 24px; font-weight: 600; color: #3fffc2; line-height: 1;
      font-variant-numeric: tabular-nums; }
    .vit-bpm small { font-size: 10px; font-weight: 400; letter-spacing: 0.2em;
      color: rgba(127,184,204,0.6); margin-left: 4px; }
    .vit-meters { display: flex; flex-direction: column; gap: 5px; }
    .meter { display: flex; align-items: center; gap: 6px; }
    .meter .lbl { font-size: 9px; letter-spacing: 0.18em; color: rgba(127,184,204,0.6);
      width: 62px; text-align: right; }
    .meter .segs { display: flex; gap: 2px; }
    .meter .seg { width: 8px; height: 5px; border-radius: 1px; background: rgba(63,217,255,0.12); }
    .meter .seg.on { background: #3fd9ff; box-shadow: 0 0 5px rgba(63,217,255,0.55); }

    #hub-log .hub-body { padding-top: 6px; }
    #hub-log .hub-line { font-size: 10.5px; line-height: 1.7; letter-spacing: 0.04em;
      color: rgba(159,195,210,0.7); white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; }
    #hub-log .hub-line .ts { color: rgba(63,217,255,0.55); margin-right: 6px; }
    #hub-log .hub-line .ok { color: #3fffc2; }
    #hub-log .hub-line:first-child { color: #cfe4ec; }

    @media (max-width: 900px) {
      #hub-dock { top: auto; bottom: 152px; left: 8px; right: 8px; width: auto;
        flex-direction: row; overflow-x: auto; pointer-events: auto;
        -webkit-overflow-scrolling: touch; }
      .hub-panel { min-width: 212px; flex: 0 0 auto; } }`;
  document.head.appendChild(css);

  const dock = document.createElement('div');
  dock.id = 'hub-dock';
  document.body.appendChild(dock);

  const timers = [];
  const every = (ms, fn) => { fn(); timers.push(setInterval(fn, ms)); };
  let raf = null;

  function panel(id, glyph, title, tag) {
    const div = document.createElement('div');
    div.className = 'hub-panel'; div.id = id;
    const h = document.createElement('h4');
    const t = document.createElement('span');
    const g = document.createElement('span'); g.className = 'glyph'; g.textContent = glyph;
    t.append(g, document.createTextNode(title));
    const badge = document.createElement('span'); badge.className = 'tag'; badge.textContent = tag;
    h.append(t, badge);
    const body = document.createElement('div');
    body.className = 'hub-body';
    div.append(h, body);
    dock.appendChild(div);
    return { body, live(on) { badge.textContent = on ? 'LIVE' : 'SIM'; badge.classList.toggle('live', on); } };
  }

  /* ---- uplink log: the real traffic, visibly flowing ---- */
  let logBody = null;
  function log(line, ok) {
    if (!logBody) return;
    const d = document.createElement('div'); d.className = 'hub-line';
    const ts = document.createElement('span'); ts.className = 'ts';
    ts.textContent = new Date().toTimeString().slice(0, 8);
    d.appendChild(ts);
    if (ok) {
      const parts = String(line).split('200');
      d.appendChild(document.createTextNode(parts[0]));
      const okEl = document.createElement('span'); okEl.className = 'ok'; okEl.textContent = '200';
      d.appendChild(okEl);
      d.appendChild(document.createTextNode(parts.slice(1).join('200')));
    } else {
      d.appendChild(document.createTextNode(line));
    }
    logBody.prepend(d);
    while (logBody.children.length > 6) logBody.lastChild.remove();
  }
  async function timedFetch(url, name) {
    const t0 = performance.now();
    const r = await fetch(url);
    log(`GET ${name} · ${r.status} · ${Math.round(performance.now() - t0)}ms`, r.status === 200);
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }

  /* ---- markets: CoinGecko + rolling sparklines; SIM drift on failure ---- */
  function showMarkets() {
    const p = panel('hub-markets', '⇅', 'Markets', 'LIVE');
    const NAMES = [['bitcoin', 'BTC'], ['ethereum', 'ETH'], ['solana', 'SOL']];
    const sim = { bitcoin: { usd: 118400, c: 1.8 }, ethereum: { usd: 4120, c: 2.4 }, solana: { usd: 212, c: -1.1 } };
    const hist = {};
    const push = (id, price) => {
      if (!hist[id]) {  // seed a plausible recent past so the spark isn't a dot
        hist[id] = [];
        let v = price;
        for (let k = 0; k < 23; k++) { hist[id].unshift(v); v *= 1 + (Math.random() - 0.5) * 0.006; }
      }
      hist[id].push(price);
      if (hist[id].length > 24) hist[id].shift();
    };
    const spark = (canvas, series, up) => {
      const w = canvas.clientWidth || 110, h = 18;
      if (canvas.width !== w * 2) { canvas.width = w * 2; canvas.height = h * 2; }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const lo = Math.min(...series), hi = Math.max(...series), span = (hi - lo) || 1;
      const X = i => 1 + (i / (series.length - 1)) * (w - 4);
      const Y = v => h - 2 - ((v - lo) / span) * (h - 5);
      ctx.beginPath();
      series.forEach((v, i) => i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v)));
      ctx.strokeStyle = up ? 'rgba(63,255,194,0.75)' : 'rgba(255,95,107,0.7)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      const lastV = series[series.length - 1];
      ctx.beginPath();
      ctx.arc(X(series.length - 1), Y(lastV), 1.8, 0, Math.PI * 2);
      ctx.fillStyle = up ? '#3fffc2' : '#ff5f6b';
      ctx.fill();
    };
    const render = (data, live) => {
      p.live(live);
      p.body.replaceChildren();
      for (const [id, symName] of NAMES) {
        const d = data[id]; if (!d || typeof d.usd !== 'number') continue;
        push(id, d.usd);
        const chg = d.usd_24h_change ?? d.c ?? 0;
        const rowEl = document.createElement('div'); rowEl.className = 'mkt-row';
        const sym = document.createElement('span'); sym.className = 'sym'; sym.textContent = symName;
        const cv = document.createElement('canvas');
        const px = document.createElement('span'); px.className = 'px';
        px.textContent = '$' + (d.usd >= 1000 ? Math.round(d.usd).toLocaleString('en-US') : d.usd.toFixed(2));
        const chip = document.createElement('span'); chip.className = 'chip ' + (chg >= 0 ? 'up' : 'dn');
        chip.textContent = `${chg >= 0 ? '▲' : '▼'}${Math.abs(chg).toFixed(1)}%`;
        rowEl.append(sym, cv, px, chip);
        p.body.appendChild(rowEl);
        requestAnimationFrame(() => spark(cv, hist[id], chg >= 0));
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
        log('coingecko unreachable · simulating', false);
      }
    });
  }

  /* ---- scoreboard: ESPN public JSON; SIM innings on failure ---- */
  function showScores() {
    const p = panel('hub-scores', '◆', 'Scoreboard — MLB', 'LIVE');
    const sim = [
      { line: 'SEA 4 @ NYY 3', status: 'Top 7th', on: true },
      { line: 'LAD 2 @ SF 1', status: 'Bot 5th', on: true },
      { line: 'HOU 6 @ TEX 6', status: 'Final', on: false },
    ];
    const render = (games, live) => {
      p.live(live);
      p.body.replaceChildren();
      for (const g of games.slice(0, 4)) {
        const rowEl = document.createElement('div'); rowEl.className = 'sc-row';
        const teams = document.createElement('span'); teams.textContent = g.line;
        const st = document.createElement('span'); st.className = 'st' + (g.on ? ' on' : '');
        st.textContent = g.status;
        rowEl.append(teams, st);
        p.body.appendChild(rowEl);
      }
      if (!games.length) {
        const rowEl = document.createElement('div'); rowEl.className = 'sc-row';
        rowEl.textContent = 'No games on the wire';
        p.body.appendChild(rowEl);
      }
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
          const status = ((c.status || ev.status || {}).type || {});
          return {
            line: `${nm(away)} ${sc(away)} @ ${nm(home)} ${sc(home)}`,
            status: status.shortDetail || '',
            on: status.state === 'in',
          };
        });
        render(games, true);
      } catch {
        if (Math.random() < 0.4) { const g = sim[(Math.random() * 2) | 0]; g.line = g.line.replace(/(\d+)(?=[^\d]*$)/, n => String(+n + 1)); }
        render(sim, false);
        log('espn unreachable · simulating', false);
      }
    });
  }

  /* ---- vitals: a gridded ECG trace. Honest about being a simulation. ---- */
  function showVitals() {
    const p = panel('hub-vitals', '♥', 'Vitals — Principal', 'SIM');
    const canvas = document.createElement('canvas');
    p.body.appendChild(canvas);
    const foot = document.createElement('div'); foot.className = 'vit-foot';
    const bpmEl = document.createElement('div'); bpmEl.className = 'vit-bpm';
    const metersEl = document.createElement('div'); metersEl.className = 'vit-meters';
    foot.append(bpmEl, metersEl);
    p.body.appendChild(foot);
    let bpm = 71, hydration = 0.71, focus = 0.86;
    const meter = (lbl, pct) => {
      const m = document.createElement('div'); m.className = 'meter';
      const l = document.createElement('span'); l.className = 'lbl'; l.textContent = lbl;
      const segs = document.createElement('span'); segs.className = 'segs';
      const onCount = Math.round(pct * 8);
      for (let k = 0; k < 8; k++) {
        const s = document.createElement('span'); s.className = 'seg' + (k < onCount ? ' on' : '');
        segs.appendChild(s);
      }
      m.append(l, segs);
      return m;
    };
    const renderFoot = () => {
      bpmEl.replaceChildren(document.createTextNode(String(Math.round(bpm))));
      const small = document.createElement('small'); small.textContent = 'BPM';
      bpmEl.appendChild(small);
      metersEl.replaceChildren(meter('HYDRATION', hydration), meter('FOCUS', focus));
    };
    renderFoot();
    timers.push(setInterval(() => {
      bpm = Math.max(62, Math.min(84, bpm + (Math.random() - 0.5) * 3));
      hydration = Math.max(0.4, Math.min(0.95, hydration + (Math.random() - 0.5) * 0.03));
      focus = Math.max(0.5, Math.min(0.98, focus + (Math.random() - 0.5) * 0.03));
      renderFoot();
    }, 2400));

    // One heartbeat of PQRST-ish shape, repeated as the trace scrolls.
    const beat = x => {
      if (x < 0.12) return Math.sin(x / 0.12 * Math.PI) * 0.14;
      if (x < 0.22) return 0;
      if (x < 0.26) return -(x - 0.22) / 0.04 * 0.22;
      if (x < 0.32) return -0.22 + (x - 0.26) / 0.06 * 1.22;
      if (x < 0.38) return 1.0 - (x - 0.32) / 0.06 * 1.32;
      if (x < 0.5) return -0.32 + (x - 0.38) / 0.12 * 0.32;
      if (x < 0.72) return Math.sin((x - 0.5) / 0.22 * Math.PI) * 0.26;
      return 0;
    };
    const ctx = canvas.getContext('2d');
    const draw = () => {
      const w = canvas.clientWidth || 240, h = 58;
      if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(63,217,255,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = 0.5; gx < w; gx += 14) { ctx.moveTo(gx, 0); ctx.lineTo(gx, h); }
      for (let gy = 0.5; gy < h; gy += 14) { ctx.moveTo(0, gy); ctx.lineTo(w, gy); }
      ctx.stroke();
      const period = 60 / bpm;
      const t = performance.now() / 1000;
      const trace = width => {
        ctx.beginPath();
        for (let px = 0; px < w; px++) {
          const sec = t - (w - px) * 0.012;
          const phase = ((sec / period) % 1 + 1) % 1;
          const y = h * 0.62 - beat(phase) * h * 0.48;
          px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
        }
        ctx.lineWidth = width;
        ctx.stroke();
      };
      ctx.strokeStyle = 'rgba(63,255,194,0.22)';
      trace(3.6);                       // glow pass (double-stroke, never shadowBlur)
      ctx.strokeStyle = '#7dffd9';
      trace(1.3);
      raf = requestAnimationFrame(draw);
    };
    draw();
  }

  /* ---- uplink log panel ---- */
  function showLog() {
    const p = panel('hub-log', '≋', 'Uplink', 'LIVE');
    p.live(true);
    logBody = p.body;
    log('hub online · all feeds attached', false);
    timers.push(setInterval(() => log('sync · reactor nominal', false), 14000));
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
    dissolve() {
      // The stage, not the cockpit: panels are a performance, and when the
      // show ends they leave — the empty stage is the invitation.
      const panels = [...dock.children];
      panels.forEach((p, i) => {
        p.style.animation = `hub-out 0.5s ${i * 80}ms cubic-bezier(0.4, 0, 0.9, 0.4) forwards`;
      });
      setTimeout(() => window.VERA_HUB.reset(), 600 + panels.length * 80);
    },
  };
})();
