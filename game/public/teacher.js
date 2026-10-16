// Teacher deck: slide navigation, game controls, and live results.
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const fmt = x => (Math.round(x * 10) / 10).toLocaleString();

  // ---------------------------------------------------------------- key
  const params = new URLSearchParams(location.search);
  let key = params.get('key') || localStorage.getItem('tt-key') || '';
  if (params.has('key')) {
    // Keep the key off the projector: remember it, then scrub it from the address bar.
    localStorage.setItem('tt-key', key);
    params.delete('key');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
  }
  if (key) {
    fetch('api/teacher/check', { headers: { 'x-teacher-key': key } }).then(r => {
      if (r.ok) document.body.classList.add('is-teacher');
      else { localStorage.removeItem('tt-key'); key = ''; }
    });
  }

  async function act(action, body) {
    if (action === 'reset' && !confirm('Reset everything, including past rounds?')) return;
    const r = await fetch('api/teacher/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-teacher-key': key },
      body: JSON.stringify(body || {})
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { alert(data.error || 'That did not work.'); return; }
    apply(data);
    if (action === 'reveal') go(SLIDE.results);
    if (action === 'newround' || action === 'open') go(SLIDE.join);
  }
  $$('[data-act]').forEach(b => b.addEventListener('click', () =>
    act(b.dataset.act, b.dataset.act === 'bots' ? { count: 25 } : null)));

  // ---------------------------------------------------------------- slides
  const slides = $$('.slide');
  const SLIDE = { title: 0, rules: 1, join: 2, results: 3, levelk: 4, nash: 5, theory: 6, again: 7 };
  let cur = Math.min(slides.length - 1, Math.max(0, parseInt(location.hash.slice(1), 10) || 0));

  const dots = $('#dots');
  slides.forEach((s, i) => {
    const b = document.createElement('button');
    b.title = s.dataset.title;
    b.addEventListener('click', () => go(i));
    dots.appendChild(b);
  });

  function go(i) {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, j) => {
      s.classList.toggle('active', j === cur);
      s.classList.toggle('before', j < cur);
    });
    [...dots.children].forEach((d, j) => d.classList.toggle('on', j === cur));
    history.replaceState(null, '', '#' + cur);
    if (cur === SLIDE.nash && nashStep === 0) nashRender();
  }
  $('#prev').onclick = () => go(cur - 1);
  $('#next').onclick = () => go(cur + 1);
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea')) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(cur + 1); }
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(cur - 1); }
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(slides.length - 1);
    else if (document.body.classList.contains('is-teacher')) {
      const map = { o: 'open', c: 'close', r: 'reveal' };
      if (map[e.key.toLowerCase()]) act(map[e.key.toLowerCase()]);
    }
  });
  window.addEventListener('hashchange', () => {
    const i = parseInt(location.hash.slice(1), 10);
    if (Number.isFinite(i) && i !== cur) go(i);
  });
  go(cur);

  // ---------------------------------------------------------------- join slide
  fetch('api/config').then(r => r.json()).then(c => {
    $('#playUrl').textContent = c.playUrl.replace(/^https?:\/\//, '');
  });

  const WAIT_JOKES = [
    'Pro tip: think about what everyone else is thinking. Then about what they think you\'re thinking. Then stop, before it hurts.',
    'No, you can\'t guess 101. We checked. Twice.',
    'This game is a lot like the stock market, except the snacks are better.',
    'Wolverines and Broncos compete on equal terms here. The numbers don\'t know where you went to school.',
    'Picking 100 is legal. It\'s also a public service, since it raises everyone else\'s target.',
    'Your guess is anonymous unless you win. Then it\'s glorious.',
    'Fun fact: the economist John Maynard Keynes invented a version of this game in 1936. He did not have QR codes.'
  ];
  let jokeIdx = 0;
  function nextJoke() {
    const el = $('#waitJoke');
    el.style.opacity = 0;
    setTimeout(() => { el.textContent = WAIT_JOKES[jokeIdx++ % WAIT_JOKES.length]; el.style.opacity = 1; }, 400);
  }
  nextJoke();
  setInterval(nextJoke, 9000);

  // ---------------------------------------------------------------- state
  let last = { count: -1, phase: '', round: 0, revealedKey: '' };

  const PHASE = {
    lobby: { label: 'Lobby', join: 'Scan the code. The game opens in a moment.' },
    open: { label: 'Open', join: 'The game is OPEN. Lock in your guess!' },
    closed: { label: 'Closed', join: 'Pencils down! Guesses are closed.' },
    revealed: { label: 'Revealed', join: 'Results are in. Shall we see who won?' }
  };

  function apply(s) {
    $('#phasePill').className = 'pill ' + s.phase;
    $('#phaseText').textContent = PHASE[s.phase].label;
    $('#countTop').textContent = s.count;
    $('#roundTop').textContent = s.round;
    $('#joinMsg').textContent = PHASE[s.phase].join;

    if (s.count !== last.count) {
      $('#countBig').textContent = s.count;
      const bc = $('.big-count');
      bc.classList.remove('bump'); void bc.offsetWidth; bc.classList.add('bump');
    }

    $('#preMsg').textContent =
      s.phase === 'lobby' ? 'Open the game first. Nobody has guessed yet.' :
      s.phase === 'open' ? `Guesses still coming in… ${s.count} so far.` :
      s.phase === 'closed' ? `${s.count} guesses locked in. Ready when you are.` : '';

    // Button states
    $$('[data-act="open"]').forEach(b => b.disabled = s.phase === 'open' || s.phase === 'revealed');
    $$('[data-act="close"]').forEach(b => b.disabled = s.phase !== 'open');
    $$('[data-act="reveal"]').forEach(b => b.disabled = s.phase === 'revealed' || s.count === 0);
    $$('[data-act="bots"]').forEach(b => b.disabled = s.phase === 'revealed');

    const revealedKey = s.phase === 'revealed' && s.results ? s.round + ':' + s.results.n : '';
    if (revealedKey !== last.revealedKey) {
      if (revealedKey) {
        showResults(s.results);
        if (last.phase && last.phase !== 'revealed') { confetti(); }
      } else {
        hideResults();
      }
    }
    renderHistory(s.history);

    last = { count: s.count, phase: s.phase, round: s.round, revealedKey };
  }

  async function poll() {
    try {
      const r = await fetch('api/state', { cache: 'no-store' });
      if (r.ok) apply(await r.json());
    } catch (e) { /* network blip; try again shortly */ }
    setTimeout(poll, 1000);
  }
  poll();

  // ---------------------------------------------------------------- results
  function hideResults() {
    $('#preReveal').hidden = false;
    $('#postReveal').hidden = true;
    $('#impliedK').textContent = 'Reveal the results to see where this room landed.';
    $('#roomTarget').textContent = '?';
    $('#roomSub').textContent = 'Actual humans';
    renderLadder(null);
  }

  function countUp(el, to, ms = 1200) {
    const t0 = performance.now();
    (function step(t) {
      const p = Math.min(1, (t - t0) / ms);
      el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  function showResults(R) {
    $('#preReveal').hidden = true;
    $('#postReveal').hidden = false;
    $('#sN').textContent = R.n;
    countUp($('#sMean'), R.mean);
    countUp($('#sTarget'), R.target, 1800);
    $('#sWin').textContent = fmt(R.winners[0].guess);

    const w = R.winners;
    $('#winHead').textContent = w.length === 1 ? 'Our winner' : `${w.length}-way tie!`;
    const shown = w.slice(0, 6).map(x => `<li>${esc(x.name)} <span>(${fmt(x.guess)})</span></li>`);
    if (w.length > 6) shown.push(`<li><span>…and ${w.length - 6} more</span></li>`);
    $('#winList').innerHTML = shown.join('');

    const facts = [];
    if (R.zeros) facts.push(`🧊 ${R.zeros} ${R.zeros === 1 ? 'person' : 'people'} picked 0. Nash would be proud. The scoreboard, less so.`);
    if (R.hundreds) facts.push(`💯 ${R.hundreds} picked 100. Thanks for the charitable donation to everyone else's target.`);
    facts.push(`📏 Guesses ranged from ${fmt(R.min)} to ${fmt(R.max)}; the median was ${fmt(R.median)}.`);
    $('#funFacts').innerHTML = facts.join('<br>');

    drawHistogram(R);
    renderLadder(R);

    // Theory vs. room
    $('#roomTarget').textContent = fmt(R.target);
    $('#roomSub').textContent = `Average ${fmt(R.mean)} from ${R.n} actual humans`;

    // Implied depth of reasoning: average = 50 × (2/3)^k
    let msg;
    if (R.mean <= 0) msg = 'Everyone picked 0. Somebody get this room a Nobel Prize.';
    else if (R.mean >= 50) msg = `The average was ${fmt(R.mean)}, which is above what pure randomness gives you. We have chaos agents among us.`;
    else {
      const k = Math.log(R.mean / 50) / Math.log(2 / 3);
      msg = `This room's average of ${fmt(R.mean)} is what you'd get if the typical person thought about <b>${k.toFixed(1)} levels</b> deep. The winning move was to think one step beyond the crowd: ⅔ × ${fmt(R.mean)} = <b>${fmt(R.target)}</b>.`;
    }
    $('#impliedK').innerHTML = msg;
  }

  function drawHistogram(R) {
    const X0 = 60, X1 = 970, Y0 = 380, YT = 120;
    const x = v => X0 + (v / 100) * (X1 - X0);
    const maxC = Math.max(1, ...R.bins);
    const h = c => (c / maxC) * (Y0 - YT);
    const bw = (X1 - X0) / 20;
    const winBin = Math.min(19, Math.floor(R.winners[0].guess / 5));
    let svg = '';

    R.bins.forEach((c, i) => {
      if (!c) return;
      const bx = X0 + i * bw + 3, by = Y0 - h(c);
      svg += `<rect class="bar${i === winBin ? ' win' : ''}" x="${bx}" y="${by}" width="${bw - 6}" height="${h(c)}" rx="4" style="animation-delay:${i * 40}ms"/>`;
      svg += `<text class="barlabel" x="${bx + (bw - 6) / 2}" y="${by - 6}">${c}</text>`;
    });

    svg += `<g class="axis"><line x1="${X0}" x2="${X1}" y1="${Y0}" y2="${Y0}"/>`;
    for (let v = 0; v <= 100; v += 10) {
      svg += `<line x1="${x(v)}" x2="${x(v)}" y1="${Y0}" y2="${Y0 + 8}"/><text x="${x(v)}" y="${Y0 + 30}" text-anchor="middle">${v}</text>`;
    }
    svg += `<text x="${(X0 + X1) / 2}" y="${Y0 + 56}" text-anchor="middle">Guess</text></g>`;

    // Reference lines; labels sit on separate rows so they never collide.
    const line = (v, color, label, row) => {
      const lx = x(v), anchor = lx > 820 ? 'end' : 'start', dx = anchor === 'end' ? -8 : 8;
      return `<line class="vline" x1="${lx}" x2="${lx}" y1="${14 + row * 26}" y2="${Y0}" stroke="${color}"/>` +
        `<text class="vlabel" x="${lx + dx}" y="${32 + row * 26}" fill="${color}" text-anchor="${anchor}">${label}</text>`;
    };
    svg += line(0, '#ffffff', 'Nash: 0', 2);
    svg += line(R.mean, '#F1C500', `Average ${fmt(R.mean)}`, 0);
    svg += line(R.target, '#FFCB05', `⅔ target ${fmt(R.target)}`, 1);

    $('#hist').innerHTML = svg;
  }

  // ---------------------------------------------------------------- level-k ladder
  const RUNGS = [
    { id: 'over', name: 'Above 50', value: null, joke: 'Can never win. Admirably bold.' },
    { id: 'L0', name: 'Level 0', value: 50, joke: 'Picks at random. Hasn\'t taken econ yet.' },
    { id: 'L1', name: 'Level 1', value: 33.3, joke: 'Thinks everyone else is level 0' },
    { id: 'L2', name: 'Level 2', value: 22.2, joke: 'Took Econ 101 in Ann Arbor' },
    { id: 'L3', name: 'Level 3', value: 14.8, joke: 'Took Econ 101 in Kalamazoo 😉' },
    { id: 'L4', name: 'Level 4', value: 9.9, joke: 'Overthinking it' },
    { id: 'L5', name: 'Level 5', value: 6.6, joke: 'Has read Nagel (1995)' },
    { id: 'nash', name: 'Level ∞', value: 0, joke: 'Nash. Lonely at parties.' }
  ];

  function renderLadder(R) {
    $('#ladder').innerHTML = RUNGS.map(r => {
      const width = R && R.n ? (100 * R.levels[r.id]) / Math.max(...Object.values(R.levels)) : 0;
      const c = R ? R.levels[r.id] : null;
      const pct = R && R.n ? Math.round((100 * c) / R.n) : null;
      return `<div class="rung">
        <div class="rung-name">${r.name}<small>${r.value === null ? '50 to 100' : 'guesses ≈ ' + r.value}</small></div>
        <div class="rung-track"><div class="rung-fill" style="width:${width}%"></div><span class="rung-joke">${r.joke}</span></div>
        <div class="rung-count">${R ? c : '–'}<small>${R ? pct + '% of room' : 'players'}</small></div>
      </div>`;
    }).join('');
  }
  renderLadder(null);

  // ---------------------------------------------------------------- Nash stepper
  let nashStep = 0, nashTimer = null;
  const NASH_TEXT = k => {
    if (k === 0) return 'Even if everyone guessed 100, the target would be ⅔ × 100 ≈ 66.7. So any guess above 66.7 can never win. Cross it out.';
    const hi = 100 * Math.pow(2 / 3, k), next = hi * 2 / 3;
    if (hi < 0.05) return 'Keep going and the range collapses to a single point: <b>0</b>. The only guess that survives every round of elimination.';
    return `Step ${k}: nobody sensible guesses above ${fmt(hi)}. But then the target can't exceed ⅔ × ${fmt(hi)} ≈ ${fmt(next)}, so cross out everything above that too.`;
  };
  function nashRender() {
    const hi = 100 * Math.pow(2 / 3, nashStep);
    $('#nashLive').style.width = hi + '%';
    $('#nashDead').style.width = (100 - hi) + '%';
    $('#nashRange').textContent = hi < 0.05 ? 'just 0' : `0 to ${fmt(hi)}`;
    $('#nashExplain').innerHTML = NASH_TEXT(nashStep);
  }
  $('#nashStep').onclick = () => { nashStep = Math.min(nashStep + 1, 30); nashRender(); };
  $('#nashAuto').onclick = () => {
    clearInterval(nashTimer);
    nashTimer = setInterval(() => {
      nashStep++; nashRender();
      if (nashStep >= 30) clearInterval(nashTimer);
    }, 450);
  };
  $('#nashReset').onclick = () => { clearInterval(nashTimer); nashStep = 0; nashRender(); };
  nashRender();

  // ---------------------------------------------------------------- history
  let lastHistory = '';
  function renderHistory(h) {
    const k = JSON.stringify(h);
    if (k === lastHistory) return;
    lastHistory = k;
    $('#historyBody').innerHTML = h.length
      ? h.map(r => `<tr><td>${r.round}</td><td>${r.n}</td><td>${fmt(r.mean)}</td><td>${fmt(r.target)}</td><td>${fmt(r.winning)}</td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">Finished rounds show up here.</td></tr>';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
