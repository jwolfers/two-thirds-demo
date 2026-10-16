// Teacher deck: slides, live counter, reveal, and the economics walkthrough.
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const NS = 'http://www.w3.org/2000/svg';
const fmt = x => (Math.round(x * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- stage scaling
const stage = $('#stage');
function fit() {
  const s = Math.min(innerWidth / 1600, innerHeight / 900);
  stage.style.transform = `translate(-50%, -50%) scale(${s})`;
}
addEventListener('resize', fit);
fit();

// ---------------------------------------------------------------- teacher key
let key = new URLSearchParams(location.search).get('key') || localStorage.getItem('tt-key') || '';
if (new URLSearchParams(location.search).has('key')) history.replaceState(null, '', location.pathname + location.hash);
let isTeacher = false;

async function api(path, body) {
  const opts = { headers: { 'x-teacher-key': key, 'Content-Type': 'application/json' } };
  if (body !== undefined) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}

async function unlock(k) {
  key = k;
  try {
    await api('/api/teacher/check');
    isTeacher = true;
    localStorage.setItem('tt-key', key);
  } catch { isTeacher = false; }
  document.body.classList.toggle('is-teacher', isTeacher);
  return isTeacher;
}

// ---------------------------------------------------------------- slides
const slides = $$('.slide');
let cur = 0;
const dots = $('#dots');
slides.forEach((s, i) => {
  const d = document.createElement('button');
  d.className = 'dot'; d.title = s.dataset.name;
  d.onclick = () => go(i);
  dots.appendChild(d);
});
const onEnter = {};

function go(i) {
  cur = Math.max(0, Math.min(slides.length - 1, i));
  stage.scrollTop = stage.scrollLeft = 0;
  slides.forEach((s, j) => s.classList.toggle('active', j === cur));
  $$('.dot').forEach((d, j) => d.classList.toggle('on', j === cur));
  history.replaceState(null, '', '#' + cur);
  const name = slides[cur].dataset.name;
  if (onEnter[name]) onEnter[name]();
}

addEventListener('hashchange', () => go(parseInt(location.hash.slice(1), 10) || 0));

addEventListener('keydown', e => {
  if (e.target.isContentEditable || e.target.tagName === 'INPUT') return;
  if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(cur + 1); }
  if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(cur - 1); }
  if (e.key === 'f' || e.key === 'F') {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  }
});

// ---------------------------------------------------------------- live state polling
let live = { phase: 'waiting', count: 0, round: 1 };
let results = null;

async function poll() {
  try {
    const s = await fetch('/api/state').then(r => r.json());
    const grew = s.count !== live.count;
    live = s;
    renderLive(grew);
  } catch { /* server asleep or restarting; try again shortly */ }
  setTimeout(poll, 1500);
}

const PHASE_LABEL = { waiting: 'Not open yet', open: 'Open', closed: 'Closed', revealed: 'Revealed' };

function renderLive(grew) {
  const c = $('#count');
  c.textContent = live.count.toLocaleString();
  if (grew) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
  $('#dockCount').textContent = live.count;
  for (const el of [$('#phasePill'), $('#dockPhase')]) {
    el.textContent = PHASE_LABEL[live.phase];
    el.classList.toggle('open', live.phase === 'open');
  }
  $('#joinToggle').textContent = live.phase === 'open' ? 'Close the game' : (live.phase === 'waiting' ? 'Open the game' : 'Reopen the game');
  $$('.dock-buttons [data-phase]').forEach(b => b.classList.toggle('current', b.dataset.phase === live.phase));
  $('#quip').textContent = quip();
  if (slides[cur].dataset.name === 'Results') syncCover();
}

