// The 2/3 Game, EconEd edition. Hail to the Victors (whoever is closest to 2/3 of the average).
//
// One room, one round at a time, all in memory.
//   Phones     /play (and /)   poll GET /api/state, POST /api/join and /api/guess
//   Projector  /teacher        polls GET /api/deck, runs the round with POST /api/admin/:action
//                              (teacher key in the x-teacher-key header)
'use strict';

const express = require('express');
const path = require('path');
const QRCode = require('qrcode');

const TEACHER_KEY = process.env.TEACHER_KEY || 'go-blue';
const APP_URL = (process.env.APP_URL || '').replace(/\/+$/, '');
const MAX_PLAYERS = 3000;
const EPS = 1e-9;

const router = express.Router();
router.use(express.json({ limit: '4kb' }));

/* ------------------------------------------------------------------ state */

let round = 1;
let status = 'lobby'; // lobby -> open -> closed -> revealed
let players = new Map(); // pid -> { name, school, guess, at, bot }
let result = null; // frozen at reveal
let history = []; // [{ round, n, avg, target, win }]
let ticker = []; // latest names to lock in (never their numbers)
let version = 0;
const bump = () => { version += 1; };

/* --------------------------------------------------------------- cleaning */

const BAD = /(f+u+c+k|sh[i1]t|c+u+n+t|n[i1]gg|f[a@]gg|b[i1]tch|wh[o0]re|slut|rap(e|ist)|nazi|hitler|a+ss+h[o0]le|porn|d[i1]ck|pen[i1]s|vag[i1]na)/i;

function clean(v, max) {
  const s = String(v == null ? '' : v)
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>&"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return BAD.test(s) ? '' : s;
}
const cleanPid = (v) => (/^[A-Za-z0-9_-]{8,64}$/.test(String(v || '')) ? String(v) : null);

