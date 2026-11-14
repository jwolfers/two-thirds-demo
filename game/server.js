// "Hail to the Two-Thirds": a live Keynesian beauty contest, Michigan style.
//
// One room, one round at a time, everything in memory.
//   Phones     /play (and /)  poll GET /api/me, POST /api/join and /api/guess
//   Projector  /teacher       polls GET /api/room; runs the round with POST /api/admin/:action
//                             (teacher key in the x-teacher-key header)
'use strict';

const express = require('express');
const path = require('path');
const QRCode = require('qrcode');

const TEACHER_KEY = process.env.TEACHER_KEY || 'go-blue';
const APP_URL = (process.env.APP_URL || '').replace(/\/+$/, '');
const MAX_PLAYERS = 5000;
const PUB = path.join(__dirname, 'public');

const router = express.Router();
router.use(express.json({ limit: '4kb' }));

/* ------------------------------------------------------------------ state */

const room = {
  round: 1,
  status: 'lobby', // lobby -> open -> closed (stage 0..3) -> revealed (stage 4)
  stage: 0, //        1 = histogram, 2 = average, 3 = target, 4 = winner
  players: new Map(), // pid -> { name, school, guess, at, bot }
  result: null, //    frozen when guessing closes
  history: [], //     [{ round, n, mean, target, winner }]
  ticker: [], //      latest names to lock in (never their numbers)
};

/* --------------------------------------------------------------- cleaning */

const NAUGHTY = /(f+u+c+k|sh[i1]t|c+u+n+t|n[i1]gg|f[a@]gg|b[i1]tch|wh[o0]re|slut|rap(e|ist)|nazi|hitler|a+ss+h[o0]le|porn|d[i1]ck|pen[i1]s|vag[i1]na|cum\b)/i;

function clean(v, max) {
  const s = String(v == null ? '' : v)
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return NAUGHTY.test(s) ? '' : s;
}
const cleanPid = (v) => (/^[A-Za-z0-9_-]{8,64}$/.test(String(v || '')) ? String(v) : null);

