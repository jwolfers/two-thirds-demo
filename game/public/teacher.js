// The projector deck. Arrow keys (or a clicker) move; some slides step through before moving on.
(function () {
  'use strict';
  const B = window.Brand;
  const $ = (id) => document.getElementById(id);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const LOG23 = Math.log(2 / 3);

  /* ---------------------------------------------------------- teacher key */
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* ignore */ }
    return null;
  }
  const url = new URL(location.href);
  let KEY = url.searchParams.get('key') || store('t3-key') || '';
  if (url.searchParams.has('key')) {
    store('t3-key', KEY);
    url.searchParams.delete('key');
    history.replaceState(null, '', url.pathname + url.search + url.hash); // keep the key off the projector
  }

  /* ---------------------------------------------------------- stage scale */
  const stage = $('stage');
  function fit() {
    const s = Math.min(innerWidth / 1600, innerHeight / 900);
    stage.style.transform = `scale(${s})`;
  }
  addEventListener('resize', fit);
  fit();

  for (const el of document.querySelectorAll('[data-m]')) el.innerHTML = B.blockM(Number(el.dataset.m));

  /* --------------------------------------------------------------- slides */
  const slides = [...document.querySelectorAll('.slide')];
  const IDX = { title: 0, rules: 1, join: 2, results: 3, math: 4, lk: 5, nash: 6, why: 7, again: 8, steal: 9 };
  const NASH_STEPS = 6; // listed eliminations before "and so on, forever"
  const LK_ROWS = ['L0', 'L1', 'L2', 'L3', 'L4', 'nash', 'dom'];
  const maxStep = (i) => (i === IDX.lk ? LK_ROWS.length + 1 : i === IDX.nash ? NASH_STEPS + 2 : 0);

  let cur = 0;
  let step = 0;
  const dots = $('dots');
  slides.forEach((s, i) => {
    const d = document.createElement('i');
    d.title = `${i + 1}. ${s.dataset.name}`;
    d.onclick = () => go(i);
    dots.appendChild(d);
  });

  function go(i, fromBack) {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    step = fromBack ? maxStep(cur) : maxStep(cur) ? 1 : 0;
    slides.forEach((s, j) => s.classList.toggle('on', j === cur));
    [...dots.children].forEach((d, j) => d.classList.toggle('on', j === cur));
    store('t3-slide', String(cur));
    renderSlide(true);
  }
  function next() {
    if (step < maxStep(cur)) { step += 1; renderSlide(false); } else if (cur < slides.length - 1) go(cur + 1);
  }
  function prev() {
    if (step > 1 && maxStep(cur)) { step -= 1; renderSlide(false); } else if (cur > 0) go(cur - 1, true);
  }

  /* -------------------------------------------------------------- network */
  let D = null; // deck state
  let lastV = -1;
  async function api(path, body) {
    const opts = { cache: 'no-store', headers: { 'x-teacher-key': KEY } };
    if (body !== undefined) {
      opts.method = 'POST';
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(path, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  }
  let pollTimer;
  async function poll() {
    clearTimeout(pollTimer);
    try {
      D = await api('api/deck');
      document.body.classList.toggle('teacher', !!D.teacher);
      $('d-viewonly').hidden = !!D.teacher;
      if (D.v !== lastV) { lastV = D.v; renderSlide(false); }
      renderDock();
    } catch (e) {
      $('d-status').textContent = 'Reconnecting…';
    }
    pollTimer = setTimeout(poll, 1000);
  }

  async function admin(action, body) {
    if (!D || !D.teacher) return flash('View only. Add ?key=… to the address to take control.');
    try {
      await api('api/admin/' + action, body || {});
      await poll();
      if (action === 'reveal') { animatedRound = null; go(IDX.results); }
      if (action === 'newround') go(IDX.join);
    } catch (e) {
      flash(e.message);
    }
  }

  function flash(msg) {
    const el = $('d-status');
    el.textContent = msg;
    showDock();
  }

  /* ----------------------------------------------------------------- dock */
  const dock = $('dock');
  let dockTimer;
  function showDock() {
    dock.classList.add('show');
    clearTimeout(dockTimer);
    dockTimer = setTimeout(() => dock.classList.remove('show'), 3000);
  }
  addEventListener('mousemove', showDock);
  function renderDock() {
    if (!D) return;
    const labels = { lobby: 'Pregame', open: 'OPEN', closed: 'Closed', revealed: 'Revealed' };
    $('d-status').textContent = `Round ${D.round} · ${labels[D.status]} · ${D.locked}/${D.n} guesses${D.bots ? ` (${D.bots} robots)` : ''}`;
    $('d-open').disabled = $('b-open').disabled = D.status === 'open' || D.status === 'revealed';
    $('d-close').disabled = $('b-close').disabled = D.status !== 'open';
    $('d-reveal').disabled = $('b-reveal').disabled = !(D.status === 'open' || D.status === 'closed');
  }

  $('d-prev').onclick = prev;
  $('d-next').onclick = next;
  $('d-open').onclick = $('b-open').onclick = () => admin('open');
  $('d-close').onclick = $('b-close').onclick = () => admin('close');
  $('d-reveal').onclick = $('b-reveal').onclick = $('b-reveal2').onclick = () => admin('reveal');
  $('d-new').onclick = $('b-new').onclick = () => admin('newround');
  $('d-bots').onclick = () => admin('bots', { count: 25 });
  $('d-reset').onclick = () => { if (confirm('Reset everything? All players, guesses and rounds will be cleared.')) admin('reset'); };
  $('d-full').onclick = toggleFull;
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter') { e.preventDefault(); next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); prev(); }
    else if (k === 'o' || k === 'O') admin('open');
    else if (k === 'c' || k === 'C') admin('close');
    else if (k === 'r' || k === 'R') {
      if (D && D.status === 'revealed') { animatedRound = null; go(IDX.results); } else admin('reveal');
    }
    else if (k === 'n' || k === 'N') admin('newround');
    else if (k === 'b' || k === 'B') admin('bots', { count: 25 });
    else if (k === 'f' || k === 'F') toggleFull();
    else if (/^[0-9]$/.test(k)) go(k === '0' ? 9 : Number(k) - 1);
  });

  /* ------------------------------------------------------------ SVG utils */
  function svg(tag, attrs, parent) {
    const el = document.createElementNS(SVGNS, tag);
    for (const a in attrs) el.setAttribute(a, attrs[a]);
    if (parent) parent.appendChild(el);
    return el;
  }
  // The drawable size of a host box (its content box, inside the padding).
  function box(host, fw, fh) {
    const cs = getComputedStyle(host);
    const w = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = host.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    return [w > 0 ? w : fw, h > 0 ? h : fh];
  }
  function text(parent, x, y, str, attrs) {
    const t = svg('text', Object.assign({ x, y }, attrs || {}), parent);
    t.textContent = str;
    return t;
  }

  // A histogram of guesses on a football field: 100 one-point bins from 0 to 100.
  function histogram(host, guesses, opts) {
    const o = opts || {};
    host.innerHTML = '';
    const [W, H] = box(host, 1400, 500);
    const padB = 52, padT = o.padTop == null ? 70 : o.padTop;
    const plotH = H - padB - padT;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' }, host);
    const X = (v) => (v / 100) * W;

    if (o.domShade) {
      svg('rect', { x: X(200 / 3), y: padT - 20, width: W - X(200 / 3), height: plotH + 20, fill: 'rgba(216,96,24,.28)' }, s);
      text(s, X(83.3), padT - 30, 'DOMINATED', { 'text-anchor': 'middle', fill: '#ffd2b8', 'font-size': 22, 'font-weight': 900, 'letter-spacing': 3 });
    }
    // Yard lines and numbers
    for (let v = 0; v <= 100; v += 10) {
      svg('line', { x1: X(v), x2: X(v), y1: padT - 10, y2: H - padB, stroke: 'rgba(255,255,255,.45)', 'stroke-width': v % 50 ? 2 : 4 }, s);
      text(s, X(v), H - 12, String(v), { 'text-anchor': 'middle', fill: '#fff', 'font-size': 28, 'font-weight': 900, 'font-family': 'Montserrat' });
    }
    for (let v = 0; v < 100; v += 1) {
      if (v % 10) svg('line', { x1: X(v), x2: X(v), y1: H - padB - 8, y2: H - padB, stroke: 'rgba(255,255,255,.35)', 'stroke-width': 1.5 }, s);
    }
    svg('line', { x1: 0, x2: W, y1: H - padB, y2: H - padB, stroke: '#fff', 'stroke-width': 4 }, s);

    // Bars
    const counts = new Array(100).fill(0);
    const wins = new Array(100).fill(0);
    for (const [g, w] of guesses) {
      const b = Math.min(99, Math.floor(g));
      counts[b] += 1;
      if (w) wins[b] = 1;
    }
    const maxC = Math.max(1, ...counts);
    const bw = W / 100;
    const gBars = svg('g', { class: o.hidden ? 'bars-hidden' : '' }, s);
    counts.forEach((c, i) => {
      if (!c) return;
      const h = Math.max(6, (c / maxC) * plotH);
      const r = svg('rect', {
        class: 'bar', x: i * bw + 1.5, y: H - padB - h, width: Math.max(2, bw - 3), height: h, rx: 3,
        fill: wins[i] ? '#ffffff' : '#FFCB05', stroke: '#00274C', 'stroke-width': 2,
      }, gBars);
      r.style.transitionDelay = `${(i / 100) * 0.6}s`;
      if (o.showCounts && c >= Math.max(2, maxC * 0.25)) text(gBars, i * bw + bw / 2, H - padB - h - 8, String(c), { 'text-anchor': 'middle', fill: '#fff', 'font-size': 18, 'font-weight': 800 });
    });
    host.bars = gBars;

    // Vertical reference lines
    host.lines = {};
    (o.lines || []).forEach((L, n) => {
      const g = svg('g', { class: 'vline' + (L.hide ? ' hide' : '') }, s);
      const x = X(L.x);
      svg('line', { x1: x, x2: x, y1: padT - 56 + (L.row || 0) * 42, y2: H - padB, stroke: L.color, 'stroke-width': L.width || 5, 'stroke-dasharray': L.dash || '' }, g);
      const label = L.label;
      const lw = label.length * 13 + 26;
      const lx = Math.max(lw / 2, Math.min(W - lw / 2, x));
      const ly = padT - 92 + (L.row || 0) * 42;
      svg('rect', { x: lx - lw / 2, y: ly, width: lw, height: 36, rx: 18, fill: L.color }, g);
      text(g, lx, ly + 25, label, { 'text-anchor': 'middle', fill: L.ink || '#00274C', 'font-size': 20, 'font-weight': 900 });
      host.lines[L.key || n] = g;
    });
    return s;
  }

  /* ------------------------------------------------------------- results */
  let animatedRound = null;
  let timers = [];
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function renderResults(entering) {
    const r = D && D.result;
    $('r-empty').style.display = r && r.n ? 'none' : 'grid';
    $('r-chart').style.visibility = r && r.n ? 'visible' : 'hidden';
    if (!r || !r.n) {
      ['st-avg', 'st-tgt'].forEach((id) => $(id).classList.add('hide'));
      $('r-winner').classList.add('hide');
      $('r-n').textContent = D ? D.locked : '–';
      $('r-empty').querySelector('p').textContent = D && D.status === 'revealed' ? 'Nobody guessed this round. Bold strategy.' : 'No results yet. Guessing is ' + (D && D.status === 'open' ? 'still open.' : 'not open.');
      return;
    }
    $('r-n').textContent = r.n;
    $('r-avg').textContent = B.fmt(r.avg, 1);
    $('r-tgt').textContent = B.fmt(r.target, 1);
    const names = r.winners.map((w) => `${B.esc(w.name)}${w.school ? ` <small>(${B.esc(w.school)})</small>` : ''}`);
    const more = r.winnerCount > names.length ? ` + ${r.winnerCount - names.length} more` : '';
    const g = r.winners[0].guess;
    $('r-winner').innerHTML = `<span class="trophy">🏆</span><span><span class="w-names">${r.winnerCount > 1 ? 'Tie! ' : ''}${names.join(', ')}${more}</span>
      <span class="w-sub">${r.winnerCount > 1 ? 'guessed' : 'guessed'} ${B.fmtGuess(g)}, just ${B.fmt(r.winDist, 2)} from the target of ${B.fmt(r.target, 2)}. Hail to the Victor${r.winnerCount > 1 ? 's' : ''}!</span></span>`;

    const animate = animatedRound !== r.round;
    histogram($('r-chart'), r.guesses, {
      hidden: animate, showCounts: true, padTop: 100,
      lines: [
        { key: 'avg', x: r.avg, label: `Average ${B.fmt(r.avg, 1)}`, color: '#ffffff', dash: '12 8', hide: animate, row: 0 },
        { key: 'tgt', x: r.target, label: `⅔ target ${B.fmt(r.target, 1)}`, color: '#FFCB05', hide: animate, row: 1 },
      ],
    });
    const chart = $('r-chart');
    if (!animate) {
      ['st-avg', 'st-tgt'].forEach((id) => $(id).classList.remove('hide'));
      $('r-winner').classList.remove('hide');
      return;
    }
    if (!entering && cur !== IDX.results) return;
    animatedRound = r.round;
    clearTimers();
    ['st-avg', 'st-tgt'].forEach((id) => $(id).classList.add('hide'));
    $('r-winner').classList.add('hide');
    timers.push(setTimeout(() => chart.bars.classList.remove('bars-hidden'), 150));
    timers.push(setTimeout(() => { $('st-avg').classList.remove('hide'); chart.lines.avg.classList.remove('hide'); }, 2000));
    timers.push(setTimeout(() => { $('st-tgt').classList.remove('hide'); chart.lines.tgt.classList.remove('hide'); }, 3600));
    timers.push(setTimeout(() => { $('r-winner').classList.remove('hide'); B.confetti(5000); }, 5200));
  }

  /* ---------------------------------------------------------------- math */
  function renderMath() {
    const r = D && D.result;
    const host = $('math');
    if (!r || !r.n) {
      host.innerHTML = '<div class="mstep" style="grid-column:1/-1"><h3>Nothing to add up yet</h3><p>Play a round, reveal it, then come back here to walk through the arithmetic.</p></div>';
      $('math-note').textContent = '';
      return;
    }
    const w = r.winners[0];
    const dom = r.levels.dom;
    host.innerHTML = `
      <div class="mstep"><h3>1 · Add them up</h3><div class="big">${r.n}</div><p>guesses, totalling</p><div class="eq">Σ = ${B.fmt(r.sum, 1)}</div></div>
      <div class="mstep"><h3>2 · Average</h3><div class="big">${B.fmt(r.avg, 2)}</div><p>the average guess</p><div class="eq">${B.fmt(r.sum, 1)} ÷ ${r.n}</div></div>
      <div class="mstep"><h3>3 · Take ⅔</h3><div class="big">${B.fmt(r.target, 2)}</div><p>is the target</p><div class="eq">⅔ × ${B.fmt(r.avg, 2)}</div></div>
      <div class="mstep final"><h3>4 · Closest wins</h3><div class="big">${B.fmtGuess(w.guess)}</div><p>${B.esc(w.name)}${r.winnerCount > 1 ? ` and ${r.winnerCount - 1} other${r.winnerCount > 2 ? 's' : ''}` : ''}</p><div class="eq">|${B.fmtGuess(w.guess)} − ${B.fmt(r.target, 2)}| = ${B.fmt(r.winDist, 2)}</div></div>
      <div class="math-sub">
        <div class="mini"><b>${B.fmt(r.median, 1)}</b>median guess</div>
        <div class="mini"><b>${B.fmtGuess(r.min)} to ${B.fmtGuess(r.max)}</b>lowest to highest</div>
        <div class="mini"><b>${dom}</b>guess${dom === 1 ? '' : 'es'} above 66.7 (can never win)</div>
      </div>`;
    $('math-note').textContent = dom
      ? `${dom === 1 ? 'Someone' : dom + ' people'} guessed above 66.7. Even if everyone said 100, the target would be 66.7. That's a strictly dominated strategy, like running up the middle on 3rd and 14. (Michigan's offensive coordinator has been notified.)`
      : 'Nobody guessed above 66.7. This room is already smarter than our play-calling.';
  }

  /* ------------------------------------------------------------- level-k */
  const LK_DESC = {
    L0: 'No strategy. A random pick, or "the middle."',
    L1: 'Thinks everyone else is Level 0. ⅔ × 50.',
    L2: 'Thinks everyone else is Level 1. ⅔ × 33.3.',
    L3: 'Thinks everyone else is Level 2. ⅔ × 22.2.',
    L4: 'Keeps going: ⅔ × 14.8, and so on.',
    nash: 'Iterates forever. Everyone says 0.',
    dom: 'Above 66.7. Can never win, whatever others do.',
  };
  const LK_VAL = { L0: '50', L1: '33.3', L2: '22.2', L3: '14.8', L4: '≤ 9.9', nash: '0', dom: '> 66.7' };
  const LK_CALL = {
    L0: '<b>Level 0</b> doesn\'t think about anyone else. If everyone picked at random, the average would be about <b>50</b>.',
    L1: '<b>Level 1</b> best-responds to Level 0: if the average is 50, guess <b>⅔ × 50 ≈ 33</b>.',
    L2: '<b>Level 2</b> thinks everyone else is Level 1, so guesses <b>⅔ × 33 ≈ 22</b>.',
    L3: '<b>Level 3</b>: ⅔ × 22 ≈ <b>15</b>. Each extra step of reasoning multiplies by another ⅔.',
    L4: '<b>Level 4 and up</b>: 9.9, 6.6, 4.4… Level <i>k</i> guesses <b>50 × (⅔)<sup>k</sup></b>.',
    nash: 'Take it to infinity and you hit <b>0</b>: the Nash equilibrium. Only a room full of infinitely deep thinkers gets there.',
    dom: 'And then there are guesses above <b>66.7</b>. No belief about others can make them win. Every room has a few. So does every football program.',
  };

  function renderLk() {
    const r = D && D.result;
    const n = r && r.n ? r.n : 0;
    const shown = Math.min(step, LK_ROWS.length);
    $('lk-ladder').innerHTML = LK_ROWS.map((k, i) => {
      const c = n ? r.levels[k] : 0;
      const pct = n ? (100 * c) / n : 0;
      return `<div class="lrow ${k === 'dom' ? 'dom' : ''} ${i < shown ? '' : 'hide'}">
        <div class="lname">${B.LEVELS[k].name === 'Nash equilibrium' ? 'Nash' : B.LEVELS[k].name}</div>
        <div class="ldesc">${LK_DESC[k]}</div>
        <div class="lval">${LK_VAL[k]}</div>
        <div class="lpct">${n ? `<b>${Math.round(pct)}%</b>${c} of you` : ''}</div>
        ${n ? `<div class="lshare"><i style="width:${i < shown ? pct : 0}%"></i></div>` : ''}
      </div>`;
    }).join('');

    const vals = { L0: 50, L1: 100 / 3, L2: 200 / 9, L3: 400 / 27, L4: 800 / 81, nash: 0 };
    const lines = [];
    LK_ROWS.slice(0, shown).forEach((k) => {
      const row = { L0: 0, L1: 0, L2: 0, L3: 1, L4: 0, nash: 1 }[k];
      if (vals[k] != null) lines.push({ x: vals[k], label: k === 'nash' ? 'Nash' : k, color: '#ffffff', ink: '#00274C', width: 3, dash: '6 6', row });
    });
    if (step > LK_ROWS.length && r && r.n) lines.push({ x: r.target, label: `Target ${B.fmt(r.target, 1)}`, color: '#FFCB05', row: 2 });
    histogram($('lk-chart'), r && r.n ? r.guesses : [], { lines, domShade: shown >= LK_ROWS.length, padTop: 140 });

    let call;
    if (step > LK_ROWS.length) {
      if (r && r.n) {
        const kAvg = Math.log(r.avg / 50) / LOG23;
        const kWin = Math.log(r.target / 50) / LOG23;
        call = `This room averaged <b>${B.fmt(r.avg, 1)}</b>: as if everyone thought about <b>${B.fmt(Math.max(0, kAvg), 1)}</b> steps. The winning number, <b>${B.fmt(r.target, 1)}</b>, sits at level <b>${B.fmt(Math.max(0, kWin), 1)}</b>. To win, think exactly one step deeper than the room. Not two.`;
      } else {
        call = 'Play a round and this slide will show how many steps of reasoning this room actually did.';
      }
    } else {
      call = LK_CALL[LK_ROWS[Math.max(0, shown - 1)]];
    }
    $('lk-call').innerHTML = call;
  }

  /* ---------------------------------------------------------------- nash */
  function renderNash() {
    const r = D && D.result;
    const guesses = r && r.n ? r.guesses.map((x) => x[0]) : [];
    const k = step - 1; // eliminations done; NASH_STEPS + 1 means "forever"
    const forever = k > NASH_STEPS;
    const bound = forever ? 0 : 100 * Math.pow(2 / 3, Math.max(0, k));
    const cutBy = (b) => guesses.filter((g) => g > b + 1e-9).length;

    const rows = [];
    rows.push(`<div class="nstep ${k === 0 ? 'cur' : ''}"><div class="k">0</div><div>Any number from 0 to 100 is possible.</div><div class="cut"></div></div>`);
    for (let i = 1; i <= NASH_STEPS; i += 1) {
      const b = 100 * Math.pow(2 / 3, i);
      const prevB = 100 * Math.pow(2 / 3, i - 1);
      const why = i === 1
        ? `Even if everyone says 100, the target is ⅔ × 100 = <b>${B.fmt(b, 1)}</b>. Anything higher is dominated.`
        : `If everyone knows nobody goes above ${B.fmt(prevB, 1)}, the target can't top <b>${B.fmt(b, 1)}</b>.`;
      const c = guesses.length ? `−${cutBy(b)}` : '';
      rows.push(`<div class="nstep ${i > k ? 'hide' : ''} ${i === k ? 'cur' : ''}"><div class="k">${i}</div><div>${why}</div><div class="cut" title="room guesses eliminated">${c}</div></div>`);
    }
    rows.push(`<div class="nstep ${forever ? 'cur' : 'hide'}"><div class="k">∞</div><div>Keep going and only <b>0</b> survives. Everyone guesses 0: the <b>Nash equilibrium</b>.</div><div class="cut">${guesses.length ? '−' + cutBy(0) : ''}</div></div>`);
    $('nash-steps').innerHTML = rows.join('');

    // The number line
    const host = $('nash-line');
    host.innerHTML = '';
    const [W, H] = box(host, 800, 400);
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}` }, host);
    const X = (v) => (v / 100) * W;
    const base = H - 50;
    svg('rect', { x: X(bound), y: 40, width: W - X(bound), height: base - 40, fill: 'rgba(216,96,24,.45)' }, s);
    if (bound < 99.9) text(s, (X(bound) + W) / 2, 30, 'ELIMINATED', { 'text-anchor': 'middle', fill: '#ffd2b8', 'font-size': 22, 'font-weight': 900, 'letter-spacing': 3 });
    for (let v = 0; v <= 100; v += 10) {
      svg('line', { x1: X(v), x2: X(v), y1: 40, y2: base, stroke: 'rgba(255,255,255,.35)', 'stroke-width': 2 }, s);
      text(s, X(v), H - 12, String(v), { 'text-anchor': 'middle', fill: '#fff', 'font-size': 26, 'font-weight': 900 });
    }
    svg('line', { x1: 0, x2: W, y1: base, y2: base, stroke: '#fff', 'stroke-width': 4 }, s);
    // The room's guesses as dots, stacked a little so crowds show up
    const seen = {};
    guesses.slice(0, 1500).forEach((g) => {
      const b = Math.round(g);
      seen[b] = (seen[b] || 0) + 1;
      const y = base - 12 - ((seen[b] - 1) % 30) * 10;
      const alive = g <= bound + 1e-9;
      svg('circle', { cx: X(g), cy: y, r: 5.5, fill: alive ? '#FFCB05' : 'rgba(255,255,255,.35)', stroke: alive ? '#00274C' : 'none', 'stroke-width': 1.5 }, s);
    });
    svg('line', { x1: X(bound), x2: X(bound), y1: 36, y2: base + 6, stroke: '#FFCB05', 'stroke-width': 6 }, s);
    const lbl = `Upper bound: ${B.fmt(bound, 1)}`;
    const lw = lbl.length * 13 + 26;
    const lx = Math.max(lw / 2, Math.min(W - lw / 2, X(bound)));
    svg('rect', { x: lx - lw / 2, y: 50, width: lw, height: 38, rx: 19, fill: '#FFCB05' }, s);
    text(s, lx, 76, lbl, { 'text-anchor': 'middle', fill: '#00274C', 'font-size': 21, 'font-weight': 900 });

    let call;
    if (forever) {
      call = guesses.length
        ? `Nash says everyone guesses <b>0</b>. In this room, <b>${guesses.filter((g) => g <= 1).length}</b> of ${guesses.length} said 0 or 1. Zero is also, by coincidence, the number of second-half points Michigan's offense prefers.`
        : 'Nash says everyone guesses <b>0</b>. It\'s the only number that\'s a best response to itself.';
    } else if (k === 0) {
      call = 'Start with what <i>nobody</i> should guess, then assume everyone else has figured that out too. Press → to eliminate.';
    } else {
      const c = cutBy(bound);
      call = `After ${k} round${k > 1 ? 's' : ''} of elimination, nothing above <b>${B.fmt(bound, 1)}</b> survives.` + (guesses.length ? ` That knocks out <b>${c}</b> of this room's ${guesses.length} guesses.` : '');
    }
    $('nash-call').innerHTML = call;
  }

  /* ---------------------------------------------------------- why not 0 */
  function renderWhy() {
    const rows = [
      { label: 'Nagel lab (1995)', v: 36.7 },
      { label: 'FT readers (1997)', v: 18.9 },
    ];
    (D ? D.history : []).forEach((h) => rows.push({ label: D.history.length > 1 ? `This room, round ${h.round}` : 'This room', v: h.avg, us: true }));
    if (!D || !D.history.length) rows.push({ label: 'This room', v: null, us: true });
    rows.push({ label: 'Nash equilibrium', v: 0, nash: true });
    $('cmp').innerHTML = rows.map((r) => `<div class="crow ${r.us ? 'us' : ''} ${r.nash ? 'nash' : ''}"><div>${r.label}</div>
      <div class="cbar"><i style="width:${r.v == null ? 0 : Math.max(r.nash ? 0 : 10, Math.min(100, (r.v / 50) * 100))}%">${r.v == null ? '?' : B.fmt(r.v, 1)}</i></div></div>`).join('');
  }

  /* --------------------------------------------------------------- again */
  function renderAgain() {
    $('next-round').textContent = D ? D.round + 1 : 2;
    const host = $('again-chart');
    host.innerHTML = '';
    const hist = D ? D.history : [];
    const [W, H] = box(host, 800, 500);
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}` }, host);
    const nCols = Math.max(3, hist.length + 1);
    const colW = W / nCols;
    const Y = (v) => H - 50 - (v / 60) * (H - 110);
    for (let v = 0; v <= 60; v += 10) {
      svg('line', { x1: 0, x2: W, y1: Y(v), y2: Y(v), stroke: 'rgba(255,255,255,.12)', 'stroke-width': 2 }, s);
      text(s, -10, Y(v) + 8, String(v), { 'text-anchor': 'end', fill: '#9fb3c8', 'font-size': 20, 'font-weight': 700 });
    }
    text(s, 0, 24, 'Average guess (blue) and ⅔ target (maize), by round', { fill: '#c9d6e4', 'font-size': 22, 'font-weight': 700 });
    for (let i = 0; i < nCols; i += 1) {
      const h = hist[i];
      const cx = colW * i + colW / 2;
      text(s, cx, H - 14, h ? `Round ${h.round}` : i === hist.length ? 'Next?' : '', { 'text-anchor': 'middle', fill: '#fff', 'font-size': 22, 'font-weight': 800 });
      if (!h) {
        if (i === hist.length) {
          svg('rect', { x: cx - 70, y: Y(30), width: 140, height: Y(0) - Y(30), rx: 10, fill: 'none', stroke: 'rgba(255,203,5,.6)', 'stroke-width': 3, 'stroke-dasharray': '10 8' }, s);
          text(s, cx, Y(15) + 10, '?', { 'text-anchor': 'middle', fill: '#FFCB05', 'font-size': 56, 'font-weight': 900 });
        }
        continue;
      }
      svg('rect', { x: cx - 74, y: Y(h.avg), width: 70, height: Y(0) - Y(h.avg), rx: 8, fill: '#1a4f86', stroke: '#fff', 'stroke-width': 2 }, s);
      svg('rect', { x: cx + 4, y: Y(h.target), width: 70, height: Y(0) - Y(h.target), rx: 8, fill: '#FFCB05' }, s);
      text(s, cx - 39, Y(h.avg) - 10, B.fmt(h.avg, 1), { 'text-anchor': 'middle', fill: '#fff', 'font-size': 24, 'font-weight': 900 });
      text(s, cx + 39, Y(h.target) - 10, B.fmt(h.target, 1), { 'text-anchor': 'middle', fill: '#FFCB05', 'font-size': 24, 'font-weight': 900 });
    }
  }

  /* --------------------------------------------------------------- join */
  function renderJoin() {
    if (!D) return;
    $('qr-url').textContent = D.playUrl.replace(/^https?:\/\//, '');
    if (!$('qr').src) $('qr').src = 'qr.svg';
    $('j-n').textContent = D.n;
    $('j-locked').textContent = D.locked;
    const st = $('j-status');
    const msg = {
      lobby: `Round ${D.round}: guessing opens when you're ready.`,
      open: `Round ${D.round}: guessing is OPEN`,
      closed: `Round ${D.round}: guessing closed. Ready for the reveal.`,
      revealed: `Round ${D.round}: results are in.`,
    }[D.status];
    st.className = 'status-line ' + D.status;
    st.innerHTML = `<span class="dot"></span>${msg}`;
    $('ticker').innerHTML = D.ticker.map((n) => `<span class="chip">${B.esc(n)}</span>`).join('');
  }

  /* ------------------------------------------------------------ dispatch */
  function renderSlide(entering) {
    if (!D) return;
    switch (cur) {
      case IDX.join: renderJoin(); break;
      case IDX.results: renderResults(entering); break;
      case IDX.math: renderMath(); break;
      case IDX.lk: renderLk(); break;
      case IDX.nash: renderNash(); break;
      case IDX.why: renderWhy(); break;
      case IDX.again: renderAgain(); break;
      default: break;
    }
  }

  const saved = Number(store('t3-slide'));
  go(Number.isInteger(saved) && saved >= 0 && saved < slides.length ? saved : 0);
  poll();
  showDock();
})();