// Accepts 33, "33", "33.3" or "33,3"; keeps two decimals; null when out of range.
function parseGuess(v) {
  const raw = String(v == null ? '' : v).trim().replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

const ANIMALS = ['Wolverine', 'Badger', 'Gopher', 'Buckeye*', 'Hawkeye', 'Wildcat', 'Spartan', 'Terrapin', 'Boilermaker', 'Hoosier', 'Cornhusker', 'Nittany Lion'];
function defaultName() {
  return `Anonymous ${ANIMALS[Math.floor(Math.random() * ANIMALS.length)]} #${Math.floor(10 + Math.random() * 90)}`;
}

/* ----------------------------------------------------------------- levels */

// Level k best-responds to a room of level k-1 players, so guesses 50 * (2/3)^k.
// Bands split at the midpoints between neighbouring levels.
const LEVELS = ['dom', 'L0', 'L1', 'L2', 'L3', 'L4', 'nash'];
function levelOf(g) {
  if (g > 200 / 3 + EPS) return 'dom';
  if (g > 41.67) return 'L0';
  if (g > 27.78) return 'L1';
  if (g > 18.52) return 'L2';
  if (g > 12.35) return 'L3';
  if (g > 1) return 'L4';
  return 'nash';
}

/* ---------------------------------------------------------------- scoring */

function compute() {
  const entries = [...players.entries()].filter(([, p]) => p.guess != null);
  const n = entries.length;
  const out = {
    round, n, sum: null, avg: null, target: null, median: null, min: null, max: null,
    winners: [], winDist: null, guesses: [], levels: {}, mine: new Map(),
  };
  for (const k of LEVELS) out.levels[k] = 0;
  if (!n) return out;

  const gs = entries.map(([, p]) => p.guess);
  out.sum = gs.reduce((s, x) => s + x, 0);
  out.avg = out.sum / n;
  out.target = (2 / 3) * out.avg;
  const sorted = [...gs].sort((a, b) => a - b);
  const m = n >> 1;
  out.median = n % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  out.min = sorted[0];
  out.max = sorted[n - 1];

  const rows = entries.map(([pid, p]) => ({ pid, p, d: Math.abs(p.guess - out.target) }));
  rows.sort((a, b) => a.d - b.d);
  out.winDist = rows[0].d;

  // Competition ranking: 1 + the number of people strictly closer than you.
  let rank = 1;
  rows.forEach((x, i) => {
    if (i > 0 && x.d > rows[i - 1].d + EPS) rank = i + 1;
    const win = x.d <= out.winDist + EPS;
    const level = levelOf(x.p.guess);
    out.mine.set(x.pid, { rank, dist: x.d, level, win });
    out.levels[level] += 1;
    if (win) out.winners.push({ name: x.p.name, school: x.p.school, guess: x.p.guess, bot: !!x.p.bot });
  });
  out.guesses = entries.map(([pid, p]) => [p.guess, out.mine.get(pid).win ? 1 : 0]);
  return out;
}

function publicResult(r) {
  if (!r) return null;
  const { mine, ...rest } = r;
  return { ...rest, winners: r.winners.slice(0, 10), winnerCount: r.winners.length };
}

/* ------------------------------------------------------------------- bots */

const BOT_A = ['Robo', 'Cyber', 'Turbo', 'Mecha', 'Auto', 'Silicon', 'Quantum', 'Laser', 'Byte', 'Nano'];
const BOT_B = ['Keynes', 'Nash', 'Nagel', 'Pareto', 'Walras', 'Arrow', 'Bayes', 'Smith', 'Ricardo', 'Thaler'];
function botGuess() {
  const u = Math.random();
  const noise = (sd) => (Math.random() + Math.random() + Math.random() - 1.5) * sd * 1.4;
  let g;
  if (u < 0.07) g = 67 + Math.random() * 33; // dominated
  else if (u < 0.17) g = Math.random() * 100; // level 0
  else if (u < 0.3) g = 50 + noise(5);
  else if (u < 0.55) g = 33.3 + noise(3);
  else if (u < 0.75) g = 22.2 + noise(2.5);
  else if (u < 0.85) g = 14.8 + noise(2);
  else if (u < 0.93) g = 2 + Math.random() * 10;
  else g = Math.random() < 0.6 ? 0 : 1;
  return Math.round(Math.min(100, Math.max(0, g)));
}
function addBots(k) {
  for (let i = 0; i < k && players.size < MAX_PLAYERS; i += 1) {
    const pid = `bot_${Math.random().toString(36).slice(2, 12)}`;
    const name = `${BOT_A[Math.floor(Math.random() * BOT_A.length)]}-${BOT_B[Math.floor(Math.random() * BOT_B.length)]} ${Math.floor(Math.random() * 900 + 100)}`;
    players.set(pid, { name, school: 'Robot U', guess: status === 'open' ? botGuess() : null, at: Date.now(), bot: true });
  }
}

/* ------------------------------------------------------------------ pages */

const PUB = path.join(__dirname, 'public');
const page = (f) => (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(PUB, f));
};
router.get('/', page('play.html'));
router.get('/play', page('play.html'));
router.get('/teacher', page('teacher.html'));
router.use(express.static(PUB, { maxAge: 0, index: false }));
router.get('/healthz', (req, res) => res.json({ ok: true }));

function playUrl(req) {
  const base = APP_URL || `${req.protocol}://${req.get('host')}`;
  return `${base}/play`;
}

router.get('/qr.svg', async (req, res) => {
  try {
    const svg = await QRCode.toString(playUrl(req), {
      type: 'svg', errorCorrectionLevel: 'M', margin: 1,
      color: { dark: '#00274C', light: '#FFFFFF' },
    });
    res.set('Content-Type', 'image/svg+xml').set('Cache-Control', 'no-store').send(svg);
  } catch (e) {
    res.status(500).send('QR failed');
  }
});

/* ------------------------------------------------------------- phone API */

