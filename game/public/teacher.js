// The projector deck. Arrow keys (or a clicker) move; O/C/R/N/B/F run the game.
(function () {
  'use strict';
  const { LEVELS, JOKES, fmt, esc, confetti } = window.TT;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ------------------------------------------------------------ teacher key */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* fine */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* fine */ } },
  };
  const params = new URLSearchParams(location.search);
  if (params.has('key')) {
    store.set('tt-key', params.get('key'));
    params.delete('key');
    history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash);
  }
  let key = store.get('tt-key') || '';

  /* ------------------------------------------------------------------ deck */
  const slides = $$('.slide');
  const idx = (name) => slides.findIndex((s) => s.dataset.name === name);
  const SL = { join: idx('Join'), results: idx('Results'), math: idx('The math'), lk: idx('Level-k'), nash: idx('Nash'), why: idx('Why not zero?') };
  let cur = Math.min(slides.length - 1, Math.max(0, parseInt(store.get('tt-slide') || '0', 10) || 0));
  const steps = slides.map(() => 0);
  let D = null; // latest /api/room
  const drawn = {}; // per-chart key, so we only redraw (and re-animate) when something changed

  function fit() {
    const s = Math.min(innerWidth / 1600, innerHeight / 900);
    const st = $('#stage');
    st.style.transform = `scale(${s})`;
    st.style.left = `${(innerWidth - 1600 * s) / 2}px`;
    st.style.top = `${(innerHeight - 900 * s) / 2}px`;
  }
  addEventListener('resize', fit);
  fit();

  const dots = $('#dots');
  slides.forEach((s, i) => {
    const b = document.createElement('button');
    b.title = `${i + 1}. ${s.dataset.name}`;
    b.addEventListener('click', () => go(i));
    dots.appendChild(b);
  });

  function go(i, fromEnd) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    if (i !== cur) steps[i] = fromEnd ? (+slides[i].dataset.steps || 1) - 1 : 0;
    cur = i;
    store.set('tt-slide', String(i));
    slides.forEach((s, j) => s.classList.toggle('on', j === i));
    $$('#dots button').forEach((b, j) => b.classList.toggle('on', j === i));
    Object.keys(drawn).forEach((k) => delete drawn[k]); // replay animations on arrival
    render();
  }

  function next() {
    const n = +slides[cur].dataset.steps || 1;
    if (cur === SL.results && D && D.admin && (D.status === 'closed' || D.status === 'revealed') && D.stage < 4) return act('reveal');
    if (steps[cur] < n - 1) { steps[cur] += 1; return render(); }
    go(cur + 1);
  }
  function prev() {
    if (steps[cur] > 0) { steps[cur] -= 1; return render(); }
    go(cur - 1, true);
  }

  /* ---------------------------------------------------------------- server */
  async function api(url, body) {
    const opts = { headers: { 'x-teacher-key': key }, cache: 'no-store' };
    if (body !== undefined) Object.assign(opts, { method: 'POST', body: JSON.stringify(body), headers: { ...opts.headers, 'Content-Type': 'application/json' } });
    const r = await fetch(url, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Fumble on the server.');
    return j;
  }

  let warnedKey = false;
  async function poll() {
    try {
      D = await api('api/room');
      document.body.classList.toggle('admin', D.admin);
      $('#viewonly').hidden = D.admin;
      if (key && !D.admin && !warnedKey) { warnedKey = true; toast('That teacher key didn’t work. View only.'); store.del('tt-key'); key = ''; }
      render();
    } catch (e) { /* the site may be waking up; keep trying */ }
    setTimeout(poll, document.hidden ? 3000 : 1000);
  }

  async function act(a) {
    if (!D || !D.admin) return toast('View only: add ?key=… to the address to take control.');
    if (a === 'reset' && !confirm('Reset everything? Everyone, every round, gone. Like our playoff hopes.')) return;
    try {
      await api(`api/admin/${a}`, {});
      D = await api('api/room');
      if (a === 'open' || a === 'newround' || a === 'reset') go(SL.join);
      else if (a === 'reveal' || a === 'replay') { if (a === 'replay') delete drawn.res; go(SL.results); }
      else render();
      if (a === 'robots') toast('25 robots have entered the stadium. They also can’t block.');
      if (a === 'close') toast('Whistle! Guessing is closed.');
    } catch (e) { toast(e.message); }
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------------------------------------------------------- field chart */
  // Guesses 0-100 map onto a 100-yard field. The only field in Ann Arbor where we reliably go the distance.
  const X0 = 100, X1 = 1300, YT = 60;
  let FH = 520, YB = 440; // field height and bar baseline; the Nash chart is taller
  const setH = (h) => { FH = h; YB = h - 80; };
  const X = (g) => X0 + (g / 100) * (X1 - X0);

  function fieldBase() {
    let s = '';
    for (let i = 0; i < 20; i++) s += `<rect class="${i % 2 ? 'turf-b' : 'turf-a'}" x="${X(i * 5)}" y="0" width="${X(5) - X(0)}" height="${FH}"/>`;
    s += `<rect class="ez-l" x="0" y="0" width="${X0}" height="${FH}"/><rect class="ez-r" x="${X1}" y="0" width="${1400 - X1}" height="${FH}"/>`;
    s += `<text class="ez-text" fill="#FFCB05" transform="translate(64 ${FH / 2}) rotate(-90)" text-anchor="middle">MICHIGAN</text>`;
    s += `<text class="ez-text" fill="#00274C" transform="translate(1336 ${FH / 2}) rotate(90)" text-anchor="middle">GO BLUE</text>`;
    for (let g = 0; g <= 100; g += 10) s += `<line class="yard" x1="${X(g)}" x2="${X(g)}" y1="0" y2="${FH}"/>`;
    for (let g = 1; g < 100; g++) if (g % 10) s += `<line class="hash" x1="${X(g)}" x2="${X(g)}" y1="${g % 5 ? FH - 20 : 0}" y2="${g % 5 ? FH - 8 : FH}"/>`;
    for (let g = 0; g <= 100; g += 10) s += `<text class="ynum" x="${X(g)}" y="${FH - 38}">${g}</text>`;
    return s;
  }

  function bins(guesses, w = 2) {
    const n = Math.ceil(100 / w), c = new Array(n).fill(0);
    guesses.forEach((g) => { c[Math.min(n - 1, Math.floor(g / w))] += 1; });
    return c;
  }

  function barsSvg(guesses, { winGuess = null, bound = null, animate = true } = {}) {
    const w = 2, c = bins(guesses, w), max = Math.max(1, ...c);
    const winBin = winGuess == null ? -1 : Math.min(c.length - 1, Math.floor(winGuess / w));
    let s = '';
    c.forEach((k, i) => {
      if (!k) return;
      const h = (k / max) * (YB - YT - 30);
      const cls = ['bar', i === winBin ? 'win' : '', bound != null && i * w >= bound ? 'gone' : ''].join(' ');
      s += `<rect class="${cls}" x="${X(i * w) + 2}" y="${YB - h}" width="${X(w) - X(0) - 4}" height="${h}" rx="3" style="animation-delay:${animate ? (i * 12) : 0}ms${animate ? '' : ';animation:none'}"><title>${i * w}–${i * w + w}: ${k}</title></rect>`;
    });
    return s;
  }

  function lineSvg(g, cls, label, y, fill, color, delay = 0) {
    const x = X(g);
    const tw = Math.max(90, label.length * 14 + 26);
    const tx = Math.min(X1 - tw / 2, Math.max(X0 + tw / 2, x));
    return `<line class="line ${cls}" x1="${x}" x2="${x}" y1="${y + 22}" y2="${YB + 10}" style="animation-delay:${delay}ms"/>`
      + `<g class="tag" style="animation-delay:${delay}ms"><rect x="${tx - tw / 2}" y="${y - 20}" width="${tw}" height="42" fill="${fill}"/><text x="${tx}" y="${y + 1}" fill="${color}">${esc(label)}</text></g>`;
  }

  const emptySvg = (msg) => `<text class="empty" x="700" y="${FH / 2 - 10}">${esc(msg)}</text>`;

  /* --------------------------------------------------------------- render */
  function render() {
    slides.forEach((s, j) => s.classList.toggle('on', j === cur));
    $$('#dots button').forEach((b, j) => b.classList.toggle('on', j === cur));
    if (!D) return;
    const pillText = { lobby: 'Pregame', open: 'Guessing open', closed: 'Whistle', revealed: 'Final' }[D.status];
    $$('#dock-status, #join-status').forEach((p) => { p.className = `pill ${D.status}`; p.lastElementChild.textContent = pillText; });
    $$('[data-act]').forEach((b) => { b.disabled = !enabled(b.dataset.act); });
    const name = slides[cur].dataset.name;
    if (name === 'Join') renderJoin();
    if (name === 'Results') renderResults();
    if (name === 'The math') renderMath();
    if (name === 'Level-k') renderLevelK();
    if (name === 'Nash') renderNash();
    if (name === 'Why not zero?') renderWhy();
  }

  function enabled(a) {
    const s = D.status;
    if (a === 'open') return s === 'lobby';
    if (a === 'close') return s === 'open';
    if (a === 'reveal') return s === 'open' || s === 'closed' || (s === 'revealed' && D.stage < 4);
    if (a === 'replay') return s === 'revealed';
    if (a === 'robots') return s === 'lobby' || s === 'open';
    return true;
  }

  let jokeAt = 0, jokeI = Math.floor(Math.random() * JOKES.length), qrRound = null;
  function renderJoin() {
    if (qrRound !== 1) { $('#qr').src = 'qr.svg'; qrRound = 1; }
    $('#join-url').textContent = D.joinUrl.replace(/^https?:\/\//, '');
    $('#n-joined').textContent = D.joined.toLocaleString();
    $('#n-guessed').textContent = D.guessed.toLocaleString();
    $('#join-head').textContent = { lobby: D.round > 1 ? `Round ${D.round}: scan to play` : 'Scan to play', open: 'Guessing is open!', closed: 'Whistle! Guesses are in', revealed: 'That’s the game' }[D.status];
    const tk = $('#ticker'), names = D.ticker.slice(-6);
    const k = names.join('|');
    if (tk.dataset.k !== k) { tk.dataset.k = k; tk.innerHTML = names.map((n) => `<span>&#10003; ${esc(n)}</span>`).join(''); }
    if (Date.now() - jokeAt > 12000) { jokeAt = Date.now(); jokeI = (jokeI + 1) % JOKES.length; $('#join-joke').textContent = JOKES[jokeI]; }
  }

  let celebratedRound = null;
  function renderResults() {
    const R = D.result, stage = D.stage;
    $('#res-round').textContent = `Round ${D.round}`;
    $('#res-next').textContent = D.status === 'open' ? 'Whistle & reveal →' : ['Show the guesses →', 'Show the average →', 'Show ⅔ × average →', 'Show the winner →', 'Final'][stage] || 'Final';
    $$('.s-results .stat').forEach((s) => s.classList.toggle('hidden', !R || stage < +s.dataset.stage));
    const svg = $('#res-field');
    const k = `res:${D.round}:${D.status}:${stage}:${R ? R.n : 0}:${D.guessed}`;
    if (drawn.res === k) return;
    const prevStage = drawn.resStage;
    drawn.res = k; drawn.resStage = `${D.round}:${stage}`;
    setH(520);
    let s = fieldBase();
    if (!R || stage < 1) {
      s += emptySvg(D.status === 'open' ? `${D.guessed} guesses locked in. No peeking.` : D.status === 'closed' ? 'The guesses are in. Ready for the reveal?' : 'Kickoff hasn’t happened yet.');
    } else if (!R.n) {
      s += emptySvg('Nobody guessed. The Nash equilibrium of not showing up.');
    } else {
      const animateBars = !prevStage || prevStage === `${D.round}:0` || !prevStage.startsWith(`${D.round}:`) || stage === 1;
      s += barsSvg(R.guesses, { winGuess: stage >= 4 ? R.winners[0].guess : null, animate: animateBars });
      if (stage >= 2) s += lineSvg(R.mean, 'mean', `Average ${fmt(R.mean)}`, 30, '#ffffff', '#00274C', stage === 2 ? 0 : -1000);
      if (stage >= 3) s += lineSvg(R.target, 'target', `⅔ × avg = ${fmt(R.target, 2)}`, 88, '#FFCB05', '#00274C', stage === 3 ? 0 : -1000);
    }
    svg.innerHTML = s;
    if (R && R.n) {
      $('#st-n').textContent = R.n.toLocaleString();
      $('#st-mean').textContent = fmt(R.mean, 2);
      $('#st-target').textContent = fmt(R.target, 2);
      const W = R.winners;
      $('#st-win-label').textContent = W.length > 1 ? `${W.length}-way tie for the win` : 'Hail to the Victor';
      $('#st-win').textContent = W.length > 1 ? W.slice(0, 3).map((w) => w.name).join(', ') + (W.length > 3 ? '…' : '') : W[0].name;
      $('#st-win-guess').textContent = `guessed ${fmt(W[0].guess, 2)}, off by ${fmt(R.winDist, 2)}${W.length === 1 && W[0].school ? ` · ${W[0].school}` : ''}`;
      if (stage >= 4 && celebratedRound !== D.round) { celebratedRound = D.round; confetti(4500); }
    }
  }

  function needResult(el) {
    if (D.result && D.result.n && D.stage >= 1) return false;
    el.innerHTML = '<p class="quip dark">Play a round and reveal the results first. (Or press <b>B</b> for 25 robots, then <b>R</b>.)</p>';
    return true;
  }

  function renderMath() {
    const eq = $('#math-eq');
    if (needResult(eq)) { $('#math-facts').innerHTML = ''; $('#math-quip').textContent = ''; return; }
    const R = D.result;
    const box = (label, v, cls = '') => `<div class="box ${cls}"><span>${label}</span><b>${v}</b></div>`;
    eq.innerHTML = box('Sum of guesses', fmt(R.sum, 1)) + '<span class="op">&divide;</span>' + box('Players', R.n.toLocaleString())
      + '<span class="op">=</span>' + box('Average', fmt(R.mean, 2)) + '<span class="op">&times; &#8532; =</span>' + box('Target', fmt(R.target, 2), 'hot')
      + '<span class="op">&rarr;</span>' + box(R.winners.length > 1 ? 'Closest guesses' : 'Closest guess', fmt(R.winners[0].guess, 2), 'win');
    const pct = (k) => `${Math.round((100 * k) / R.n)}%`;
    $('#math-facts').innerHTML = [
      [fmt(R.median, 2), 'Median guess'],
      [`${fmt(R.min)}–${fmt(R.max)}`, 'Lowest to highest'],
      [`${R.levels.dom} <small>(${pct(R.levels.dom)})</small>`, 'Guessed above 66.7, which can never win'],
      [`${R.zeros} <small>(${pct(R.zeros)})</small>`, 'Went straight to 0, the Nash equilibrium'],
    ].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
    $('#math-quip').textContent = R.levels.dom > 0
      ? `${R.levels.dom === 1 ? 'One brave soul' : `${R.levels.dom} brave souls`} guessed above 66.7. Even if everyone said 100, the target would only be 66.7. We’ll put them in charge of our clock management.`
      : 'Nobody guessed above 66.7. This room already has better judgment than our fourth-down decisions.';
  }

  const LADDER = [
    ['L0', 'Doesn’t model anyone: picks at random. Average ≈ 50.'],
    ['L1', 'Best response to Level 0: ⅔ × 50 = 33.3'],
    ['L2', 'Best response to Level 1: ⅔ × 33.3 = 22.2'],
    ['L3', '⅔ × 22.2 = 14.8'],
    ['L4', '⅔ × 14.8 = 9.9'],
    ['L5', 'Keep going… 6.6, 4.4, 2.9…'],
    ['nash', 'Infinitely many steps: everyone says 0.'],
    ['dom', 'Above 66.7. Never a best response.'],
  ];
  const LK_CALLS = [
    'Start with a <b>Level 0</b> player who doesn’t think strategically at all. Picking at random, they average <b>50</b>.',
    'A <b>Level 1</b> player thinks everyone else is Level 0. Best response: <b>⅔ × 50 ≈ 33</b>.',
    'A <b>Level 2</b> player thinks everyone else is Level 1. Best response: <b>⅔ × 33 ≈ 22</b>.',
    'Level 3 says 15. Each extra step of “I think that they think” multiplies by another ⅔.',
    'Level 4 says 10. By now you are thinking more plays ahead than our offensive coordinator.',
    'Level 5 and up: 6.6, 4.4, 2.9… the guesses shrink toward zero.',
    'Take infinitely many steps and you reach <b>0</b>: the Nash equilibrium, where everyone is best-responding to everyone else.',
    null, // computed from this room's data
  ];

  function renderLevelK() {
    const step = steps[cur], R = D.result && D.result.n && D.stage >= 1 ? D.result : null;
    $('#ladder').innerHTML = LADDER.map(([k, d], i) => {
      const L = LEVELS[k];
      const share = R ? `${Math.round((100 * R.levels[k]) / R.n)}%<small>of the room</small>` : '';
      return `<li class="${k} ${i > step ? 'hidden' : ''} ${i === step ? 'cur' : ''}"><div class="lv">${L.label}<small>${L.short}</small></div><div>${d}</div><div class="share">${share}</div></li>`;
    }).join('');

    let call = LK_CALLS[step];
    if (step === 7) {
      if (!R) call = 'Play a round to see how many steps of reasoning <b>this room</b> took.';
      else {
        const top = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'nash'].reduce((a, b) => (R.levels[b] > R.levels[a] ? b : a), 'L0');
        call = R.impliedK == null ? 'Everyone said zero. This room is pure Nash, and frankly a little intimidating.'
          : `This room averaged <b>${fmt(R.mean)}</b>: what a room of identical <b>Level ${fmt(R.impliedK)}</b> thinkers would produce. The winning move was one step beyond the crowd: <b>${fmt(R.target)}</b>. Most common type here: <b>${LEVELS[top].label}</b>.`;
      }
    }
    $('#lk-call').innerHTML = call;

    const svg = $('#lk-field');
    const k = `lk:${D.round}:${R ? R.n : 0}:${step}`;
    if (drawn.lk === k) return;
    const first = !drawn.lk;
    drawn.lk = k;
    setH(520);
    let s = fieldBase();
    s += R ? barsSvg(R.guesses, { animate: first }) : '';
    const vals = [50, 100 / 3, 200 / 9, 400 / 27, 800 / 81];
    vals.forEach((v, i) => { if (i <= step && i <= 4) s += lineSvg(v, 'level', `L${i}`, i % 2 ? 88 : 30, '#00274C', '#FFCB05', i === step ? 0 : -1000); });
    if (step >= 6) s += lineSvg(0.6, 'target', 'Nash', 30, '#FFCB05', '#00274C', step === 6 ? 0 : -1000);
    if (step >= 7 && R) s += lineSvg(R.mean, 'mean', `Room avg ${fmt(R.mean)}`, 146, '#ffffff', '#00274C');
    svg.innerHTML = s;
  }

  const BOUNDS = [100, 200 / 3, 400 / 9, 800 / 27, 1600 / 81, 3200 / 243, 6400 / 729, 0];
  function renderNash() {
    const step = steps[cur], R = D.result && D.result.n && D.stage >= 1 ? D.result : null;
    const b = BOUNDS[step], prevB = BOUNDS[Math.max(0, step - 1)];
    const surv = R ? R.guesses.filter((g) => g <= b + 1e-9).length : 0;
    const room = R ? `<p class="small">In this room, <b>${surv}</b> of ${R.n} guesses (${Math.round((100 * surv) / R.n)}%) ${step === 7 ? 'were exactly 0' : 'survive this round'}.</p>` : '';
    let html;
    if (step === 0) html = '<div class="step-k">The setup</div><p>Any number from 0 to 100 is allowed. Which ones could ever be a <b>best response</b>?</p>';
    else if (step === 1) html = '<div class="step-k">Round 1 of elimination</div><p>Even if everyone guessed 100, the target would be</p><div class="math">⅔ × 100 = 66.7</div><p>So any guess above 66.7 is <b>dominated</b>: it can never win. A rational player crosses them off.</p>';
    else if (step === 2) html = '<div class="step-k">Round 2</div><p>If everyone is rational, nobody guesses above 66.7, so the target can be at most</p><div class="math">⅔ × 66.7 = 44.4</div><p>This step needs you to know that <i>others</i> are rational.</p>';
    else if (step < 7) html = `<div class="step-k">Round ${step}</div><p>Knowing that they know that they know… (${step - 1} levels deep):</p><div class="math">⅔ × ${fmt(prevB)} = ${fmt(b)}</div><p class="small">${step === 6 ? 'Every round shrinks the field by a third. This is the opposite of how our defense works.' : 'Each round of reasoning needs one more layer of “and everyone knows that…”.'}</p>`;
    else html = '<div class="step-k">Repeat forever</div><p>Only one number survives every round:</p><div class="math">0</div><p>If everyone says 0, the target is ⅔ × 0 = 0, and nobody can do better by switching. That is the <b>unique Nash equilibrium</b>.</p>';
    $('#nash-text').innerHTML = html + room;
    $('#bounds').innerHTML = BOUNDS.slice(0, step + 1).map((v, i) => `<span class="${i === step ? (i === 7 ? 'zero cur' : 'cur') : ''}">${i === 7 ? '0' : fmt(v)}</span>`).join('<span style="border:0;background:none">&rarr;</span>');

    const svg = $('#nash-field');
    const k = `nash:${D.round}:${R ? R.n : 0}`;
    if (drawn.nash !== k) {
      drawn.nash = k;
      setH(700);
      let s = fieldBase();
      s += `<rect class="dead" x="${X(100)}" y="0" width="0" height="${FH}"/>`;
      if (R) {
        // A strip of dots, jittered by a fixed hash so they don't jump between steps.
        R.guesses.forEach((g, i) => {
          const y = YT + 10 + (((i * 2654435761) >>> 0) % 1000) / 1000 * (YB - YT - 20);
          s += `<circle class="dot" data-g="${g}" cx="${X(g)}" cy="${y}" r="${R.n > 400 ? 7 : 11}"/>`;
        });
      } else s += emptySvg('Play a round to see the room’s guesses here.');
      s += `<g id="bound-line"></g>`;
      svg.innerHTML = s;
    }
    const dead = $('.dead', svg);
    dead.style.x = `${X(b)}px`;
    dead.style.width = `${X(100) - X(b)}px`;
    $$('.dot', svg).forEach((c) => c.classList.toggle('gone', +c.dataset.g > b + 1e-9));
    setH(700);
    $('#bound-line', svg).innerHTML = step === 0 ? '' : lineSvg(step === 7 ? 0.6 : b, 'bound', step === 7 ? 'Nash: 0' : `≤ ${fmt(b)}`, 30, '#c8102e', '#ffffff');
  }

  function renderWhy() {
    const rows = [];
    (D.history || []).slice(0, 3).forEach((h) => rows.push({ label: `This room, round ${h.round} (average)`, v: h.mean, us: true }));
    if (!rows.length && D.result && D.result.n && D.stage >= 2) rows.push({ label: `This room, round ${D.round} (average)`, v: D.result.mean, us: true });
    rows.push({ label: 'Nagel (1995) lab subjects (average)', v: 36.7 });
    rows.push({ label: '<i>FT</i> readers, 1997 (winning number)', v: 13 });
    const k = JSON.stringify(rows);
    const bars = $('#cmp-bars');
    if (bars.dataset.k !== k) {
      bars.dataset.k = k;
      bars.innerHTML = rows.map((r) => `<div class="cmp ${r.us ? 'us' : ''}"><div>${r.label}</div><div class="track"><div class="fill" style="width:0%">${fmt(r.v)}</div></div></div>`).join('');
      requestAnimationFrame(() => requestAnimationFrame(() => $$('.fill', bars).forEach((f, i) => { f.style.width = `${Math.max(4, rows[i].v)}%`; })));
    }
    $('.cmp-title').textContent = 'How this room stacks up (0 to 100)';
    const H = D.history || [];
    $('#hist-line').textContent = H.length ? H.map((h) => `Round ${h.round}: average ${fmt(h.mean)}, target ${fmt(h.target)}`).join('  ·  ') : '';
  }

  /* -------------------------------------------------------------- controls */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a) return act(a.dataset.act);
    const n = e.target.closest('[data-nav]');
    if (n) return (+n.dataset.nav > 0 ? next() : prev());
  });
  $('#fs').addEventListener('click', toggleFs);
  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key;
    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); prev(); }
    else if (k === 'Home') go(0);
    else if (k === 'End') go(slides.length - 1);
    else if (/^[1-9]$/.test(k)) go(+k - 1);
    else if (k === 'f' || k === 'F') toggleFs();
    else if (k === 'o' || k === 'O') act('open');
    else if (k === 'c' || k === 'C') act('close');
    else if (k === 'r' || k === 'R') act(D && D.status === 'revealed' && D.stage >= 4 ? 'replay' : 'reveal');
    else if (k === 'n' || k === 'N') act('newround');
    else if (k === 'b' || k === 'B') act('robots');
  });

  let dockTimer;
  addEventListener('mousemove', () => {
    $('#dock').classList.add('show');
    clearTimeout(dockTimer);
    dockTimer = setTimeout(() => $('#dock').classList.remove('show'), 2500);
  });

  go(cur);
  poll();
})();
