// Projector deck: runs the round and teaches with the room's own data.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (x, d = 1) => (x == null || !Number.isFinite(+x) ? '–' : Number.isInteger(+x) ? String(+x) : (+x).toFixed(d).replace(/\.0+$/, ''));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  /* ------------------------------------------------------- teacher key */

  const params = new URLSearchParams(location.search);
  if (params.has('key')) {
    store.set('gbgl-key', params.get('key'));
    params.delete('key');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
  }
  let KEY = store.get('gbgl-key') || '';
  let isTeacher = false;
  async function checkKey() {
    try {
      const r = await fetch('api/check-key', { headers: { 'x-teacher-key': KEY } });
      isTeacher = (await r.json()).ok;
    } catch (e) { isTeacher = false; }
    document.body.classList.toggle('viewonly', !isTeacher);
  }

  async function admin(action) {
    if (!isTeacher) return;
    try {
      await fetch('api/admin/' + action, { method: 'POST', headers: { 'x-teacher-key': KEY } });
    } catch (e) { /* ignore */ }
    await poll();
  }

  /* --------------------------------------------------------- scaling */

  const stage = $('stage');
  function fit() {
    const s = Math.min(innerWidth / 1600, innerHeight / 900);
    stage.style.transform = `scale(${s})`;
  }
  addEventListener('resize', fit);
  fit();

  /* ------------------------------------------------------------ slides */

  const slides = [...document.querySelectorAll('.slide')];
  const S = { title: 0, rules: 1, join: 2, results: 3, math: 4, levelk: 5, nash: 6, why: 7, build: 8 };
  let cur = Math.min(+(location.hash.slice(1) || 1) - 1 || 0, slides.length - 1);
  let resStep = 0; // 0 nothing, 1 histogram, 2 average, 3 target, 4 winner
  let nashStep = 0;
  const NASH_MAX = 12;

  function go(i) {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, j) => s.classList.toggle('on', j === cur));
    $('slide-no').textContent = `${cur + 1} / ${slides.length} · ${slides[cur].dataset.name}`;
    history.replaceState(null, '', '#' + (cur + 1));
    if (cur === S.results && room && room.phase === 'open') admin('close');
    renderAll();
  }

  function next() {
    if (cur === S.results && hasResult() && resStep < 4) { stepResults(resStep + 1); return; }
    if (cur === S.nash && nashStep < NASH_MAX) { nashStep++; renderNash(); return; }
    go(cur + 1);
  }
  function prev() {
    if (cur === S.nash && nashStep > 0) { nashStep--; renderNash(); return; }
    go(cur - 1);
  }

  function stepResults(n) {
    resStep = n;
    if (resStep >= 4 && room.phase !== 'revealed') admin('reveal');
    if (resStep === 4) setTimeout(() => window.confetti && confetti(5000), 150);
    renderResults();
  }

  /* ------------------------------------------------------------- state */

  let room = null;
  const hasResult = () => room && room.result && room.result.n > 0;
  let lastRound = null;

  async function poll() {
    try {
      const r = await fetch('api/room', { cache: 'no-store' });
      room = await r.json();
      if (lastRound !== null && room.round !== lastRound) { resStep = 0; nashStep = 0; }
      if (room.phase === 'revealed' && resStep < 4 && lastRound === null) resStep = 4; // reloaded mid-show
      lastRound = room.round;
      renderAll();
    } catch (e) { /* server waking up */ }
  }
  setInterval(poll, 1500);

  /* ------------------------------------------------------------ jokes */

  const JOIN_JOKES = [
    'Scan the code. It\'s the most accurate pass anyone in Michigan has thrown this season.',
    'No wrong answers! (There are wrong answers. Anything above 66.7, for a start.)',
    'Your guess is anonymous. Unlike our quarterback\'s stats, sadly.',
    'Change your guess as often as you like. Michigan changes coordinators about as often.',
    'Fun fact: Wi-Fi in the Big House is also two-thirds of what it should be.',
  ];
  const RES_JOKES = [
    'Press → to reveal, one step at a time. Suspense: the one thing Michigan football still delivers.',
    'Remember: the goal was to be low. Michigan\'s offense took that personally.',
  ];
  let jokeI = 0;
  setInterval(() => { jokeI++; renderJokes(); }, 12000);
  function renderJokes() {
    $('join-joke').textContent = JOIN_JOKES[jokeI % JOIN_JOKES.length];
    $('res-joke').textContent = RES_JOKES[jokeI % RES_JOKES.length];
  }

  /* -------------------------------------------------------- level-k */

  const LEVELS = [0, 1, 2, 3, 4].map((k) => 50 * Math.pow(2 / 3, k));
  function levelOf(g) {
    if (g > 200 / 3 + 1e-9) return 'dom';
    if (g < 2) return 'nash';
    for (let k = 0; k < LEVELS.length - 1; k++) if (g >= (LEVELS[k] + LEVELS[k + 1]) / 2) return `L${k}`;
    return 'L4+';
  }
  const LEVEL_ROWS = [
    ['dom', 'Dominated', 'above 66.7', '67+'],
    ['L0', 'Level 0', 'picks at random', '50'],
    ['L1', 'Level 1', '⅔ × 50', '33.3'],
    ['L2', 'Level 2', '⅔ × 33.3', '22.2'],
    ['L3', 'Level 3', '⅔ × 22.2', '14.8'],
    ['L4+', 'Level 4+', '⅔ × 14.8, and on', '≤ 9.9'],
    ['nash', 'Nash', 'all the way down', '0'],
  ];
  const LEVEL_NAME = Object.fromEntries(LEVEL_ROWS.map((r) => [r[0], r[1]]));

  /* ------------------------------------------------------------ render */

  function renderAll() {
    if (!room) return;
    renderJoin();
    renderResults();
    renderMath();
    renderLevelK();
    renderNash();
    renderWhy();
  }

  function renderJoin() {
    const pill = $('phase-pill');
    const P = {
      lobby: ['Waiting for kickoff', ''],
      open: ['● Guessing is open', 'open'],
      closed: ['Whistle blown', 'closed'],
      revealed: ['Results are in', 'closed'],
    }[room.phase];
    pill.textContent = `Round ${room.round} · ${P[0]}`;
    pill.className = 'pill ' + P[1];
    $('c-joined').textContent = room.joined;
    $('c-guessed').textContent = room.guessed;
    const feed = room.feed.slice(0, 12);
    const fk = feed.join('|');
    if ($('feed').dataset.k !== fk) {
      $('feed').dataset.k = fk;
      $('feed').innerHTML = feed.length ? feed.map((n) => `<span>${esc(n)}</span>`).join('') : '<span style="opacity:.5">Nobody yet. Be the first!</span>';
    }
    const sk = JSON.stringify(room.schools);
    if ($('schools').dataset.k !== sk) {
      $('schools').dataset.k = sk;
      $('schools').innerHTML = room.schools.length
        ? room.schools.map((s) => `<span>${esc(s.name)}<b>${s.n}</b></span>`).join('')
        : '<span style="opacity:.5">Tell us where you\'re from when you join</span>';
    }
    $('b-open').disabled = !(room.phase === 'lobby' || room.phase === 'closed');
    $('b-open').textContent = room.phase === 'closed' ? 'Reopen guessing' : 'Open guessing';
    $('b-close').disabled = room.phase !== 'open';
    $('b-reveal').disabled = !(room.phase !== 'lobby');
  }

  function renderResults() {
    const R = room.result;
    $('res-n').textContent = R ? `${R.n} guesses · round ${room.round}` : `Round ${room.round}`;
    const svg = $('hist');
    const set = (id, shown, val) => { $(id).classList.toggle('shown', shown); $(id).querySelector('b').innerHTML = shown ? val : '?'; };
    if (!hasResult()) {
      svg.innerHTML = `<text x="530" y="340" text-anchor="middle" class="ax-t" style="font-size:30px">${room.phase === 'open' ? 'Guessing is still open. Blow the whistle first!' : room.phase === 'lobby' ? 'No round yet. Open guessing on the Join slide.' : 'Nobody guessed. Bold strategy.'}</text>`;
      set('rv-mean', false); set('rv-target', false); set('rv-winner', false);
      $('res-hint').textContent = '';
      return;
    }
    const step = resStep;
    set('rv-mean', step >= 2, fmt(R.mean, 2));
    set('rv-target', step >= 3, fmt(R.target, 2));
    const w = R.winners;
    const wHtml = w.length === 1
      ? `${esc(w[0].name)}<small>guessed ${fmt(w[0].guess, 2)}${w[0].school ? ' · ' + esc(w[0].school) : ''}</small>`
      : `${w.length}-way tie!<small>${w.slice(0, 4).map((x) => esc(x.name)).join(', ')}${w.length > 4 ? '…' : ''} · guessed ${fmt(w[0].guess, 2)}</small>`;
    set('rv-winner', step >= 4, wHtml);
    $('rv-winner').querySelector('span').textContent = step >= 4 ? (w.length > 1 ? 'Hail to the Victors!' : 'Hail to the Victor!') : 'Winner';
    $('res-hint').textContent = ['Press → to show the guesses', 'Press → for the average', 'Press → for the target', 'Press → for the winner', 'Press → to see how it worked'][step];

    // histogram: marker lines sit behind the bars, their labels on top
    const X0 = 70, X1 = 1030, YT = 110, YB = 600;
    const x = (v) => X0 + (v / 100) * (X1 - X0);
    const bins = new Array(20).fill(0);
    for (const g of R.guesses) bins[Math.min(19, Math.floor(g / 5))]++;
    const max = Math.max(1, ...bins);
    const winBin = Math.min(19, Math.floor(R.target / 5));
    const marks = [];
    if (step >= 2) marks.push([R.mean, 'mk-mean', `Average ${fmt(R.mean)}`, '#2F65A7', 38]);
    if (step >= 3) marks.push([R.target, 'mk-target', `Target ${fmt(R.target)}`, '#b07f00', 76]);
    let h = '';
    h += `<rect class="dom-zone" x="${x(200 / 3)}" y="${YT - 50}" width="${x(100) - x(200 / 3)}" height="${YB - YT + 50}"/>`;
    h += `<text class="dom-t" x="${(x(200 / 3) + x(100)) / 2}" y="${YT - 22}" text-anchor="middle">Dominated: can never win</text>`;
    for (const [v, cls, , , ly] of marks) h += `<line class="mk-line ${cls}" x1="${x(v)}" x2="${x(v)}" y1="${ly + 10}" y2="${YB}"/>`;
    bins.forEach((c, i) => {
      const bh = step >= 1 ? (c / max) * (YB - YT - 30) : 0;
      const cls = step >= 4 && i === winBin ? 'bar-r win' : 'bar-r';
      h += `<rect class="${cls}" x="${x(i * 5) + 3}" y="${YB - bh}" width="${x(5) - x(0) - 6}" height="${bh}" rx="4"/>`;
      if (step >= 1 && c) h += `<text class="bar-n" x="${x(i * 5 + 2.5)}" y="${YB - bh - 8}" text-anchor="middle">${c}</text>`;
    });
    h += `<line class="ax" x1="${X0}" x2="${X1}" y1="${YB}" y2="${YB}"/>`;
    for (let v = 0; v <= 100; v += 10) h += `<text class="ax-t" x="${x(v)}" y="${YB + 30}" text-anchor="middle">${v}</text>`;
    h += `<text class="ax-t" x="${(X0 + X1) / 2}" y="${YB + 62}" text-anchor="middle">Guess</text>`;
    for (const [v, , label, color, ly] of marks) {
      const tx = Math.max(X0 + 90, Math.min(X1 - 90, x(v)));
      h += `<rect class="mk-lab-bg" x="${tx - 110}" y="${ly - 26}" width="220" height="34" rx="6"/>` +
        `<text class="mk-lab" x="${tx}" y="${ly}" text-anchor="middle" fill="${color}">${label}</text>`;
    }
    svg.innerHTML = h;
  }

  function renderMath() {
    const R = room.result;
    if (!hasResult()) {
      $('math-row').innerHTML = '<div class="eq"><span class="num">?</span><span>Play a round first</span></div>';
      $('facts').innerHTML = '';
      $('math-note').innerHTML = '';
      $('history').innerHTML = '';
      return;
    }
    const w = R.winners;
    $('math-row').innerHTML = `
      <div class="eq"><span class="num">${fmt(R.sum, 1)}</span><span>Sum of guesses</span></div>
      <div class="op">÷</div>
      <div class="eq"><span class="num">${R.n}</span><span>Players</span></div>
      <div class="op">=</div>
      <div class="eq"><span class="num">${fmt(R.mean, 2)}</span><span>Average</span></div>
      <div class="op">× ⅔ =</div>
      <div class="eq hot"><span class="num">${fmt(R.target, 2)}</span><span>Target</span></div>
      <div class="op">→</div>
      <div class="eq"><span class="num">${fmt(w[0].guess, 2)}</span><span>${w.length > 1 ? `Winning guess (${w.length} tied)` : 'Winning guess'}</span></div>`;
    const dom = R.levels.dom || 0;
    $('facts').innerHTML = `
      <div class="fact"><span class="num">${fmt(R.median, 1)}</span><p>Median guess. Half of you went lower.</p></div>
      <div class="fact"><span class="num">${fmt(R.min, 1)}–${fmt(R.max, 1)}</span><p>Range of guesses. Someone always says 100. ${R.hundreds ? `This time, ${R.hundreds}.` : 'Not today!'}</p></div>
      <div class="fact"><span class="num">${dom}</span><p>Guess${dom === 1 ? '' : 'es'} above 66.7, which can <b>never</b> win. ${dom ? 'You know who you are.' : 'A room of economists. Impressive.'}</p></div>
      <div class="fact"><span class="num">${R.zeros}</span><p>Zero${R.zeros === 1 ? '' : 's'}: the textbook answer. ${R.zeros ? 'Textbook right, room wrong.' : 'Nobody trusted the textbook.'}</p></div>`;
    $('math-note').innerHTML = `<b>The twist:</b> your own guess moves the average, but only by 1/${R.n} of it. So winning is almost entirely about predicting <i>everyone else</i>. That's what makes this a game, not a math problem.`;
    const H = room.history;
    $('history').innerHTML = H.length > 1
      ? `<table><tr><th>Round</th><th>Players</th><th>Average</th><th>Target</th><th>Winner</th></tr>${H.map((r) => `<tr><td>${r.round}</td><td>${r.n}</td><td>${fmt(r.mean, 2)}</td><td>${fmt(r.target, 2)}</td><td>${r.winners.map(esc).join(', ')}</td></tr>`).join('')}</table>`
      : '';
  }

  function renderLevelK() {
    const R = room.result;
    const has = hasResult();
    const wl = has ? levelOf(R.winners[0].guess) : null;
    const maxShare = has ? Math.max(1, ...Object.values(R.levels)) / R.n : 1;
    $('ladder').innerHTML = LEVEL_ROWS.map(([k, name, how, val]) => {
      const c = has ? R.levels[k] || 0 : 0;
      const pct = has ? (100 * c) / R.n : 0;
      return `<div class="rung ${k === 'dom' ? 'dom' : ''} ${k === wl ? 'best' : ''}">
        <div class="lv">${name}<small>${how}</small></div>
        <div class="val">${val}</div>
        <div class="track"><div class="fill" style="width:${pct / maxShare}%"></div></div>
        <div class="pct">${has ? Math.round(pct) + '%' : ''}</div></div>`;
    }).join('');
    if (!has) { $('lk-room').innerHTML = 'Play a round and we\'ll see how many steps this room takes.'; return; }
    const k = R.impliedK;
    const w = R.winners[0];
    $('lk-room').innerHTML = `
      <p>This room's average, <b>${fmt(R.mean)}</b>, is what you'd get if everyone thought <b>${k == null ? 'infinitely many' : fmt(k, 1)} step${fmt(k, 1) === '1' ? '' : 's'}</b> ahead.</p>
      <p>So the winning move was one step more: <b>${fmt(R.target)}</b>. ${esc(w.name)} guessed ${fmt(w.guess)}: <b>${LEVEL_NAME[wl]}</b>, highlighted.</p>`;
  }

  function renderNash() {
    const X0 = 60, X1 = 1400, AY = 240;
    const x = (v) => X0 + (v / 100) * (X1 - X0);
    const t = nashStep;
    const bound = t >= NASH_MAX ? 0 : 100 * Math.pow(2 / 3, t);
    const guesses = hasResult() ? room.result.guesses : [];
    // stack dots by integer value
    const stacks = new Map();
    for (const g of guesses) { const k = Math.round(g); stacks.set(k, (stacks.get(k) || 0) + 1); }
    const tallest = Math.max(1, ...stacks.values());
    const dy = Math.min(22, 180 / tallest);
    const seen = new Map();
    let h = `<rect class="nl-cut" x="${x(bound)}" y="20" width="${x(100) - x(bound)}" height="${AY - 10}"/>`;
    for (const g of guesses) {
      const k = Math.round(g);
      const i = seen.get(k) || 0; seen.set(k, i + 1);
      h += `<circle class="nl-dot ${g > bound + 1e-9 ? 'nl-dead' : 'nl-live'}" cx="${x(g)}" cy="${AY - 12 - i * dy}" r="10"/>`;
    }
    h += `<line class="ax" x1="${X0}" x2="${X1}" y1="${AY}" y2="${AY}"/>`;
    for (let v = 0; v <= 100; v += 10) h += `<text class="ax-t" x="${x(v)}" y="${AY + 32}" text-anchor="middle">${v}</text>`;
    h += `<line class="nl-bound" x1="${x(bound)}" x2="${x(bound)}" y1="12" y2="${AY + 6}"/>`;
    const lx = Math.max(X0 + 150, Math.min(X1 - 150, x(bound)));
    h += `<text class="nl-lab" x="${lx}" y="${AY + 76}" text-anchor="middle">${t === 0 ? 'Anything from 0 to 100' : t >= NASH_MAX ? 'Only 0 survives' : `Nothing above ${fmt(bound, 1)} survives`}</text>`;
    $('nashline').innerHTML = h;
    $('nash-step').textContent = t === 0 ? 'Press →' : t >= NASH_MAX ? 'Round ∞' : `Round ${t} of elimination`;

    const above = (b) => guesses.filter((g) => g > b + 1e-9).length;
    const newly = t > 0 && t < NASH_MAX ? above(bound) - above(100 * Math.pow(2 / 3, t - 1)) : 0;
    const youTxt = guesses.length ? ` That eliminates <b>${newly}</b> of your guesses.` : '';
    let cap;
    if (t === 0) cap = 'Every number from 0 to 100 is allowed. But are they all sensible? Let\'s eliminate the ones no rational player would choose.';
    else if (t === 1) cap = `Even if everyone says 100, the target is only ⅔ × 100 = <b>66.7</b>. Any guess above 66.7 is <b>dominated</b>: it can never win.${youTxt}`;
    else if (t === 2) cap = `If you believe <i>no one</i> plays a dominated strategy, the average can't top 66.7, so the target can't top <b>44.4</b>.${youTxt}`;
    else if (t === 3) cap = `If you believe that <i>they</i> believe that no one plays a dominated strategy, the bound falls to <b>29.6</b>.${youTxt}`;
    else if (t < NASH_MAX) cap = `Round ${t}: one more layer of "I know that you know that I know…" and the bound falls to <b>${fmt(bound, 1)}</b>.${youTxt}`;
    else {
      const z = guesses.filter((g) => g < 2).length;
      cap = `Repeat forever and only <b>0</b> survives. Everyone saying zero is the unique <b>Nash equilibrium</b>: given what everyone else does, no one gains by switching.${guesses.length ? ` ${z} of you were (nearly) there. And yet the target was ${fmt(room.result.target)}.` : ''}`;
    }
    $('nash-caption').innerHTML = cap;
  }

  function renderWhy() {
    const rows = [];
    if (hasResult()) rows.push(['This room (average)', room.result.mean, 'us']);
    rows.push(['Nagel (1995) lab', 36.7, ''], ['FT readers (1997)', 18.9, ''], ['Nash equilibrium', 0, '']);
    $('bench').innerHTML = rows.map(([n, v, c]) => `<div class="bench ${c}"><span>${n}</span><div class="bt"><div class="bf" style="width:${Math.max(0, v)}%">${fmt(v)}</div></div></div>`).join('')
      + (hasResult() ? `<p class="src" style="margin:6px 0 0">Winning number here: <b>${fmt(room.result.winners[0].guess)}</b>. In the <i>FT</i> contest it was 13.</p>` : '');
  }

  /* --------------------------------------------------------- controls */

  $('b-open').onclick = () => admin('open');
  $('b-close').onclick = () => admin('close');
  $('b-reveal').onclick = async () => { if (room.phase === 'open') await admin('close'); go(S.results); };
  $('b-again').onclick = async () => { await admin('next'); go(S.join); };

  const ACTS = {
    prev, next,
    open: () => admin('open'),
    close: () => admin('close'),
    reveal: async () => { if (room.phase === 'open') await admin('close'); if (cur !== S.results) go(S.results); else if (hasResult()) stepResults(Math.min(4, resStep + 1)); },
    newround: async () => { await admin('next'); go(S.join); },
    bots: () => admin('bots'),
    reset: async () => { if (confirm('Wipe every player, guess and round?')) { await admin('reset'); resStep = 0; nashStep = 0; go(S.join); } },
    full: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}),
  };
  document.querySelectorAll('#dock button').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); ACTS[b.dataset.act](); }; });

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); prev(); }
    else if (/^[1-9]$/.test(k)) go(+k - 1);
    else {
      const map = { o: 'open', c: 'close', r: 'reveal', n: 'newround', b: 'bots', f: 'full' };
      const a = map[k.toLowerCase()];
      if (a) ACTS[a]();
    }
  });

  // Dock appears when the mouse moves.
  let dockT = null;
  addEventListener('mousemove', () => {
    $('dock').classList.add('show');
    clearTimeout(dockT);
    dockT = setTimeout(() => $('dock').classList.remove('show'), 2500);
  });

  /* ------------------------------------------------------------- init */

  fetch('api/join-url').then((r) => r.json()).then((j) => { $('join-url').textContent = j.url.replace(/^https?:\/\//, ''); }).catch(() => {});
  renderJokes();
  checkKey().then(poll).then(() => go(cur));
})();
