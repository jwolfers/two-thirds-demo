// "Go Blue, Guess Low": the two-thirds-of-the-average game, Michigan edition.
//
// One room, one round at a time, all state in memory.
//   Phones     /play (and /)  GET /api/me, POST /api/join, POST /api/guess
//   Projector  /teacher       GET /api/room; runs the round with POST /api/admin/:action
//                             (teacher key in the x-teacher-key header)
'use strict';

const express = require('express');
const path = require('path');
const QRCode = require('qrcode');

const TEACHER_KEY = process.env.TEACHER_KEY || 'go-blue';
const APP_URL = (process.env.APP_URL || '').replace(/\/+$/, '');
const MAX_PLAYERS = 3000;
const PUB = path.join(__dirname, 'public');

const router = express.Router();
router.use(express.json({ limit: '4kb' }));

/* ---------------------------------------------------------------- state */

const room = {
  round: 1,
  phase: 'lobby', // lobby -> open -> closed -> revealed
  players: new Map(), // pid -> { name, school, guess, at, bot }
  result: null, // computed when guessing closes
  history: [], // [{ round, n, mean, target, winners }]
  feed: [], // most recent names to lock in (never their numbers)
  openedAt: null,
};

/* -------------------------------------------------------------- helpers */

const BLOCKLIST = /(f+u+c+k|sh[i1]t|c+u+n+t|n[i1]gg|f[a@]gg|b[i1]tch|wh[o0]re|slut|rap(e|ist)|nazi|hitler|a+ss+h[o0]le|porn|d[i1]ck|pen[i1]s|vag[i1]na|\bcum\b)/i;

function clean(v, max) {
  const s = String(v == null ? '' : v)
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return BLOCKLIST.test(s) ? '' : s;
}
const okPid = (v) => (/^[A-Za-z0-9_-]{8,64}$/.test(String(v || '')) ? String(v) : null);

// Accepts 33, "33", "33.3" or "33,3"; keeps two decimals; null if not in [0, 100].
function parseGuess(v) {
  const raw = String(v == null ? '' : v).trim().replace(',', '.');
  if (!raw || !/^\d*\.?\d*$/.test(raw) || raw === '.') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

const ANIMALS = ['Wolverine', 'Badger', 'Gopher', 'Hawkeye', 'Wildcat', 'Spartan', 'Terrapin', 'Boilermaker', 'Hoosier', 'Cornhusker', 'Nittany Lion', 'Bruin', 'Trojan', 'Duck', 'Husky'];
const anonName = () => `Anonymous ${ANIMALS[Math.floor(Math.random() * ANIMALS.length)]} ${10 + Math.floor(Math.random() * 90)}`;

const r2 = (x) => Math.round(x * 100) / 100;

/* --------------------------------------------------------------- level-k */

// Level 0 picks at random (average 50). Level k best-responds to a room of
// level k-1 players: 50 * (2/3)^k. Each band runs halfway to its neighbours.
const LEVELS = [0, 1, 2, 3, 4].map((k) => 50 * Math.pow(2 / 3, k)); // 50, 33.3, 22.2, 14.8, 9.9
function levelOf(g) {
  if (g > 200 / 3 + 1e-9) return 'dom'; // can never win
  if (g < 2) return 'nash'; // zero, or near enough
  for (let k = 0; k < LEVELS.length - 1; k++) {
    if (g >= (LEVELS[k] + LEVELS[k + 1]) / 2) return `L${k}`;
  }
  return 'L4+';
}
const LEVEL_KEYS = ['dom', 'L0', 'L1', 'L2', 'L3', 'L4+', 'nash'];

/* --------------------------------------------------------------- scoring */

function computeResult() {
  const rows = [...room.players.entries()]
    .filter(([, p]) => p.guess != null)
    .map(([pid, p]) => ({ pid, name: p.name, school: p.school, guess: p.guess, at: p.at, bot: !!p.bot }));
  const n = rows.length;
  if (!n) return { n: 0, guesses: [], winners: [], levels: {} };

  const sum = rows.reduce((s, r) => s + r.guess, 0);
  const mean = sum / n;
  const target = (2 / 3) * mean;
  for (const r of rows) r.dist = Math.abs(r.guess - target);
  rows.sort((a, b) => a.dist - b.dist || a.at - b.at);
  const best = rows[0].dist;
  const winners = rows.filter((r) => r.dist - best < 1e-9);

  // rank = 1 + number of players strictly closer (ties share a rank)
  let rank = 0;
  let prev = -1;
  rows.forEach((r, i) => {
    if (Math.abs(r.dist - prev) > 1e-9) rank = i + 1;
    r.rank = rank;
    prev = r.dist;
  });

  const sorted = rows.map((r) => r.guess).sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const levels = Object.fromEntries(LEVEL_KEYS.map((k) => [k, 0]));
  for (const r of rows) levels[levelOf(r.guess)]++;

  return {
    n,
    sum: r2(sum),
    mean: r2(mean),
    target: r2(target),
    exactTarget: target,
    median: r2(median),
    min: sorted[0],
    max: sorted[n - 1],
    zeros: rows.filter((r) => r.guess === 0).length,
    hundreds: rows.filter((r) => r.guess === 100).length,
    levels,
    impliedK: mean > 0 && mean < 50 ? r2(Math.log(mean / 50) / Math.log(2 / 3)) : mean >= 50 ? 0 : null,
    guesses: sorted,
    winners: winners.map((w) => ({ name: w.name, school: w.school, guess: w.guess, bot: w.bot })),
    ranks: Object.fromEntries(rows.map((r) => [r.pid, { rank: r.rank, dist: r2(r.dist) }])),
  };
}

/* ----------------------------------------------------------------- robots */

const BOT_NAMES = ['RoboWolverine', 'Transfer Portal Bot', 'Botty Schembechler', 'Hash Equilibrium', 'Level-3 Larry', 'Nash Gordon', 'Zero Cool', 'Randy Random', 'Keynes-o-Tron', 'Fielding H. Bot', 'The Big House AI', 'Diag Squirrel', 'Punt Formation', 'Fourth & Long', 'GPU Go Blue', 'Maize Runner', 'Blue Screen', 'Two-Thirds Tom', 'Rational Rita', 'Bayes Wolverine'];
function botGuess() {
  const u = Math.random();
  const jitter = () => (Math.random() - 0.5) * 6;
  let g;
  if (u < 0.12) g = Math.random() * 100; // level 0
  else if (u < 0.3) g = 50 + jitter();
  else if (u < 0.55) g = 33 + jitter();
  else if (u < 0.75) g = 22 + jitter();
  else if (u < 0.87) g = 14 + jitter();
  else if (u < 0.94) g = Math.random() * 3; // Nash-ish
  else g = 67 + Math.random() * 33; // dominated
  return Math.max(0, Math.min(100, Math.round(g)));
}

/* ------------------------------------------------------------------ pages */

const page = (f) => (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(PUB, f));
};
router.get('/', page('play.html'));
router.get('/play', page('play.html'));
router.get('/teacher', page('teacher.html'));
router.get('/healthz', (req, res) => res.json({ ok: true }));
router.use(express.static(PUB, { maxAge: 0, index: false }));

