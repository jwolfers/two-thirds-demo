// The projector deck. Polls /api/deck once a second and drives the round with the teacher key.
(function () {
  'use strict';
  const { blockM, cwruMark, TEAMS, fmt, depth, esc, confetti } = window.TT;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];

  /* ------------------------------------------------------------ teacher key */
  const params = new URLSearchParams(location.search);
  let key = params.get('key');
  try {
    if (key) localStorage.setItem('tt-key', key);
    else key = localStorage.getItem('tt-key');
  } catch (e) { /* private mode: keep it in memory */ }
  if (params.has('key')) history.replaceState(null, '', location.pathname + location.hash);
  let isTeacher = false;

  async function checkKey() {
    if (!key) return;
    try {
      const r = await fetch('api/admin/check', { method: 'POST', headers: { 'x-teacher-key': key } });
      isTeacher = r.ok;
    } catch (e) { isTeacher = false; }
    document.body.classList.toggle('is-teacher', isTeacher);
    $('#keyBadge').textContent = isTeacher ? 'teacher' : 'view only';
  }

  /* ------------------------------------------------------------------ marks */
  $$('[data-mark]').forEach((el) => {
    const size = Number(el.dataset.size || 120);
    el.innerHTML = el.dataset.mark === 'm' ? blockM(size) : cwruMark(size);
  });

  /* ------------------------------------------------------------ fit stage */
  const stage = $('#stage');
  function fit() {
    const s = Math.min(innerWidth / 1600, innerHeight / 900);
    stage.style.transform = `scale(${s})`;
  }
  addEventListener('resize', fit);
  fit();

  /* --------------------------------------------------------------- slides */
  const slides = $$('.slide');
  const SLIDE = { title: 0, rules: 1, join: 2, results: 3, levelk: 4, nash: 5, why: 6, again: 7, steal: 8 };
  let cur = Math.min(slides.length - 1, Math.max(0, parseInt(location.hash.slice(1), 10) || 0));
  const steps = slides.map(() => 0);

  function go(i, step) {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, j) => s.classList.toggle('active', j === cur));
    if (step != null) steps[cur] = step;
    $('#slideName').textContent = `${cur + 1}. ${slides[cur].dataset.title}`;
    history.replaceState(null, '', '#' + cur);
    renderSlide();
  }
  function maxStep(i) { return Number(slides[i].dataset.steps || 1) - 1; }
  function next() {
    if (steps[cur] < maxStep(cur)) { steps[cur] += 1; renderSlide(); } else if (cur < slides.length - 1) go(cur + 1, 0);
  }
  function prev() {
    if (steps[cur] > 0) { steps[cur] -= 1; renderSlide(); } else if (cur > 0) go(cur - 1, maxStep(cur - 1));
  }

  /* ----------------------------------------------------------------- data */
  let deck = null;
  let lastLocked = -1;
  let lastJoined = -1;

  async function poll() {
    try {
      const r = await fetch('api/deck', { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        const changed = !deck || d.version !== deck.version;
        deck = d;
        if (changed) renderAll();
      }
    } catch (e) { /* the server is waking up; try again */ }
    setTimeout(poll, 1000);
  }

  function renderAll() {
    renderJoin();
    renderSlide();
  }
  function renderSlide() {
    if (!deck) return;
    if (cur === SLIDE.results) renderResults();
    if (cur === SLIDE.levelk) renderLevelK();
    if (cur === SLIDE.nash) renderNash();
    if (cur === SLIDE.why) renderWhy();
    if (cur === SLIDE.again) renderAgain();
  }

  /* ----------------------------------------------------------------- toast */
  let toastT;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), 2400);
  }

  /* --------------------------------------------------------------- actions */
  const ACT_MSG = {
    open: 'Kickoff! Guessing is open.',
    close: 'Whistle blown. Guessing closed.',
    reveal: 'Revealing…',
    newround: 'New round. Fresh legs.',
    bots: '25 robots have entered the stadium.',
    reset: 'Everything reset.',
  };
  async function act(a) {
    if (!isTeacher) { toast('View only: add ?key=… to the address to take control.'); return; }
    if (a === 'reset' && !confirm('Reset every round and every player?')) return;
    try {
      const r = await fetch('api/admin/' + a, {
        method: 'POST',
        headers: { 'x-teacher-key': key, 'content-type': 'application/json' },
        body: JSON.stringify(a === 'bots' ? { count: 25 } : {}),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(j.error || 'That did not work.'); return; }
      toast(ACT_MSG[a] || 'Done.');
      if (a === 'reveal') { revealSig = null; go(SLIDE.results, 0); }
      if (a === 'newround') { revealSig = null; go(SLIDE.join, 0); }
      if (a === 'open' && cur !== SLIDE.join) go(SLIDE.join, 0);
      deck = null; // force a full redraw on the next poll
    } catch (e) { toast('No connection to the server.'); }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) { act(b.dataset.act); return; }
    const n = e.target.closest('[data-nav]');
    if (n) (n.dataset.nav === 'next' ? next : prev)();
  });

  /* -------------------------------------------------------------- the field */
  // A 100-yard field: yard v sits at X(v). The zero end zone is Michigan's, the 100 end zone is Case's.
  const W = 1440;
  const EZ = 74;
  const X = (v) => EZ + (v / 100) * (W - 2 * EZ);

  function fieldSVG(H, opts) {
    const o = opts || {};
    const top = o.top == null ? 46 : o.top;
    const bottom = H - 4;
    let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
    s += `<defs><pattern id="hatch-${o.id}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="rgba(228,87,46,.55)"/><rect width="5" height="14" fill="rgba(0,0,0,.25)"/></pattern></defs>`;
    for (let v = 0; v < 100; v += 10) {
      s += `<rect x="${X(v)}" y="${top}" width="${X(v + 10) - X(v)}" height="${bottom - top}" fill="${(v / 10) % 2 ? 'var(--turf-2)' : 'var(--turf)'}"/>`;
    }
    s += `<g class="ez"><rect x="0" y="${top}" width="${EZ}" height="${bottom - top}" fill="#00274C"/>`;
    s += `<rect x="${W - EZ}" y="${top}" width="${EZ}" height="${bottom - top}" fill="#0A304E"/>`;
    const mid = (top + bottom) / 2;
    s += `<text transform="translate(${EZ / 2 + 11} ${mid}) rotate(-90)" text-anchor="middle" fill="#FFCB05">MICHIGAN</text>`;
    s += `<text transform="translate(${W - EZ / 2 - 11} ${mid}) rotate(90)" text-anchor="middle" fill="#FFFFFF">CWRU</text></g>`;
    s += `<rect class="shade" id="shade-${o.id}" x="${X(100)}" y="${top}" width="0" height="${bottom - top}" fill="url(#hatch-${o.id})"/>`;
    s += '<g class="yard">';
    for (let v = 0; v <= 100; v += 10) {
      s += `<line x1="${X(v)}" x2="${X(v)}" y1="${top}" y2="${bottom}" stroke="rgba(255,255,255,.75)" stroke-width="${v === 50 ? 4 : 2.5}"/>`;
      s += `<text x="${X(v)}" y="${bottom - 12}" text-anchor="middle">${v}</text>`;
    }
    for (let v = 1; v < 100; v += 1) {
      if (v % 10) {
        s += `<line x1="${X(v)}" x2="${X(v)}" y1="${top + 4}" y2="${top + 14}" stroke="rgba(255,255,255,.45)" stroke-width="1.5"/>`;
        s += `<line x1="${X(v)}" x2="${X(v)}" y1="${bottom - 54}" y2="${bottom - 44}" stroke="rgba(255,255,255,.45)" stroke-width="1.5"/>`;
      }
    }
    s += `</g><g class="bars" id="bars-${o.id}"></g><g id="marks-${o.id}"></g></svg>`;
    return s;
  }

  // Stacked columns, one per 2-yard bin, colored by school.
  function barsSVG(H, guesses, opts) {
    const o = opts || {};
    const top = (o.top == null ? 46 : o.top) + (o.headroom || 60);
    const base = H - 50;
    const bins = Array.from({ length: 50 }, () => ({ um: 0, cwru: 0, other: 0, win: false }));
    guesses.forEach((x) => {
      const b = bins[Math.min(49, Math.floor(x.g / 2))];
      b[x.t] = (b[x.t] || 0) + 1;
      if (x.w) b.win = true;
    });
    const maxC = Math.max(1, ...bins.map((b) => b.um + b.cwru + b.other));
    const unit = (base - top) / maxC;
    const bw = X(2) - X(0) - 4;
    let s = '';
    bins.forEach((b, i) => {
      const x = X(i * 2) + 2;
      let y = base;
      const delay = o.animate ? (i * 0.018).toFixed(3) : 0;
      let g = `<g class="bar${b.win ? ' win' : ''}" style="transition-delay:${delay}s">`;
      ['um', 'cwru', 'other'].forEach((t) => {
        if (!b[t]) return;
        const h = b[t] * unit;
        y -= h;
        g += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="2" fill="${o.faint ? 'rgba(255,255,255,.55)' : TEAMS[t].color}" stroke="rgba(0,0,0,.25)" stroke-width="1"/>`;
      });
      g += '</g>';
      if (y < base) s += g;
    });
    return s;
  }

  function vline(v, label, color, opts) {
    const o = opts || {};
    const top = o.top == null ? 46 : o.top;
    const H = o.H;
    const x = X(v);
    const anchor = o.anchor || (v > 85 ? 'end' : v < 12 ? 'start' : 'middle');
    const dx = anchor === 'start' ? 8 : anchor === 'end' ? -8 : 0;
    return `<g class="vline${o.on ? ' on' : ''}" id="${o.id || ''}">
      <line x1="${x}" x2="${x}" y1="${top - 6}" y2="${H - 4}" stroke="${color}" stroke-width="${o.width || 5}" ${o.dash ? 'stroke-dasharray="12 8"' : ''}/>
      <text class="tag" x="${x + dx}" y="${top - 14}" text-anchor="${anchor}" fill="${color}">${label}</text></g>`;
  }

  /* --------------------------------------------------------------- Join */
  const JOIN_JOKES = [
    'Phones out. The one time I will ever ask you to look at your phone in class.',
    'Case Western: Division III football, Division I economics.',
    'Spartans? No, not those Spartans. The ones in Cleveland. The nice ones.',
    'Michigan\'s offense and this game share a goal: get close to zero. Only one is doing it on purpose.',
    'Wi-Fi slow? Like our running game. Give it a second.',
    'Your guess is anonymous. Your nickname is not. Choose wisely.',
    'Pro tip: 100 is never the answer. Neither is punting from midfield, coach.',
  ];
  let jokeI = 0;
  function rotateJoke() {
    $('#joinJoke').textContent = JOIN_JOKES[jokeI % JOIN_JOKES.length];
    jokeI += 1;
  }
  rotateJoke();
  setInterval(rotateJoke, 9000);

  const STATUS_TEXT = { waiting: 'Warming up', open: 'Guessing open', closed: 'Whistle blown', revealed: 'Revealed' };
  const HEADLINE = { waiting: 'Scan to join. Kickoff soon!', open: 'Scan &amp; guess now!', closed: 'Guessing is closed', revealed: 'The results are in' };

  function bumpNum(el, v) {
    if (el.textContent !== String(v)) {
      el.textContent = v;
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  }

  function renderJoin() {
    const d = deck;
    $('#joinUrl').textContent = d.joinUrl.replace(/^https?:\/\//, '');
    const pill = $('#statusPill');
    pill.textContent = STATUS_TEXT[d.status];
    pill.className = 'status-pill ' + d.status;
    $('#roundTag').textContent = 'Round ' + d.round;
    $('#resRound').textContent = 'Round ' + d.round;
    $('#nextRound').textContent = d.round + 1;
    $('#joinHeadline').innerHTML = HEADLINE[d.status];
    if (d.joined !== lastJoined) bumpNum($('#joinedCount'), d.joined);
    if (d.locked !== lastLocked) bumpNum($('#lockedCount'), d.locked);
    lastJoined = d.joined;
    lastLocked = d.locked;

    const tc = d.teamCounts;
    const tot = tc.um + tc.cwru + tc.other;
    $('#teamSplit').innerHTML = tot
      ? ['um', 'cwru', 'other'].filter((t) => tc[t]).map((t) =>
        `<div style="flex-grow:${tc[t]};background:${TEAMS[t].color};color:${TEAMS[t].ink}">${TEAMS[t].label} ${tc[t]}</div>`).join('')
      : '<div style="flex-grow:1;background:rgba(255,255,255,.08);color:rgba(255,255,255,.6)">Michigan · Case Western · everyone else</div>';

    $('#ticker').innerHTML = d.ticker.map((x) => `<span class="${x.team}">🔒 ${esc(x.name)}</span>`).join('');

    $('#btnOpen').disabled = !(d.status === 'waiting' || d.status === 'closed');
    $('#btnClose').disabled = d.status !== 'open';
    $('#btnReveal').disabled = !(d.status === 'open' || d.status === 'closed');
    $('#btnReveal2').disabled = !(d.status === 'open' || d.status === 'closed');
  }

  /* ------------------------------------------------------------ Results */
  let revealSig = null;
  let revealTimers = [];
  const WIN_JOKES = {
    um: ['Finally, a Michigan win this November.', 'Maize and blue, back in the win column. Savor it.'],
    cwru: ['A Spartan victory at the Big House. Somebody tell the athletic department.', 'Case Western wins. The good Spartans.'],
    other: ['A neutral-site victory. Nobody saw it coming.', 'Our visitors, beating both home teams. Very on brand for Michigan this year.'],
    any: [
      'Has now put up more points than Michigan\'s offense in the fourth quarter.',
      'Bragging rights awarded. Non-transferable. Not redeemable for playoff tickets.',
      'Proof that one step ahead of the crowd beats infinitely ahead.',
    ],
  };
  const pick = (a) => a[(Math.random() * a.length) | 0];

  function countUp(el, to, d, ms) {
    const t0 = performance.now();
    const dur = ms || 900;
    function f(t) {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(to * e, d);
      if (p < 1) requestAnimationFrame(f);
      else el.textContent = fmt(to, d);
    }
    requestAnimationFrame(f);
  }

  const RH = 380;
  function renderResults() {
    const r = deck.result;
    const box = $('#resField');
    if (!r) {
      revealSig = null;
      revealTimers.forEach(clearTimeout);
      box.innerHTML = fieldSVG(RH, { id: 'res' });
      ['#sN', '#sAvg', '#sTarget', '#sWin'].forEach((s) => { $(s).textContent = '–'; });
      const wc = $('#winnerCard');
      wc.className = 'winner-card';
      wc.innerHTML = `<div class="wc-wait">${deck.status === 'open' ? `Guessing is open: ${deck.locked} locked in so far…` : deck.status === 'closed' ? 'Whistle blown. Ready when you are: press Reveal.' : 'Waiting for kickoff…'}</div>`;
      $('#teamCard').innerHTML = '<h3>Which school thinks deeper?</h3><p style="margin-top:14px;font-size:20px;opacity:.7">Michigan vs. Case Western vs. everyone else, after the reveal.</p>';
      return;
    }
    const sig = `${r.round}:${r.n}:${r.avg}`;
    if (sig === revealSig) return; // already shown; leave the animation alone
    revealSig = sig;
    revealTimers.forEach(clearTimeout);
    revealTimers = [];
    const later = (ms, f) => revealTimers.push(setTimeout(f, ms));

    if (!r.n) {
      box.innerHTML = fieldSVG(RH, { id: 'res' });
      $('#winnerCard').innerHTML = '<div class="wc-wait">Nobody guessed. A shutout. We know how that feels.</div>';
      return;
    }
    box.innerHTML = fieldSVG(RH, { id: 'res' });
    $('#bars-res').innerHTML = barsSVG(RH, r.guesses, { animate: true, headroom: 70 });
    const lineOpts = { H: RH };
    $('#marks-res').innerHTML =
      vline(r.avg, `Average ${fmt(r.avg, 1)}`, '#FFFFFF', { ...lineOpts, id: 'lAvg', dash: true, width: 4, anchor: 'start' }) +
      vline(r.target, `🎯 Target ${fmt(r.target, 1)}`, '#FFCB05', { ...lineOpts, id: 'lTarget', width: 6, anchor: 'end' });
    ['#sN', '#sAvg', '#sTarget', '#sWin'].forEach((s) => { $(s).textContent = '–'; });
    const wc = $('#winnerCard');
    wc.className = 'winner-card';
    wc.innerHTML = '<div class="wc-wait">And the winner is…</div>';
    $('#teamCard').innerHTML = '<h3>Which school thinks deeper?</h3>';

    later(250, () => { box.classList.add('show-bars'); box.querySelector('svg').classList.add('show-bars'); countUp($('#sN'), r.n, 0); });
    later(1900, () => { $('#lAvg').classList.add('on'); countUp($('#sAvg'), r.avg, 1); });
    later(3400, () => { $('#lTarget').classList.add('on'); countUp($('#sTarget'), r.target, 1); renderTeams(r); });
    later(5000, () => {
      $('#sWin').textContent = fmt(r.winners[0].guess, 2);
      const names = r.winners.slice(0, 6).map((w) => `${w.team === 'um' ? '〽️' : w.team === 'cwru' ? '🛡️' : '🌎'} ${esc(w.name)}${w.bot ? ' 🤖' : ''}`);
      const more = r.winnerCount > 6 ? ` +${r.winnerCount - 6} more` : '';
      const team = r.winners[0].team;
      const joke = pick(Math.random() < 0.55 ? WIN_JOKES[team] : WIN_JOKES.any);
      wc.className = 'winner-card on';
      wc.innerHTML = `<div class="wc-title">🏆 ${r.winnerCount > 1 ? `${r.winnerCount}-way tie for the win` : 'Winner'} · guessed ${fmt(r.winners[0].guess, 2)}, ${fmt(r.winDist, 2)} from the target</div>
        <div class="wc-names">${names.join(', ')}${more}</div><div class="wc-joke">${joke}</div>`;
      confetti(180);
    });
  }

  function renderTeams(r) {
    const rows = ['um', 'cwru', 'other'].filter((t) => r.teams[t].n);
    let html = '<h3>Which school thinks deeper?</h3>';
    rows.forEach((t) => {
      const a = r.teams[t].avg;
      const k = depth(a);
      html += `<div class="trow"><span>${TEAMS[t].label} <small style="opacity:.6">(${r.teams[t].n})</small></span>
        <div class="tbar" style="width:${Math.max(2, a)}%;background:${TEAMS[t].color}"></div>
        <span class="tval">${fmt(a, 1)} <small>≈ level ${k == null ? '∞' : fmt(Math.max(0, k), 1)}</small></span></div>`;
    });
    $('#teamCard').innerHTML = html;
  }

  /* ------------------------------------------------------------ Level-k */
  const LK = [
    { k: 'Level 0', v: 50, key: 'L0', why: 'Doesn\'t model anyone. Picks at random, or "the middle." Average: 50.' },
    { k: 'Level 1', v: 100 / 3, key: 'L1', why: 'Thinks everyone else is Level 0. Best response: ⅔ × 50.' },
    { k: 'Level 2', v: 200 / 9, key: 'L2', why: 'Thinks everyone else is Level 1: ⅔ × 33.3.' },
    { k: 'Level 3', v: 400 / 27, key: 'L3', why: 'Thinks everyone else is Level 2: ⅔ × 22.2.' },
    { k: 'Level 4+', v: 800 / 81, key: 'L4', why: '⅔ × ⅔ × ⅔ × ⅔ × 50, and onward.' },
    { k: 'Level ∞', v: 0, key: 'nash', why: 'Infinite steps: common knowledge of rationality. Nash.' },
  ];
  const LK_NOTE = [
    'Level 0 is the anchor: someone who doesn\'t think about the other players at all. <span class="joke">See also: Michigan\'s play-calling.</span>',
    'Level 1 best-responds to a room full of Level 0s: two-thirds of 50 is 33.3.',
    'Level 2 thinks the room is Level 1 and shades down to 22.2. Each step adds one more "I think that you think…"',
    'Level 3 lands at 14.8. <span class="joke">We are now in faculty-meeting territory.</span>',
    'Level 4 and beyond: 9.9, 6.6, 4.4… each layer shrinks the guess by a third.',
    '',
  ];
  const LH = 360;
  const resSig = () => (deck && deck.result ? `${deck.result.round}:${deck.result.n}:${deck.result.avg}` : 'none');
  function renderLevelK() {
    const r = deck.result;
    const s = steps[SLIDE.levelk];
    const box = $('#lkField');
    if (!box.dataset.built || box.dataset.built !== resSig()) {
      box.innerHTML = fieldSVG(LH, { id: 'lk' });
      box.dataset.built = resSig();
      if (r && r.n) {
        $('#bars-lk').innerHTML = barsSVG(LH, r.guesses, { faint: true, headroom: 90 });
        box.querySelector('svg').classList.add('show-bars');
      }
    }
    $('#marks-lk').innerHTML = LK.map((l, i) => vline(l.v, i === s ? `${l.k} · ${fmt(l.v, 1)}` : '', i === s ? '#FFCB05' : '#7FB3E3', { H: LH, on: i <= s, width: i === s ? 6 : 3, anchor: i === s && l.v < 12 ? 'start' : undefined })).join('');
    const share = (key) => (r && r.n ? Math.round((100 * r.levels[key]) / r.n) + '%' : '–');
    $('#ladder').innerHTML = LK.map((l, i) => `<div class="rung${i <= s ? ' on' : ''}${i === s ? ' now' : ''}">
      <div class="rk">${l.k}</div><div class="rv">${fmt(l.v, 1)}</div><div class="rwhy">${l.why}</div>
      <div class="rshare">This room: <b>${share(l.key)}</b></div></div>`).join('');
    let note = LK_NOTE[s];
    if (s === LK.length - 1) {
      if (r && r.n) {
        const k = depth(r.avg);
        note = `This room averaged <b class="maize">${fmt(r.avg, 1)}</b>, as if the typical person thought <b class="maize">${k == null ? '∞' : fmt(Math.max(0, k), 1)} levels</b> deep. ${r.levels.dom ? `And ${Math.round((100 * r.levels.dom) / r.n)}% picked above 66.7, which is never smart. More on that next.` : 'Nobody picked above 66.7. Well coached.'}`;
      } else {
        note = 'Play a round and the room\'s own guesses show up behind the ladder.';
      }
    }
    $('#lkNote').innerHTML = note;
  }

  /* --------------------------------------------------------------- Nash */
  const BOUNDS = [100, 200 / 3, 400 / 9, 800 / 27, 1600 / 81, 3200 / 243, 6400 / 729, 0];
  const NASH_TEXT = [
    ['Start: anything goes', 'Every number from 0 to 100 is on the table. Let\'s see which ones a rational player would ever pick.'],
    ['Round 1 of reasoning', 'Even if everyone else picked 100, the target would be ⅔ × 100 = 66.7. So any guess above 66.7 is <b>strictly dominated</b>: never pick it.'],
    ['Round 2', 'If everyone knows nobody picks above 66.7, the target can\'t exceed ⅔ × 66.7 = 44.4. Eliminate everything above it.'],
    ['Round 3', '…and if everyone knows that everyone knows that: 29.6.'],
    ['Round 4', 'Another layer of "I know that you know that I know": 19.8.'],
    ['Round 5', '13.2. The defense keeps pushing.'],
    ['Round 6', '8.8, and so on, shrinking by a third each time…'],
    ['The only survivor: 0', 'If everyone picks 0, the target is 0 and nobody gains by switching. That\'s the (unique) <b>Nash equilibrium</b>. <span class="joke">Rational play gets pushed all the way back to Michigan\'s own goal line. Familiar feeling.</span>'],
  ];
  function renderNash() {
    const r = deck.result;
    const s = steps[SLIDE.nash];
    const box = $('#nashField');
    if (!box.dataset.built || box.dataset.built !== resSig()) {
      box.innerHTML = fieldSVG(LH, { id: 'nash' });
      box.dataset.built = resSig();
      if (r && r.n) {
        $('#bars-nash').innerHTML = barsSVG(LH, r.guesses, { faint: true, headroom: 90 });
        box.querySelector('svg').classList.add('show-bars');
      }
    }
    const b = BOUNDS[s];
    const shade = $('#shade-nash');
    shade.setAttribute('x', X(b));
    shade.setAttribute('width', X(100) - X(b));
    const elim = r && r.n ? r.guesses.filter((x) => x.g > b + 1e-9).length : null;
    $('#marks-nash').innerHTML = s ? vline(b, s === BOUNDS.length - 1 ? 'Nash = 0' : `≤ ${fmt(b, 1)}`, '#FFCB05', { H: LH, on: true, width: 6 }) +
      (s > 0 && s < BOUNDS.length - 1 ? `<text x="${(X(b) + X(100)) / 2}" y="${LH / 2}" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="${Math.max(18, Math.min(40, (X(100) - X(b)) / 9))}" fill="#fff" opacity=".9" letter-spacing="4">ELIMINATED${elim != null ? ` · ${elim} of you` : ''}</text>` : '') : '';
    $('#chain').innerHTML = BOUNDS.map((v, i) => `<span class="${i <= s ? 'on' : ''}${i === s ? ' now' : ''}${i === BOUNDS.length - 1 && i <= s ? ' zero' : ''}">${i === BOUNDS.length - 1 ? '… 0' : fmt(v, 1)}</span>`).join('<span class="on" style="background:none;padding:8px 0">→</span>');
    $('#nashText').innerHTML = `<h3>${NASH_TEXT[s][0]}</h3><p>${NASH_TEXT[s][1]}</p>`;
  }

  /* ---------------------------------------------------- Theory vs. room */
  function renderWhy() {
    const r = deck.result;
    const rows = [];
    if (r && r.n) {
      rows.push({ cls: 'room', label: 'This room', sub: `${r.n} guesses`, v: r.avg });
      if (r.teams.um.n) rows.push({ cls: 'um', label: 'Michigan', sub: `${r.teams.um.n} guesses`, v: r.teams.um.avg });
      if (r.teams.cwru.n) rows.push({ cls: 'cwru', label: 'Case Western', sub: `${r.teams.cwru.n} guesses`, v: r.teams.cwru.avg });
    } else {
      rows.push({ cls: 'room', label: 'This room', sub: 'play a round first', v: null });
    }
    rows.push(
      { cls: '', label: 'Expansión', sub: 'Spanish newspaper contest', v: 25.47 },
      { cls: '', label: 'Spektrum', sub: 'German science magazine', v: 22.08 },
      { cls: '', label: 'Financial Times', sub: 'UK newspaper contest', v: 18.91 },
      { cls: 'nash', label: 'Nash equilibrium', sub: 'perfect, common rationality', v: 0 },
    );
    const max = Math.max(50, ...rows.map((x) => x.v || 0));
    $('#compare').innerHTML = '<h3 style="margin-bottom:20px;color:var(--cwru-sky);font-size:22px;letter-spacing:2px;text-transform:uppercase">Average guess</h3>' +
      rows.map((x) => `<div class="cmp-row ${x.cls}"><span>${x.label}<small>${x.sub}</small></span>
        <div class="cbar" style="width:${x.v == null ? 0 : Math.max(x.v ? 1 : 0, (100 * x.v) / max)}%"></div>
        <span class="cval">${x.v == null ? '–' : fmt(x.v, 1)}</span></div>`).join('');
  }

  /* --------------------------------------------------------- Play again */
  function renderAgain() {
    const h = deck.history;
    const box = $('#history');
    if (!h.length) {
      box.innerHTML = '<p style="font-size:28px;opacity:.7;margin-top:120px;text-align:center">Play a round and its average shows up here.</p>';
      return;
    }
    const Wd = 860;
    const Hd = 600;
    const pad = 60;
    const bw = Math.min(150, (Wd - 2 * pad) / h.length - 30);
    const y = (v) => Hd - pad - (v / 60) * (Hd - 2 * pad);
    let s = `<svg viewBox="0 0 ${Wd} ${Hd}">`;
    [0, 10, 20, 30, 40, 50, 60].forEach((v) => {
      s += `<line x1="${pad}" x2="${Wd - 10}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.12)"/><text x="${pad - 12}" y="${y(v) + 7}" text-anchor="end" font-size="20" opacity=".6">${v}</text>`;
    });
    h.forEach((r, i) => {
      const cx = pad + 30 + i * ((Wd - pad - 40) / h.length) + bw / 2;
      const avg = Math.min(60, r.avg || 0);
      const tgt = Math.min(60, r.target || 0);
      s += `<rect x="${cx - bw / 2}" y="${y(avg)}" width="${bw / 2 - 4}" height="${y(0) - y(avg)}" rx="6" fill="#FFFFFF" opacity=".85"/>`;
      s += `<rect x="${cx + 4}" y="${y(tgt)}" width="${bw / 2 - 4}" height="${y(0) - y(tgt)}" rx="6" fill="#FFCB05"/>`;
      s += `<text x="${cx - bw / 4 - 2}" y="${y(avg) - 12}" text-anchor="middle" font-size="26">${fmt(r.avg, 1)}</text>`;
      s += `<text x="${cx + bw / 4 + 2}" y="${y(tgt) - 12}" text-anchor="middle" font-size="26" fill="#FFCB05">${fmt(r.target, 1)}</text>`;
      s += `<text x="${cx}" y="${Hd - pad + 34}" text-anchor="middle" font-size="24">Round ${r.round} · ${r.n}</text>`;
    });
    s += `<text x="${Wd - 10}" y="30" text-anchor="end" font-size="22"><tspan fill="#fff">■ average</tspan>  <tspan fill="#FFCB05">■ ⅔ target</tspan></text></svg>`;
    box.innerHTML = s;
  }

  /* --------------------------------------------------------- keyboard */
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter') { e.preventDefault(); next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); prev(); }
    else if (k === 'o' || k === 'O') act('open');
    else if (k === 'c' || k === 'C') act('close');
    else if (k === 'r' || k === 'R') {
      if (cur === SLIDE.results && deck && deck.status === 'revealed') { revealSig = null; renderResults(); } else act('reveal');
    }
    else if (k === 'n' || k === 'N') act('newround');
    else if (k === 'b' || k === 'B') act('bots');
    else if (k === 'f' || k === 'F') toggleFs();
    else if (/^[1-9]$/.test(k)) go(Number(k) - 1, 0);
  });
  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  $('#fsBtn').addEventListener('click', toggleFs);

  let dockT;
  document.addEventListener('mousemove', () => {
    document.body.classList.add('show-dock');
    clearTimeout(dockT);
    dockT = setTimeout(() => document.body.classList.remove('show-dock'), 2600);
  });

  /* -------------------------------------------------------------- start */
  go(cur, 0);
  checkKey();
  poll();
})();
