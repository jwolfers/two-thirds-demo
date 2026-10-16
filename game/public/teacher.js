// Teacher deck: slides, live polling, and the controls that run the game.
const $ = (s) => document.querySelector(s);
const C = { blue: '#00274C', maize: '#FFCB05', brown: '#6C4023', gold: '#F1C500', muted: '#5B6573', line: '#E3DDCF', ink: '#14202E', cream: '#FBF7EE' };
const fmt = (x) => (x == null ? '–' : (Math.round(x * 10) / 10).toString());

// ---- Teacher key: ?key=... is remembered in this browser, then hidden from the address bar ----
let key = '';
try { key = localStorage.getItem('tt-key') || ''; } catch {}
const urlKey = new URLSearchParams(location.search).get('key');
if (urlKey) {
  key = urlKey;
  try { localStorage.setItem('tt-key', key); } catch {}
  history.replaceState(null, '', location.pathname + location.hash);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'x-teacher-key': key },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
}

// ---- Stage scaling ----
function fit() {
  const vp = $('#viewport').getBoundingClientRect();
  const s = Math.min(vp.width / 1600, vp.height / 900);
  $("#stage").style.transform = `translate(-50%, -50%) scale(${s})`;
}
addEventListener('resize', fit); fit();

// ---- Slides ----
const slides = [...document.querySelectorAll('.slide')];
const SLIDE = Object.fromEntries(slides.map((s, i) => [s.dataset.name, i]));
let current = 0;
slides.forEach((s, i) => {
  const b = document.createElement('button');
  b.textContent = s.dataset.name; b.onclick = () => go(i);
  $('#dots').appendChild(b);
});
function go(i) {
  current = Math.max(0, Math.min(slides.length - 1, i));
  slides.forEach((s, j) => s.classList.toggle('active', j === current));
  [...$('#dots').children].forEach((b, j) => b.classList.toggle('on', j === current));
  try { sessionStorage.setItem('tt-slide', current); } catch {}
  lastDrawn = {}; // redraw charts so their entrance animations play
  render();
}
$('#prev').onclick = () => go(current - 1);
$('#next').onclick = () => go(current + 1);
addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea')) return;
  if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(current + 1); }
  else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(current - 1); }
  else if (e.key === 'f' || e.key === 'F') toggleFs();
  else if ((e.key === 's' || e.key === 'S') && state?.teacher) simulate();
});
function toggleFs() {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
}
$('#fs').onclick = toggleFs;
document.addEventListener('fullscreenchange', () => { document.body.classList.toggle('fullscreen', !!document.fullscreenElement); setTimeout(fit, 50); });

// ---- Live state ----
let state = null;
let lastCount = 0;
let lastDrawn = {};
let confettiRound = null;

async function poll() {
  try {
    state = await api('/api/state');
    render();
  } catch (e) { $('#barStatus').textContent = 'Reconnecting…'; }
}
setInterval(poll, 1000);

const TICKS = [
  'Thinking about what they think you think…',
  'Somewhere, John Maynard Keynes is smiling.',
  'Level-0 thinkers: please just pick a number.',
  'Reminder: the average includes you.',
  'Wolverines and Broncos, united by fractions.',
  'Picking 100 is a choice. Not a good one, but a choice.',
  'Changed your mind? You can re-submit until we close.',
];