function joinUrl(req) {
  const base = APP_URL || `${req.protocol}://${req.get('host')}${req.baseUrl}`;
  return `${base}/play`;
}
router.get('/api/join-url', (req, res) => res.json({ url: joinUrl(req) }));
router.get('/qr.svg', async (req, res) => {
  try {
    const svg = await QRCode.toString(joinUrl(req), { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#00274C', light: '#FFFFFF' } });
    res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
  } catch (e) {
    res.status(500).send('QR failed');
  }
});

/* ------------------------------------------------------------- phone API */

router.get('/api/me', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const pid = okPid(req.query.pid);
  const p = pid && room.players.get(pid);
  const out = { phase: room.phase, round: room.round, joined: !!p };
  if (p) {
    out.name = p.name;
    out.school = p.school;
    out.guess = p.guess;
  }
  if (room.phase === 'revealed' && room.result && room.result.n) {
    const R = room.result;
    out.result = { n: R.n, mean: R.mean, target: R.target, winners: R.winners.map((w) => ({ name: w.name, guess: w.guess })) };
    if (p && R.ranks[pid]) {
      out.mine = { ...R.ranks[pid], guess: p.guess, level: levelOf(p.guess), won: R.ranks[pid].rank === 1 };
    }
  }
  res.json(out);
});

router.post('/api/join', (req, res) => {
  const pid = okPid(req.body && req.body.pid);
  if (!pid) return res.status(400).json({ error: 'Bad player id. Try reloading the page.' });
  let p = room.players.get(pid);
  if (!p && room.players.size >= MAX_PLAYERS) return res.status(503).json({ error: 'The Big House is full. (First time all season.)' });
  const name = clean(req.body.name, 24) || (p && p.name) || anonName();
  const school = clean(req.body.school, 40);
  if (!p) {
    p = { name, school, guess: null, at: null, bot: false };
    room.players.set(pid, p);
  } else {
    p.name = name;
    p.school = school;
  }
  res.json({ ok: true, name: p.name, school: p.school });
});

router.post('/api/guess', (req, res) => {
  const pid = okPid(req.body && req.body.pid);
  const p = pid && room.players.get(pid);
  if (!p) return res.status(400).json({ error: 'Please join first.' });
  if (room.phase !== 'open') return res.status(409).json({ error: room.phase === 'lobby' ? 'Guessing has not opened yet. Patience, grasshopper.' : 'Too late! The whistle has blown.' });
  const g = parseGuess(req.body.guess);
  if (g == null) return res.status(400).json({ error: 'Pick a number from 0 to 100.' });
  const first = p.guess == null;
  p.guess = g;
  p.at = Date.now();
  if (first) {
    room.feed.unshift(p.name);
    room.feed.length = Math.min(room.feed.length, 14);
  }
  res.json({ ok: true, guess: g });
});

/* ---------------------------------------------------------- projector API */

function counts() {
  let guessed = 0;
  let bots = 0;
  const schools = new Map();
  for (const p of room.players.values()) {
    if (p.guess != null) guessed++;
    if (p.bot) bots++;
    if (p.school) {
      const k = p.school.toLowerCase();
      const e = schools.get(k) || { name: p.school, n: 0 };
      e.n++;
      schools.set(k, e);
    }
  }
  return {
    joined: room.players.size,
    guessed,
    bots,
    schools: [...schools.values()].sort((a, b) => b.n - a.n).slice(0, 24),
  };
}

router.get('/api/room', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const out = { phase: room.phase, round: room.round, ...counts(), feed: room.feed, history: room.history };
  if ((room.phase === 'closed' || room.phase === 'revealed') && room.result) {
    const { ranks, exactTarget, ...pub } = room.result; // ranks are per-player; keep them on the phones
    out.result = pub;
  }
  res.json(out);
});