// Accepts 33, "33", "33.3" or "33,3". Two decimals at most. null when out of range.
function parseGuess(v) {
  const raw = String(v == null ? '' : v).trim().replace(',', '.');
  if (!raw || !/^\d*\.?\d*$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

const MASCOTS = ['Wolverine', 'Badger', 'Gopher', 'Hawkeye', 'Wildcat', 'Spartan', 'Terrapin', 'Boilermaker', 'Hoosier', 'Cornhusker', 'Nittany Lion', 'Bruin', 'Trojan', 'Duck', 'Husky', 'Scarlet Knight'];
const anonName = () => `Anonymous ${MASCOTS[Math.floor(Math.random() * MASCOTS.length)]} ${Math.floor(10 + Math.random() * 89)}`;

/* ----------------------------------------------------------------- levels */

// Level 0 guesses at random (average 50). Level k best-responds to a room of
// level k-1 players, so guesses 50 * (2/3)^k. Bands split halfway between levels.
const LEVEL_VALUES = [50, 100 / 3, 200 / 9, 400 / 27, 800 / 81];
function levelOf(g) {
  if (g > 200 / 3 + 1e-9) return 'dom';
  if (g <= 1) return 'nash';
  for (let k = 0; k < LEVEL_VALUES.length - 1; k++) {
    if (g > (LEVEL_VALUES[k] + LEVEL_VALUES[k + 1]) / 2) return `L${k}`;
  }
  return g > (LEVEL_VALUES[4] + LEVEL_VALUES[4] * 2 / 3) / 2 ? 'L4' : 'L5';
}
const LEVEL_KEYS = ['dom', 'L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'nash'];

/* ---------------------------------------------------------------- scoring */

const r2 = (x) => Math.round(x * 100) / 100;

function computeResult() {
  const rows = [...room.players.entries()]
    .filter(([, p]) => p.guess != null)
    .map(([pid, p]) => ({ pid, name: p.name, school: p.school, guess: p.guess, bot: !!p.bot }));
  const n = rows.length;
  if (!n) return { n: 0, guesses: [], winners: [], levels: {}, ranks: {} };

  const sum = rows.reduce((s, r) => s + r.guess, 0);
  const mean = sum / n;
  const target = (2 / 3) * mean;
  rows.forEach((r) => { r.dist = Math.abs(r.guess - target); });
  rows.sort((a, b) => a.dist - b.dist);

  // Competition ranking: ties share a place.
  const ranks = {};
  rows.forEach((r, i) => {
    r.rank = i > 0 && Math.abs(r.dist - rows[i - 1].dist) < 1e-9 ? rows[i - 1].rank : i + 1;
    ranks[r.pid] = r.rank;
  });

  const sorted = rows.map((r) => r.guess).sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  const levels = Object.fromEntries(LEVEL_KEYS.map((k) => [k, 0]));
  rows.forEach((r) => { levels[levelOf(r.guess)] += 1; });

  const winners = rows.filter((r) => r.rank === 1).map((r) => ({ name: r.name, school: r.school, guess: r.guess, bot: r.bot }));

  return {
    n,
    sum: r2(sum),
    mean: r2(mean),
    target: r2(target),
    median: r2(median),
    min: sorted[0],
    max: sorted[n - 1],
    zeros: sorted.filter((g) => g === 0).length,
    hundreds: sorted.filter((g) => g === 100).length,
    winDist: r2(rows[0].dist),
    winners,
    levels,
    guesses: sorted,
    // How many steps of reasoning would a room of identical thinkers need to produce this average?
    impliedK: mean > 0 && mean < 50 ? r2(Math.log(mean / 50) / Math.log(2 / 3)) : mean >= 50 ? 0 : null,
    ranks,
    byPid: Object.fromEntries(rows.map((r) => [r.pid, { guess: r.guess, dist: r2(r.dist), rank: r.rank }])),
  };
}

/* ----------------------------------------------------------------- robots */

// Rehearsal players. Roughly the mix you see in a first-time room, and they
// learn a little each round, which is more than can be said for some offenses.
function robotGuess(round) {
  const u = Math.random();
  const jitter = (sd) => (Math.random() + Math.random() + Math.random() - 1.5) * sd * 1.4;
  let g;
  if (u < 0.12) g = Math.random() * 100;
  else if (u < 0.3) g = 50 + jitter(8);
  else if (u < 0.55) g = 33 + jitter(4);
  else if (u < 0.75) g = 22 + jitter(3);
  else if (u < 0.85) g = 15 + jitter(2);
  else if (u < 0.92) g = 9 + jitter(2);
  else g = Math.random() * 2;
  g *= Math.pow(0.6, round - 1);
  return Math.round(Math.min(100, Math.max(0, g)));
}
const ROBOT_NAMES = ['Robo-Bo', 'HAL 9000-Yard Rusher', 'Botty McBotface', 'R2-D2/3', 'The Terminator (of drives)', 'Clippy', 'Deep Blue (and Maize)', 'Wall-E', 'Bender', 'Data', 'Optimus Prime Rate', 'Marvin the Paranoid', 'Johnny 5', 'Robo-Keynes', 'Nash-bot', 'Level-k Larry', 'Rosie', 'K-2SO', 'Baymax', 'Sonny'];

/* ---------------------------------------------------------------- helpers */

const isAdmin = (req) => String(req.get('x-teacher-key') || '') === TEACHER_KEY;
const counts = () => {
  let joined = 0, guessed = 0, bots = 0;
  for (const p of room.players.values()) {
    joined += 1;
    if (p.guess != null) guessed += 1;
    if (p.bot) bots += 1;
  }
  return { joined, guessed, bots };
};
const joinUrl = (req) => `${APP_URL || `${req.protocol}://${req.get('host')}`}/play`;

function closeGuessing() {
  room.status = 'closed';
  room.stage = 0;
  room.result = computeResult();
}

/* ----------------------------------------------------------------- routes */

const page = (file) => (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(PUB, file));
};
router.get('/', page('play.html'));
router.get('/play', page('play.html'));
router.get('/teacher', page('teacher.html'));
router.get('/healthz', (req, res) => res.json({ ok: true }));
router.use(express.static(PUB, { maxAge: 0, index: false }));

router.get('/qr.svg', async (req, res) => {
  try {
    const svg = await QRCode.toString(joinUrl(req), {
      type: 'svg', margin: 1, errorCorrectionLevel: 'M',
      color: { dark: '#00274C', light: '#FFFFFF' },
    });
    res.set('Content-Type', 'image/svg+xml').set('Cache-Control', 'no-store').send(svg);
  } catch (e) {
    res.status(500).send('QR trouble');
  }
});

// A phone's view of the world.
router.get('/api/me', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const pid = cleanPid(req.query.pid);
  const me = pid && room.players.get(pid);
  const out = {
    round: room.round,
    status: room.status,
    joined: !!me,
    name: me ? me.name : null,
    school: me ? me.school : null,
    guess: me ? me.guess : null,
    count: counts().guessed,
  };
  if (room.status === 'revealed' && room.result && room.result.n) {
    const R = room.result;
    const mine = pid && R.byPid[pid];
    out.result = {
      n: R.n, mean: R.mean, target: R.target, winners: R.winners, winDist: R.winDist,
      me: mine ? { ...mine, level: levelOf(mine.guess), won: mine.rank === 1 } : null,
    };
  }
  res.json(out);
});

router.post('/api/join', (req, res) => {
  const pid = cleanPid(req.body && req.body.pid);
  if (!pid) return res.status(400).json({ error: 'Your phone forgot who it is. Reload the page?' });
  const existing = room.players.get(pid);
  if (!existing && room.players.size >= MAX_PLAYERS) return res.status(429).json({ error: 'The Big House holds 107,601. This game holds fewer. We are full.' });
  const name = clean(req.body.name, 24) || (existing && existing.name) || anonName();
  const school = clean(req.body.school, 40);
  if (existing) Object.assign(existing, { name, school });
  else room.players.set(pid, { name, school, guess: null, at: 0, bot: false });
  res.json({ ok: true, name });
});

router.post('/api/guess', (req, res) => {
  const pid = cleanPid(req.body && req.body.pid);
  const me = pid && room.players.get(pid);
  if (!me) return res.status(400).json({ error: 'Join the game first.' });
  if (room.status !== 'open') {
    return res.status(409).json({ error: room.status === 'lobby' ? 'Guessing isn’t open yet. Hold that thought.' : 'Too late. The whistle has blown.' });
  }
  const g = parseGuess(req.body.guess);
  if (g == null) return res.status(400).json({ error: 'Pick a number from 0 to 100.' });
  const first = me.guess == null;
  me.guess = g;
  me.at = Date.now();
  if (first) {
    room.ticker.push(me.name);
    if (room.ticker.length > 12) room.ticker.shift();
  }
  res.json({ ok: true, guess: g });
});

// The projector's view of the world.
router.get('/api/room', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const c = counts();
  const out = {
    round: room.round,
    status: room.status,
    stage: room.stage,
    ...c,
    ticker: room.ticker.slice(-8),
    history: room.history,
    joinUrl: joinUrl(req),
    admin: isAdmin(req),
  };
  if ((room.status === 'closed' || room.status === 'revealed') && room.result) {
    const { ranks, byPid, ...pub } = room.result;
    out.result = pub;
  }
  res.json(out);
});