function phoneState(pid) {
  const p = pid ? players.get(pid) : null;
  const out = {
    v: version, round, status, n: players.size,
    locked: [...players.values()].filter((x) => x.guess != null).length,
    me: p ? { name: p.name, school: p.school, guess: p.guess } : null,
  };
  if (status === 'revealed' && result) {
    const mine = pid ? result.mine.get(pid) : null;
    out.result = {
      n: result.n, avg: result.avg, target: result.target,
      winners: result.winners.slice(0, 5), winnerCount: result.winners.length,
      mine: mine ? { ...mine, guess: p ? p.guess : null } : null,
    };
  }
  return out;
}

router.get('/api/state', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(phoneState(cleanPid(req.query.pid)));
});

router.post('/api/join', (req, res) => {
  const pid = cleanPid(req.body && req.body.pid);
  if (!pid) return res.status(400).json({ error: 'Bad player id. Try reloading.' });
  let p = players.get(pid);
  if (!p) {
    if (players.size >= MAX_PLAYERS) return res.status(503).json({ error: 'The Big House is full. (That never happens.)' });
    p = { name: '', school: '', guess: null, at: Date.now(), bot: false };
    players.set(pid, p);
  }
  p.name = clean(req.body.name, 24) || p.name || defaultName();
  p.school = clean(req.body.school, 40) || p.school || '';
  bump();
  res.json(phoneState(pid));
});

router.post('/api/guess', (req, res) => {
  const pid = cleanPid(req.body && req.body.pid);
  const p = pid ? players.get(pid) : null;
  if (!p) return res.status(400).json({ error: 'Join first, then guess.' });
  if (status !== 'open') return res.status(409).json({ error: status === 'lobby' ? 'Guessing has not opened yet.' : 'Too late, the whistle has blown.' });
  const g = parseGuess(req.body.guess);
  if (g == null) return res.status(400).json({ error: 'Pick a number from 0 to 100.' });
  const first = p.guess == null;
  p.guess = g;
  p.at = Date.now();
  if (first) ticker = [p.name, ...ticker].slice(0, 14);
  bump();
  res.json(phoneState(pid));
});

/* ------------------------------------------------------------ teacher API */

const isTeacher = (req) => String(req.get('x-teacher-key') || req.query.key || '') === TEACHER_KEY;

router.get('/api/deck', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const teacher = isTeacher(req);
  const vals = [...players.values()];
  res.json({
    v: version, round, status, teacher,
    n: players.size,
    locked: vals.filter((x) => x.guess != null).length,
    bots: vals.filter((x) => x.bot).length,
    ticker,
    playUrl: playUrl(req),
    result: status === 'revealed' ? publicResult(result) : null,
    history,
  });
});

router.post('/api/admin/:action', (req, res) => {
  if (!isTeacher(req)) return res.status(403).json({ error: 'Teacher key required.' });
  const a = req.params.action;
  if (a === 'open') {
    if (status === 'revealed') return res.status(409).json({ error: 'Start a new round first.' });
    status = 'open';
    for (const p of players.values()) if (p.bot && p.guess == null) p.guess = botGuess();
  } else if (a === 'close') {
    if (status === 'open') status = 'closed';
  } else if (a === 'reveal') {
    if (status === 'open' || status === 'closed') {
      status = 'revealed';
      result = compute();
      if (result.n) {
        history = history.filter((h) => h.round !== round);
        history.push({ round, n: result.n, avg: result.avg, target: result.target, win: result.winners[0].guess });
      }
    }
  } else if (a === 'newround') {
    round += 1;
    status = 'lobby';
    result = null;
    ticker = [];
    for (const [pid, p] of players) {
      if (p.bot) players.delete(pid);
      else p.guess = null;
    }
  } else if (a === 'bots') {
    addBots(Math.min(200, Math.max(1, Number(req.body && req.body.count) || 25)));
  } else if (a === 'reset') {
    round = 1; status = 'lobby'; players = new Map(); result = null; history = []; ticker = [];
  } else {
    return res.status(404).json({ error: 'Unknown action.' });
  }
  bump();
  res.json({ ok: true, status, round });
});

module.exports = router;