const actions = {
  open() {
    if (room.phase === 'lobby' || room.phase === 'closed') {
      room.phase = 'open';
      room.result = null;
      room.openedAt = Date.now();
    }
  },
  close() {
    if (room.phase === 'open') {
      room.phase = 'closed';
      room.result = computeResult();
    }
  },
  reveal() {
    if (room.phase === 'open') actions.close();
    if (room.phase === 'closed') {
      room.phase = 'revealed';
      const R = room.result;
      if (R && R.n && !room.history.some((h) => h.round === room.round)) {
        room.history.push({ round: room.round, n: R.n, mean: R.mean, target: R.target, winners: R.winners.map((w) => w.name) });
      }
    }
  },
  next() {
    // a new round: keep names, clear guesses, send the robots home
    for (const [pid, p] of room.players) {
      if (p.bot) room.players.delete(pid);
      else {
        p.guess = null;
        p.at = null;
      }
    }
    room.round++;
    room.phase = 'lobby';
    room.result = null;
    room.feed = [];
  },
  bots() {
    const n = 25;
    for (let i = 0; i < n && room.players.size < MAX_PLAYERS; i++) {
      const pid = `bot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const name = `${BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]} ${Math.floor(Math.random() * 99) + 1}`;
      const guess = room.phase === 'open' ? botGuess() : null;
      room.players.set(pid, { name, school: 'Robot U.', guess, at: guess == null ? null : Date.now() + i, bot: true });
      if (guess != null) room.feed.unshift(name);
    }
    room.feed.length = Math.min(room.feed.length, 14);
  },
  reset() {
    room.players.clear();
    room.round = 1;
    room.phase = 'lobby';
    room.result = null;
    room.history = [];
    room.feed = [];
  },
};

router.post('/api/admin/:action', (req, res) => {
  if (req.get('x-teacher-key') !== TEACHER_KEY) return res.status(403).json({ error: 'Wrong teacher key.' });
  const fn = actions[req.params.action];
  if (!fn) return res.status(404).json({ error: 'Unknown action.' });
  fn();
  // robots added while guessing is open should pick right away (handled above);
  // robots added in the lobby pick when guessing opens:
  if (req.params.action === 'open') {
    for (const p of room.players.values()) {
      if (p.bot && p.guess == null) { p.guess = botGuess(); p.at = Date.now(); room.feed.unshift(p.name); }
    }
    room.feed.length = Math.min(room.feed.length, 14);
  }
  res.json({ ok: true, phase: room.phase, round: room.round });
});

router.get('/api/check-key', (req, res) => res.json({ ok: req.get('x-teacher-key') === TEACHER_KEY }));

module.exports = router;
module.exports.levelOf = levelOf;