router.post('/api/admin/:action', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'That is the teacher’s whistle.' });
  const a = req.params.action;
  if (a === 'check') return res.json({ ok: true });

  if (a === 'open') {
    if (room.status === 'closed' || room.status === 'revealed') return res.status(409).json({ error: 'Start a new round first.' });
    room.status = 'open';
  } else if (a === 'close') {
    if (room.status !== 'open') return res.status(409).json({ error: 'Guessing isn’t open.' });
    closeGuessing();
  } else if (a === 'reveal') {
    if (room.status === 'lobby') return res.status(409).json({ error: 'Nothing to reveal yet.' });
    if (room.status === 'open') closeGuessing();
    if (room.stage < 4) room.stage += 1;
    if (room.stage === 4 && room.status !== 'revealed') {
      room.status = 'revealed';
      const R = room.result;
      if (R && R.n) room.history.push({ round: room.round, n: R.n, mean: R.mean, target: R.target, winner: R.winners[0].guess });
    }
  } else if (a === 'replay') {
    if (room.status === 'revealed' || room.status === 'closed') room.stage = 1;
  } else if (a === 'newround') {
    for (const [pid, p] of room.players) {
      if (p.bot) room.players.delete(pid);
      else { p.guess = null; p.at = 0; }
    }
    if (room.status === 'revealed' || room.status === 'closed') room.round += 1;
    Object.assign(room, { status: 'lobby', stage: 0, result: null, ticker: [] });
  } else if (a === 'reset') {
    Object.assign(room, { round: 1, status: 'lobby', stage: 0, result: null, history: [], ticker: [] });
    room.players.clear();
  } else if (a === 'robots') {
    if (room.status === 'closed' || room.status === 'revealed') return res.status(409).json({ error: 'Robots only play before the whistle.' });
    for (let i = 0; i < 25; i++) {
      const pid = `bot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      const name = `${ROBOT_NAMES[Math.floor(Math.random() * ROBOT_NAMES.length)]} #${Math.floor(Math.random() * 900 + 100)}`;
      room.players.set(pid, { name, school: 'Robot U', guess: robotGuess(room.round), at: Date.now(), bot: true });
    }
  } else {
    return res.status(404).json({ error: 'Unknown play call.' });
  }
  res.json({ ok: true, status: room.status, stage: room.stage });
});

module.exports = router;
module.exports.levelOf = levelOf;