function quip() {
  const n = live.count;
  if (live.phase === 'waiting') return 'The game opens when the professor says so. Stretch your neurons.';
  if (live.phase !== 'open') return 'Pencils down. Phones down. Eyes up here.';
  if (n === 0) return 'Phones out. This is the one class where that’s encouraged.';
  if (n < 50) return 'The early birds: thinking fast, or thinking slow?';
  if (n < 150) return `${n} Broncos have entered. One Wolverine is getting nervous.`;
  if (n < 300) return 'That’s more people than came to my office hours all of last year.';
  if (n < 450) return 'Somewhere in this room, a level-3 thinker is overthinking it.';
  return 'Nearly everyone’s in. Last call for deep thoughts!';
}

async function setPhase(phase) {
  if (!isTeacher) return;
  await api('/api/teacher/phase', { phase });
  live.phase = phase;
  renderLive(false);
}

async function loadResults() {
  if (!isTeacher) return null;
  results = await api('/api/teacher/results');
  return results;
}

// ---------------------------------------------------------------- join slide
fetch('/api/info').then(r => r.json()).then(d => { $('#playUrl').textContent = d.playUrl.replace(/^https?:\/\//, ''); });
$('#joinToggle').onclick = () => setPhase(live.phase === 'open' ? 'closed' : 'open');
onEnter['Play'] = () => { $('#qr').src = '/qr.svg?' + Date.now(); };

// ---------------------------------------------------------------- distribution slide
let shownRound = null;

function syncCover() {
  const revealed = live.phase === 'revealed' && results && results.count && shownRound === live.round;
  $('#revealCover').classList.toggle('gone', !!revealed);
  $('#revealMsg').textContent = !isTeacher ? 'Teacher controls are locked.'
    : live.phase === 'open' ? `Submissions are still open · ${live.count} in.`
    : live.count ? `${live.count} guesses are in. Ready?` : 'No guesses yet. Open the game first!';
  $('#revealBtn').textContent = live.phase === 'open' ? 'Close the game & reveal' : 'Reveal the results';
  $('#revealBtn').disabled = !live.count;
}

onEnter['Results'] = async () => {
  if (live.phase === 'revealed' && isTeacher) {
    await loadResults();
    if (shownRound !== live.round) { shownRound = live.round; drawHist(true); } else drawHist(false);
  }
  syncCover();
};

$('#revealBtn').onclick = async () => {
  await setPhase('revealed');
  await loadResults();
  shownRound = live.round;
  drawHist(true);
  syncCover();
};

function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

const LEVELS = [50, 100 / 3, 200 / 9, 400 / 27, 800 / 81];

function drawHist(animate) {
  const r = results;
  const svg = $('#hist');
  svg.innerHTML = '';
  svg.classList.remove('go', 'lines');
  if (!r || !r.count) return;

  const W = 1500, H = 540, L = 40, R = 20, T = 70, B = 84;
  const pw = W - L - R, ph = H - T - B;
  const bw = pw / 101;
  const xOf = v => L + (v + 0.5) * bw;
  const max = Math.max(...r.bins, 1);
  const winBins = new Set(r.winners.map(w => Math.round(w.guess)));

  r.bins.forEach((c, i) => {
    if (!c) return;
    const h = Math.max(3, (c / max) * ph);
    const b = el('rect', { x: L + i * bw + 1, y: T + ph - h, width: bw - 2, height: h, rx: 2,
      class: 'bar' + (winBins.has(i) ? ' win' : '') }, svg);
    b.style.transitionDelay = (animate ? i * 9 : 0) + 'ms';
    el('title', {}, b).textContent = `${i}: ${c} guess${c > 1 ? 'es' : ''}`;
  });

  el('line', { x1: L, x2: W - R, y1: T + ph, y2: T + ph, class: 'axis' }, svg);
  for (let v = 0; v <= 100; v += 10) {
    el('text', { x: xOf(v), y: T + ph + 30, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = v;
  }
  ['L0', 'L1', 'L2', 'L3', 'L4'].forEach((lab, i) => {
    const x = xOf(LEVELS[i]);
    el('path', { d: `M${x} ${T + ph + 44} l-7 12 h14 z`, fill: 'rgba(241,197,0,0.7)' }, svg);
    el('text', { x, y: T + ph + 76, 'text-anchor': 'middle', class: 'lvl' }, svg).textContent = lab;
  });
  el('text', { x: xOf(0), y: T + ph + 76, 'text-anchor': 'middle', class: 'lvl' }, svg).textContent = 'Nash';

  // Reference lines: average and the two-thirds target.
  const ref = (v, color, label, anchor, dash, y) => {
    const g = el('g', { class: 'ref' }, svg);
    const x = xOf(v);
    el('line', { x1: x, x2: x, y1: y + 10, y2: T + ph, stroke: color, 'stroke-width': 4, 'stroke-dasharray': dash || '' }, g);
    el('text', { x: x + (anchor === 'start' ? 10 : -10), y, 'text-anchor': anchor, fill: color, class: 'ref-label' }, g).textContent = label;
  };
  ref(r.mean, '#F6F1E4', `Average ${fmt(r.mean)}`, 'start', '10 8', 30);
  ref(r.target, '#FFCB05', `⅔ × average = ${fmt(r.target)}`, 'end', '', 30);

  renderStats(r);
  renderCallouts(r, animate);

  const show = () => { svg.classList.add('go'); setTimeout(() => svg.classList.add('lines'), animate ? 1500 : 0); };
  animate ? requestAnimationFrame(() => requestAnimationFrame(show)) : show();
}

function renderStats(r) {
  $('#stats').innerHTML = [
    ['Guesses', r.count.toLocaleString()],
    ['Average', fmt(r.mean)],
    ['Median', fmt(r.median)],
    ['⅔ × average', fmt(r.target), 'stat-hot']
  ].map(([l, v, c]) => `<div class="stat ${c || ''}"><div class="stat-label">${l}</div><div class="stat-val">${v}</div></div>`).join('');
}

function renderCallouts(r, animate) {
  const pct = n => Math.round((100 * n) / r.count);
  const items = [];
  items.push(r.dominated
    ? `<b>${r.dominated} of you (${pct(r.dominated)}%)</b> guessed above 66.7. That can never win. We need to talk.`
    : `<b>Nobody</b> guessed above 66.7. Impressive. That number can never win.`);
  if (r.hundreds) items.push(`<b>${r.hundreds}</b> brave soul${r.hundreds > 1 ? 's' : ''} guessed 100. Chaos agent${r.hundreds > 1 ? 's' : ''}. We see you.`);
  items.push(r.zeros
    ? `<b>${r.zeros} of you (${pct(r.zeros)}%)</b> guessed 0 or 1. Very Nash. Hold that thought.`
    : `<b>Nobody</b> guessed 0. Remember that, it'll matter in ten minutes.`);
  $('#callouts').innerHTML = items.map(t => `<div class="callout">${t}</div>`).join('');
  $$('.callout').forEach((c, i) => setTimeout(() => c.classList.add('show'), (animate ? 2200 : 0) + i * 350));
}

// ---------------------------------------------------------------- winner slide
let winnerShownRound = null;

onEnter['Winner'] = async () => {
  if (winnerShownRound === live.round && results) return;
  $('#winnerInner').innerHTML = `<div class="kicker">And the winner is…</div>
    <div class="trophy">🏆</div>
    <button class="btn btn-maize btn-xl teacher-only" id="winnerBtn">Open the envelope</button>`;
  $('#winnerBtn').onclick = showWinner;
};

async function showWinner() {
  if (live.phase !== 'revealed') await setPhase('revealed');
  const r = await loadResults();
  if (!r || !r.count) {
    $('#winnerInner').innerHTML = `<div class="kicker">Hmm.</div><div class="winner-meta">No guesses yet. It's hard to win a game nobody played.</div>`;
    return;
  }
  winnerShownRound = live.round;
  const w = r.winners;
  const meta = g => `Guessed <b>${fmt(g)}</b> · target <b>${fmt(r.target)}</b> · off by <b>${fmt(Math.abs(g - r.target))}</b>`;
  if (w.length === 1 || r.pick) {
    const one = r.pick || w[0];
    $('#winnerInner').innerHTML = `<div class="kicker">${w.length > 1 ? 'The coin has spoken' : 'And the winner is…'}</div>
      <div class="winner-name">${esc(one.name)}</div>
      <div class="winner-meta">${meta(one.guess)}</div>
      <div class="winner-meta dim">Out-thought ${(r.count - 1).toLocaleString()} classmates. Please collect your glory.</div>`;
    confetti();
    return;
  }
  const shown = w.slice(0, 24);
  $('#winnerInner').innerHTML = `<div class="kicker">We have a ${w.length}-way tie!</div>
    <div class="winner-meta">${w.length} of you guessed <b>${fmt(w[0].guess)}</b> · target <b>${fmt(r.target)}</b></div>
    <div class="tie-list">${shown.map(x => `<div class="tie-chip">${esc(x.name)}</div>`).join('')}
      ${w.length > shown.length ? `<div class="tie-chip">+${w.length - shown.length} more</div>` : ''}</div>
    <button class="btn btn-maize btn-xl teacher-only" id="flipBtn">Flip the coin 🪙</button>`;
  confetti(80);
  $('#flipBtn').onclick = flipCoin;
}

async function flipCoin() {
  $('#flipBtn').disabled = true;
  const { pick } = await api('/api/teacher/pick', {});
  const chips = $$('.tie-chip').filter(c => !c.textContent.startsWith('+'));
  let idx = chips.findIndex(c => c.textContent === pick.name);
  if (idx < 0) idx = chips.length - 1; // winner beyond the visible list: land on the last chip, then reveal
  const total = chips.length * 3 + idx;
  let i = 0;
  const tick = () => {
    chips.forEach(c => c.classList.remove('lit'));
    chips[i % chips.length].classList.add('lit');
    if (i++ < total) setTimeout(tick, 60 + Math.pow(i / total, 3) * 380);
    else setTimeout(() => { results.pick = pick; winnerShownRound = null; showWinner(); }, 900);
  };
  tick();
}

function confetti(n = 260) {
  const cv = $('#confetti');
  const ctx = cv.getContext('2d');
  cv.width = cv.clientWidth; cv.height = cv.clientHeight;
  const colors = ['#FFCB05', '#00274C', '#F6F1E4', '#6A3E26', '#F1C500', '#0B3A66'];
  const ps = Array.from({ length: n }, () => ({
    x: cv.width / 2 + (Math.random() - 0.5) * 300, y: cv.height * 0.45,
    vx: (Math.random() - 0.5) * 26, vy: -Math.random() * 26 - 8,
    w: 8 + Math.random() * 10, h: 10 + Math.random() * 14,
    r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    c: colors[Math.floor(Math.random() * colors.length)]
  }));
  let t = 0;
  (function frame() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of ps) {
      p.vy += 0.6; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      ctx.restore();
    }
    if (t++ < 220) requestAnimationFrame(frame); else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}

// ---------------------------------------------------------------- how-it-works slide
const avgIn = $('#avgIn');
avgIn.oninput = () => {
  $('#avgOut').textContent = avgIn.value;
  $('#bestOut').textContent = fmt((2 / 3) * avgIn.value);
};
onEnter['The logic'] = async () => {
  const r = results || await loadResults().catch(() => null);
  const base = 'Economists call a choice <em>dominated</em> when another choice is always at least as good. Picking one is like ordering the gas-station sushi.';
  $('#dominatedNote').innerHTML = r && r.count && r.dominated
    ? `${base}<br><br><b>${r.dominated}</b> of you ordered the sushi today.`
    : base;
};

// ---------------------------------------------------------------- level-k slide
const STEPS = [
  { lvl: 'Level 0', v: 50, who: 'Picks at random, or just likes the number 50.' },
  { lvl: 'Level 1', v: 100 / 3, who: 'Assumes everyone else is Level 0. "I’m smarter than average!"' },
  { lvl: 'Level 2', v: 200 / 9, who: 'Assumes everyone else is Level 1. Smarter than the people who think they’re smart.' },
  { lvl: 'Level 3', v: 400 / 27, who: 'Has started drawing diagrams. Possibly on a napkin.' },
  { lvl: 'Level 4', v: 800 / 81, who: 'Questioning reality. Probably a philosophy double major.' },
  { lvl: 'Level ∞', v: 0, who: 'The perfectly rational economist. Picks 0. Rarely invited to parties.' }
];
const HEIGHTS = [100, 90, 80, 70, 61, 53];

onEnter['Level-k thinking'] = async () => {
  const r = results && results.count ? results : await loadResults().catch(() => null);
  const has = r && r.count;
  const counts = has ? [...r.levels.map(l => l.count), r.zeros] : [];
  const maxShare = has ? Math.max(...counts, 1) : 1;

  // Depth of thinking implied by the room: mean ≈ 50·(⅔)^k.
  let hereIdx = -1;
  if (has) {
    const kMean = Math.log(Math.max(r.mean, 0.01) / 50) / Math.log(2 / 3);
    const kWin = kMean + 1;
    hereIdx = Math.max(0, Math.min(5, Math.round(kWin)));
    $('#levelVerdict').innerHTML = r.mean >= 50
      ? `The average guess was <b>${fmt(r.mean)}</b>. That's… below Level 0. This room is optimistic.`
      : `The average guess (<b>${fmt(r.mean)}</b>) is what a <b>Level ${fmt(kMean)}</b> thinker would pick. To win, you needed one more step: <b>Level ${fmt(kWin)}</b>.`;
  } else {
    $('#levelVerdict').textContent = 'Play the game to see where this room lands.';
  }

  $('#stairs').innerHTML = STEPS.map((s, i) => {
    const c = counts[i] || 0;
    return `<div class="step ${i === 5 ? 'inf' : ''} ${i === hereIdx ? 'here' : ''}" style="height:${HEIGHTS[i]}%">
      ${i === hereIdx ? '<div class="here-tag">Winning depth</div>' : ''}
      <div class="step-lvl">${s.lvl}</div>
      <div class="step-val">${fmt(s.v)}</div>
      <div class="step-who">${s.who}</div>
      ${has ? `<div class="step-share"><div class="share-bar"><i data-w="${(100 * c) / maxShare}"></i></div>
        <div class="share-txt"><b>${Math.round((100 * c) / r.count)}%</b> of you</div></div>` : ''}
    </div>`;
  }).join('');
  $$('.step').forEach((s, i) => setTimeout(() => {
    s.classList.add('show');
    const bar = s.querySelector('.share-bar i');
    if (bar) bar.style.width = bar.dataset.w + '%';
  }, 150 + i * 220));
};

// ---------------------------------------------------------------- Nash slide
const NASH_TEXT = [
  'If everyone is rational, what’s the highest number anyone should ever pick?',
  'Round 1: the target can never exceed ⅔ × 100 = <b>66.7</b>. Anything higher is dominated. Cross it off.',
  'Round 2: if nobody picks above 66.7, the target can’t exceed ⅔ × 66.7 = <b>44.4</b>. Cross that off too.',
  'Round 3: so nobody rational goes above <b>29.6</b>…',
  'Round 4: …<b>19.8</b>. Round 5: <b>13.2</b>. You can see where this is going.',
  'The only number that survives every round is <b>0</b>. If everyone picks 0, the target is 0, and nobody gains by switching. <b>That’s the Nash equilibrium.</b>'
];
const NASH_K = [0, 1, 2, 3, 5, 30];
let nashStep = 0;

function drawNash() {
  const svg = $('#nashLine');
  const L = 40, W = 1320, y = 60, h = 70;
  const k = NASH_K[nashStep];
  const top = 100 * Math.pow(2 / 3, k);
  svg.innerHTML = '';
  el('rect', { x: L, y, width: W, height: h, rx: 12, class: 'dead' }, svg);
  const live = el('rect', { x: L, y, width: W, height: h, rx: 12, class: 'live' }, svg);
  for (let v = 0; v <= 100; v += 10) {
    el('text', { x: L + (v / 100) * W, y: y + h + 40, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = v;
  }
  const cap = el('text', { x: L + W, y: y - 18, 'text-anchor': 'middle', class: 'cap' }, svg);
  cap.textContent = nashStep ? `≤ ${fmt(top)}` : 'anything goes?';
  requestAnimationFrame(() => {
    const wpx = Math.max(10, (top / 100) * W);
    live.setAttribute('width', wpx);
    cap.setAttribute('x', Math.max(L + 60, L + wpx));
    if (nashStep === NASH_TEXT.length - 1) cap.textContent = '0 ★ Nash';
  });
  $('#nashText').innerHTML = NASH_TEXT[nashStep];
  $('#nashBtn').textContent = nashStep === NASH_TEXT.length - 1 ? '↺ Start over' : 'Next round of reasoning →';
}
$('#nashBtn').onclick = () => { nashStep = (nashStep + 1) % NASH_TEXT.length; drawNash(); };
onEnter['Nash equilibrium'] = () => { nashStep = 0; drawNash(); };

// ---------------------------------------------------------------- why-not-zero slide
onEnter['Theory vs. you'] = async () => {
  const r = results && results.count ? results : await loadResults().catch(() => null);
  if (r && r.count) {
    $('#whyTarget').textContent = fmt(r.target);
    // How would someone who played the Nash equilibrium (0) have done?
    let beatZero = 0;
    r.bins.forEach((c, v) => { if (Math.abs(v - r.target) < r.target) beatZero += c; });
    $('#whySub').innerHTML = `Winning guess: <b>${fmt(r.winners[0].guess)}</b>. A perfectly rational 0 would have finished about <b>#${(beatZero + 1).toLocaleString()}</b> of ${r.count.toLocaleString()}.`;
    const rounds = [...(r.history || []), { round: r.round, target: r.target, mean: r.mean }];
    $('#history').innerHTML = rounds.length > 1
      ? 'Watch it fall: ' + rounds.map(h => `<span class="round-chip">Round ${h.round}: target <b>${fmt(h.target)}</b></span>`).join(' → ')
      : '';
    $('#againBtn').textContent = `Play round ${r.round + 1} →`;
  }
};

$('#againBtn').onclick = async () => {
  await api('/api/teacher/reset', {});
  results = null; shownRound = null; winnerShownRound = null;
  await setPhase('open');
  go(slides.findIndex(s => s.dataset.name === 'Play'));
};

// ---------------------------------------------------------------- dock
$('#dockToggle').onclick = () => $('#dock').classList.toggle('open');
$('#keyBtn').onclick = async () => {
  const ok = await unlock($('#keyIn').value.trim());
  if (!ok) { $('#keyIn').value = ''; $('#keyIn').placeholder = 'Nope. Try again.'; }
  else renderLive(false);
};
$('#keyIn').onkeydown = e => { if (e.key === 'Enter') $('#keyBtn').click(); };
$$('.dock-buttons [data-phase]').forEach(b => b.onclick = () => setPhase(b.dataset.phase));
$('#dockNew').onclick = async () => {
  if (!confirm('Start a new round? This round’s guesses are cleared (its summary is kept for comparison).')) return;
  await api('/api/teacher/reset', {});
  results = null; shownRound = null; winnerShownRound = null;
  go(slides.findIndex(s => s.dataset.name === 'Play'));
};
$('#dockDemo').onclick = async () => {
  await api('/api/teacher/demo', { n: 500 });
  results = null;
};
$('#dockWipe').onclick = async () => {
  if (!confirm('Wipe all guesses and all round history?')) return;
  await api('/api/teacher/reset', { discard: true, wipeHistory: true });
  results = null; shownRound = null; winnerShownRound = null;
  go(0);
};

// ---------------------------------------------------------------- boot
(async () => {
  if (key) await unlock(key);
  if (!isTeacher) $('#dock').classList.add('open');
  go(parseInt(location.hash.slice(1), 10) || 0);
  poll();
})();