function render() {
  if (!state) return;
  const s = state;
  document.body.classList.toggle('is-teacher', s.teacher);
  $('#viewOnly').hidden = s.teacher;
  const phaseLabel = { waiting: 'Waiting to open', open: 'Guessing is open', closed: 'Guessing closed', revealed: 'Winner revealed' }[s.phase];
  $('#barStatus').textContent = `Round ${s.round} · ${phaseLabel} · ${s.count} guess${s.count === 1 ? '' : 'es'}`;

  // Join
  $('#joinUrl').textContent = s.joinUrl.replace(/^https?:\/\//, '');
  if (!$('#qr').src) $('#qr').src = '/api/qr.svg';
  const st = $('#status');
  st.textContent = phaseLabel; st.className = 'status ' + (s.phase === 'open' ? 'open' : s.phase === 'waiting' ? '' : 'closed');
  if (s.count !== lastCount) {
    $('#count').textContent = s.count;
    $('.counter').classList.remove('bump'); void $('.counter').offsetWidth; $('.counter').classList.add('bump');
    lastCount = s.count;
  }
  $('#countLabel').textContent = s.count === 1 ? 'guess in' : 'guesses in';
  $('#btnOpen').disabled = s.phase === 'open' || s.phase === 'revealed';
  $('#btnOpen').textContent = s.phase === 'closed' ? 'Reopen guessing' : 'Open guessing';
  $('#btnClose').disabled = s.phase !== 'open';

  const r = s.results;
  // Results
  $('#resultsLocked').style.display = r ? 'none' : '';
  $('#resultsBody').classList.toggle('show', !!r);
  if (r) {
    $('#sN').textContent = r.n;
    $('#sMean').textContent = r.n ? fmt(r.mean) : '–';
    $('#sTarget').textContent = r.n ? fmt(r.target) : '–';
    $('#sRange').textContent = r.n ? `${fmt(r.min)}–${fmt(r.max)}` : '–';
    $('#resultsTitle').textContent = r.n ? `${r.n} guesses. Here's the damage.` : 'Nobody guessed. Bold strategy.';
    drawOnce('hist', `${r.n}-${r.mean}`, () => drawHistogram(r));
  }

  // Winner
  const revealed = s.phase === 'revealed' && r && r.n;
  $('#winnerLocked').hidden = !!revealed;
  $('#winnerBody').hidden = !revealed;
  $('#btnReveal').disabled = s.phase !== 'closed';
  $('#btnReveal').hidden = s.phase === 'revealed';
  if (revealed) {
    const names = r.winners.map((w) => w.name);
    const h = $('#winnerNames');
    h.textContent = names.length > 4 ? `${names.length}-way tie!` : names.join(' & ');
    h.classList.toggle('many', names.length > 1);
    const g = r.winners[0].guess;
    $('#winnerLine').innerHTML = `${names.length > 1 ? 'Each' : 'They'} guessed <b>${fmt(g)}</b>. The target was <b>${fmt(r.target)}</b> (⅔ × ${fmt(r.mean)}). ` +
      (names.length > 1 ? 'Glory is shared. Equally. Like a good economist would want.' : `Off by just ${fmt(Math.abs(g - r.target))}.`);
    if (current === SLIDE.Winner && confettiRound !== s.round) { confettiRound = s.round; confetti(); }
  }

  // Level-k
  if (current === SLIDE['Level-k']) drawOnce('ladder', r ? `${r.n}-${r.mean}` : 'none', () => drawLadder(r));
  if (r && r.n) {
    const k = r.mean > 0 && r.mean < 50 ? Math.log(r.mean / 50) / Math.log(2 / 3) : null;
    $('#implied').innerHTML = k == null
      ? `This room averaged <b>${fmt(r.mean)}</b>. That's Level 0 territory. Somebody is trolling, and we see you.`
      : `This room averaged <b>${fmt(r.mean)}</b>: like a crowd of <b>Level ${fmt(k)}</b> thinkers. The winner needed to be one step deeper than the crowd, not infinitely deep.`;
  } else $('#implied').textContent = 'Play a round to see how deep this room thinks.';

  // Theory vs room
  $('#vMean').textContent = r && r.n ? fmt(r.mean) : '?';
  $('#vTarget').textContent = r && r.n ? fmt(r.target) : '?';
  $('#zerosNote').innerHTML = r && r.n
    ? (r.zeros
      ? `<b>${r.zeros}</b> of you guessed 0. Perfectly rational, and ${r.target > 1 ? 'perfectly beaten' : 'vindicated'}. ${r.target > 1 ? 'Assuming everyone is a genius is a fine theory and a losing strategy.' : 'Kalamazoo is full of game theorists!'}`
      : 'Nobody guessed 0. You all bet that someone else would overthink less than you. And you were right.')
      + (r.over67 ? ` Also: ${r.over67} guess${r.over67 === 1 ? 'ed' : 'es were'} above 66.7, which can never win. We'll talk after class.` : '')
    : '';

  // Rounds
  if (current === SLIDE['Play again']) drawOnce('rounds', JSON.stringify(s.history), () => drawRounds(s.history));
  $('#btnNew').disabled = !(s.phase === 'revealed' || s.count === 0);

  // Ticker
  $('#ticker').textContent = s.phase === 'open' ? TICKS[Math.floor(Date.now() / 4000) % TICKS.length]
    : s.phase === 'waiting' ? 'Hang tight: guessing opens in a moment.' : 'Pencils down. Phones too.';
}

function drawOnce(slot, sig, fn) {
  if (lastDrawn[slot] === sig) return;
  lastDrawn[slot] = sig; fn();
}

// ---- Charts (hand-rolled SVG) ----
function drawHistogram(r) {
  const W = 1420, H = 470, L = 60, R = 20, T = 70, B = 50;
  const bins = new Array(20).fill(0);
  r.values.forEach((v) => { bins[Math.min(19, Math.floor(v / 5))]++; });
  const max = Math.max(1, ...bins);
  const x = (v) => L + (v / 100) * (W - L - R);
  const y = (c) => H - B - (c / max) * (H - B - T);
  const bw = (W - L - R) / 20;
  const tBin = Math.min(19, Math.floor(r.target / 5));
  let svg = `<svg viewBox="0 0 ${W} ${H}">`;
  svg += `<rect x="${x(66.67)}" y="${T}" width="${x(100) - x(66.67)}" height="${H - B - T}" fill="${C.brown}" opacity=".07"/>`;
  // Gridlines
  const step = max <= 5 ? 1 : Math.ceil(max / 5);
  for (let c = 0; c <= max; c += step) svg += `<line x1="${L}" x2="${W - R}" y1="${y(c)}" y2="${y(c)}" stroke="${C.line}" stroke-width="2"/><text x="${L - 12}" y="${y(c) + 7}" text-anchor="end" font-size="20" fill="${C.muted}">${c}</text>`;
  bins.forEach((c, i) => {
    if (!c) return;
    const fill = i === tBin ? C.maize : i >= 14 ? C.brown : C.blue;
    svg += `<rect class="bar-rect" style="animation-delay:${i * 35}ms" x="${x(i * 5) + 3}" y="${y(c)}" width="${bw - 6}" height="${H - B - y(c)}" rx="6" fill="${fill}"/>`;
    svg += `<text x="${x(i * 5) + bw / 2}" y="${y(c) - 10}" text-anchor="middle" font-size="22" font-weight="700" fill="${C.blue}">${c}</text>`;
  });
  for (let v = 0; v <= 100; v += 10) svg += `<text x="${x(v)}" y="${H - B + 34}" text-anchor="middle" font-size="22" fill="${C.muted}" font-family="Oswald">${v}</text>`;
  svg += `<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="${C.blue}" stroke-width="3"/>`;
  // Average and target markers
  svg += marker(x(r.mean), T - 50, H - B, C.brown, `Average ${fmt(r.mean)}`, '10 8', r.mean > r.target ? 'start' : 'end');
  svg += marker(x(r.target), T - 50, H - B, C.blue, `⅔ × avg = ${fmt(r.target)}`, '', r.mean > r.target ? 'end' : 'start', C.maize);
  svg += `<text x="${x(83)}" y="${T - 10}" text-anchor="middle" font-size="18" fill="${C.brown}" font-style="italic">above 66.7: can never win</text>`;
  return ($('#histogram').innerHTML = svg + '</svg>');
}
function marker(px, top, bottom, color, label, dash, anchor, bg) {
  const dx = anchor === 'start' ? 10 : -10;
  return `<line x1="${px}" x2="${px}" y1="${top}" y2="${bottom}" stroke="${color}" stroke-width="5" ${dash ? `stroke-dasharray="${dash}"` : ''}/>` +
    (bg ? `<rect x="${anchor === 'start' ? px + 4 : px - 260}" y="${top - 6}" width="256" height="40" rx="8" fill="${bg}"/>` : '') +
    `<text x="${px + dx}" y="${top + 22}" text-anchor="${anchor}" font-size="26" font-weight="700" fill="${color}" font-family="Oswald">${label}</text>`;
}

function drawLadder(r) {
  const W = 940, H = 600, L = 20, B = 70, T = 40;
  const levels = [0, 1, 2, 3, 4, 5, 6].map((k) => ({ k: `L${k}`, v: 50 * (2 / 3) ** k }));
  levels.push({ k: 'Nash', v: 0 });
  // Each guess counts toward its nearest level, if it's within 3 of it
  const near = (g) => levels.reduce((b, lv) => (Math.abs(g - lv.v) < Math.abs(g - b.v) ? lv : b));
  const share = (v) => (r && r.n ? Math.round((100 * r.values.filter((g) => { const n = near(g); return n.v === v && Math.abs(g - v) <= 3; }).length) / r.n) : null);
  const bw = (W - L) / levels.length;
  const y = (v) => H - B - (v / 55) * (H - B - T);
  let svg = `<svg viewBox="0 0 ${W} ${H}">`;
  levels.forEach((lv, i) => {
    const px = L + i * bw;
    const fill = i === 0 ? C.brown : lv.k === 'Nash' ? C.gold : C.blue;
    if (lv.v > 0) svg += `<rect class="bar-rect" style="animation-delay:${i * 90}ms" x="${px + 8}" y="${y(lv.v)}" width="${bw - 16}" height="${H - B - y(lv.v)}" rx="8" fill="${fill}"/>`;
    else svg += `<circle cx="${px + bw / 2}" cy="${H - B - 14}" r="14" fill="${C.gold}" stroke="${C.brown}" stroke-width="4"/>`;
    svg += `<text x="${px + bw / 2}" y="${(lv.v > 0 ? y(lv.v) : H - B - 28) - 12}" text-anchor="middle" font-size="26" font-weight="700" fill="${C.blue}" font-family="Oswald">${fmt(lv.v)}</text>`;
    svg += `<text x="${px + bw / 2}" y="${H - B + 32}" text-anchor="middle" font-size="24" fill="${C.ink}" font-family="Oswald">${lv.k}</text>`;
    const sh = share(lv.v);
    if (sh != null) svg += `<text x="${px + bw / 2}" y="${H - B + 60}" text-anchor="middle" font-size="21" fill="${C.brown}" font-weight="700">${sh}% of you</text>`;
  });
  if (r && r.n) {
    svg += `<line x1="${L}" x2="${W}" y1="${y(r.mean)}" y2="${y(r.mean)}" stroke="${C.brown}" stroke-width="4" stroke-dasharray="12 8"/>`;
    svg += `<rect x="${W - 250}" y="${y(r.mean) - 44}" width="250" height="36" rx="8" fill="${C.cream}"/><text x="${W - 6}" y="${y(r.mean) - 16}" text-anchor="end" font-size="24" font-weight="700" fill="${C.brown}" font-family="Oswald">Your average: ${fmt(r.mean)}</text>`;
  }
  $('#ladder').innerHTML = svg + '</svg>';
}

function drawRounds(history) {
  const el = $('#roundsChart');
  if (!history.length) { el.innerHTML = '<div class="locked" style="height:100%">Finish a round to start the scoreboard.</div>'; return; }
  const W = 1000, H = 600, L = 60, B = 60, T = 40;
  const n = history.length;
  const gw = (W - L) / Math.max(n, 3);
  const y = (v) => H - B - (v / 60) * (H - B - T);
  let svg = `<svg viewBox="0 0 ${W} ${H}">`;
  for (let v = 0; v <= 60; v += 10) svg += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="${C.line}" stroke-width="2"/><text x="${L - 10}" y="${y(v) + 7}" text-anchor="end" font-size="20" fill="${C.muted}">${v}</text>`;
  history.forEach((h, i) => {
    const px = L + i * gw + 20, w = (gw - 60) / 2;
    const m = Math.min(h.mean, 60), t = Math.min(h.target, 60);
    svg += `<rect class="bar-rect" x="${px}" y="${y(m)}" width="${w}" height="${H - B - y(m)}" rx="6" fill="${C.blue}"/>`;
    svg += `<rect class="bar-rect" style="animation-delay:120ms" x="${px + w + 8}" y="${y(t)}" width="${w}" height="${H - B - y(t)}" rx="6" fill="${C.maize}"/>`;
    svg += `<text x="${px + w / 2}" y="${y(m) - 10}" text-anchor="middle" font-size="24" font-weight="700" fill="${C.blue}" font-family="Oswald">${fmt(h.mean)}</text>`;
    svg += `<text x="${px + w * 1.5 + 8}" y="${y(t) - 10}" text-anchor="middle" font-size="24" font-weight="700" fill="${C.brown}" font-family="Oswald">${fmt(h.target)}</text>`;
    svg += `<text x="${px + w + 4}" y="${H - B + 36}" text-anchor="middle" font-size="26" font-family="Oswald" fill="#14202E">ROUND ${h.round} (n=${h.n})</text>`;
  });
  svg += `<rect x="${W - 330}" y="0" width="22" height="22" fill="${C.blue}" rx="4"/><text x="${W - 300}" y="19" font-size="20">Average</text>`;
  svg += `<rect x="${W - 190}" y="0" width="22" height="22" fill="${C.maize}" rx="4"/><text x="${W - 160}" y="19" font-size="20">⅔ target</text>`;
  el.innerHTML = svg + '</svg>';
}

// ---- Nash: iterated elimination of dominated strategies ----
const NASH = [
  ['Start with everything', 'Every number from 0 to 100 is allowed. Which ones could a sensible player ever pick?'],
  ['Step 1: drop the dominated guesses', 'Even if <b>everyone</b> guesses 100, ⅔ of the average is only 66.7. So any guess above 66.7 can never win. Picking 68 is like ordering the extra-large when the medium is free.'],
  ['Step 2: everyone knows step 1', 'If nobody sensible goes above 66.7, the average is at most 66.7, so the target is at most 44.4. Out goes everything above 44.4.'],
  ['Step 3: everyone knows that everyone knows', 'Same logic again: now the ceiling is 29.6. Each layer of “I know that you know that I know…” trims another third.'],
  ['Step 4: …and so on', 'Ceiling 19.8, then 13.2, then 8.8… The surviving interval keeps shrinking.'],
  ['Only zero survives', 'Keep going forever and the only number left is <b>0</b>. If everyone picks 0, the target is 0, and nobody can do better by switching. That is the <b>Nash equilibrium</b>. (It is also, usually, a losing guess. Next slide.)'],
];
let nashStep = 0;
function drawNash() {
  const cut = nashStep === NASH.length - 1 ? 0 : 100 * (2 / 3) ** nashStep;
  $('#nlDead').style.width = `${100 - cut}%`;
  $('#nlCut').style.left = `calc(${cut}% - 3px)`;
  $('#nlCutLabel').textContent = nashStep === 0 ? '100' : nashStep === NASH.length - 1 ? '0!' : `≤ ${fmt(cut)}`;
  $('#nashText').innerHTML = `<h3>${NASH[nashStep][0]}</h3><p>${NASH[nashStep][1]}</p>`;
  $('#nashBack').disabled = nashStep === 0;
  $('#nashStep').disabled = nashStep === NASH.length - 1;
}
$('#nashStep').onclick = () => { nashStep = Math.min(NASH.length - 1, nashStep + 1); drawNash(); };
$('#nashBack').onclick = () => { nashStep = Math.max(0, nashStep - 1); drawNash(); };
drawNash();

// ---- Confetti ----
function confetti() {
  const box = $('#confetti'); box.innerHTML = '';
  const colors = [C.maize, C.gold, '#fff', C.brown, '#FFE27A'];
  for (let i = 0; i < 160; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = `${2.5 + Math.random() * 2.5}s`;
    p.style.animationDelay = `${Math.random() * 1.2}s`;
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(p);
  }
}

// ---- Controls ----
async function act(path, body = {}, then) {
  try { state = await api(path, body); render(); then && then(); } catch (e) { toast(e.message); }
}
$('#btnOpen').onclick = () => act('/api/open');
$('#btnClose').onclick = () => act('/api/close', {}, () => setTimeout(() => go(SLIDE.Results), 700));
$('#btnReveal').onclick = () => act('/api/reveal', {}, () => { confettiRound = state.round; confetti(); });
$('#btnNew').onclick = () => act('/api/new-round', {}, () => go(SLIDE.Join));
$('#btnReset').onclick = () => { if (confirm('Clear all guesses and all past rounds?')) act('/api/reset', {}, () => go(SLIDE.Join)); };
function simulate() {
  act('/api/simulate', { n: 40 });
}
$('#enterKey').onclick = () => {
  const k = prompt('Teacher key:');
  if (k) { key = k.trim(); try { localStorage.setItem('tt-key', key); } catch {} poll(); }
};

let saved = 0;
try { saved = Number(sessionStorage.getItem('tt-slide')) || 0; } catch {}
go(saved);
poll();
