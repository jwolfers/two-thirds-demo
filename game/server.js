// The Two-Thirds Game: Maize & Blue vs. Spartan Blue.
//
// Everything lives in memory: one room, one round at a time.
//   Phones:    /play (and /), poll GET /api/state, post to /api/join and /api/guess
//   Projector: /teacher, polls GET /api/deck, drives the round via POST /api/admin/:action
//              with the teacher key in the x-teacher-key header.
'use strict';

const express = require('express');
const path = require('path');
const QRCode = require('qrcode');

const TEACHER_KEY = process.env.TEACHER_KEY || 'bronco-blue';
const APP_URL = (process.env.APP_URL || '').replace(/\/+$/, '');
const MAX_PLAYERS = 5000;
const EPS = 1e-9;
const TEAMS = ['um', 'cwru', 'other'];

const router = express.Router();
router.use(express.json({ limit: '8kb' }));

/* ------------------------------------------------------------------ state */

let round = 1;
let status = 'waiting'; // waiting -> open -> closed -> revealed
let players = new Map(); // pid -> { name, team, guess, at, bot }
let result = null; // computed at reveal
let history = []; // [{ round, n, avg, target, winGuess }]
let ticker = []; // newest lock-ins (names only, never numbers)
let version = 0;
const bump = () => { version += 1; };

/* --------------------------------------------------------------- cleaning */

const BAD = /(f+u+c+k|sh[i1]t|c+u+n+t|n[i1]gg|f[a@]gg|b[i1]tch|wh[o0]re|slut|rap(e|ist)|nazi|hitler|a+ss+h[o0]le|porn|d[i1]ck|pen[i1]s|vag[i1]na)/i;

function cleanName(v) {
  const s = String(v == null ? '' : v)
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>&"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  return BAD.test(s) ? '' : s;
}
const cleanPid = (v) => (/^[A-Za-z0-9_-]{8,64}$/.test(String(v || '')) ? String(v) : null);
const cleanTeam = (v) => (TEAMS.includes(v) ? v : 'other');

// Accepts 33, "33", "33.3", "33,3". Keeps two decimals. Null when out of range.
function parseGuess(v) {
  const raw = String(v == null ? '' : v).trim().replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

/* ----------------------------------------------------------------- levels */

// Level k reasons that everyone else is level k-1, so guesses 50 * (2/3)^k.
// Bands split at the midpoints between neighbouring levels.
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

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
function median(sorted) {
  if (!sorted.length) return null;
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function compute() {
  const entries = [...players.entries()].filter(([, p]) => p.guess != null);
  const n = entries.length;
  const out = {
    round, n, avg: null, target: null, median: null, min: null, max: null,
    winners: [], winDist: null, guesses: [], teams: {}, levels: {}, mine: new Map(),
  };
  for (const t of TEAMS) out.teams[t] = { n: 0, avg: null };
  for (const k of ['dom', 'L0', 'L1', 'L2', 'L3', 'L4', 'nash']) out.levels[k] = 0;
  if (!n) return out;

  const gs = entries.map(([, p]) => p.guess);
  out.avg = mean(gs);
  out.target = (2 / 3) * out.avg;
  const sorted = [...gs].sort((a, b) => a - b);
  out.median = median(sorted);
  out.min = sorted[0];
  out.max = sorted[n - 1];

  const dists = entries.map(([pid, p]) => ({ pid, p, d: Math.abs(p.guess - out.target) }));
  dists.sort((a, b) => a.d - b.d);
  out.winDist = dists[0].d;

  // Competition ranking: your rank is 1 + the number of people strictly closer.
  let rank = 1;
  dists.forEach((x, i) => {
    if (i > 0 && x.d > dists[i - 1].d + EPS) rank = i + 1;
    const win = x.d <= out.winDist + EPS;
    const level = levelOf(x.p.guess);
    out.mine.set(x.pid, { rank, dist: x.d, level, win });
    out.levels[level] += 1;
    if (win) out.winners.push({ name: x.p.name || 'Anonymous', team: x.p.team, guess: x.p.guess, bot: !!x.p.bot });
  });

  for (const t of TEAMS) {
    const g = entries.filter(([, p]) => p.team === t).map(([, p]) => p.guess);
    out.teams[t] = { n: g.length, avg: mean(g) };
  }
  out.guesses = entries.map(([pid, p]) => ({ g: p.guess, t: p.team, w: out.mine.get(pid).win ? 1 : 0 }));
  return out;
}

function publicResult(r) {
  if (!r) return null;
  const { mine, ...rest } = r;
  return { ...rest, winners: r.winners.slice(0, 12), winnerCount: r.winners.length };
}

/* ------------------------------------------------------------------- bots */

const BOT_FIRST = ['Robo', 'Cyber', 'Turbo', 'Mecha', 'Auto', 'Data', 'Silicon', 'Quantum', 'Laser', 'Byte'];
const BOT_LAST = ['Wolverine', 'Spartan', 'Economist', 'Nash', 'Keynes', 'Walrasian', 'Pareto', 'Arrow', 'Bayesian', 'Wolverine'];
function botGuess() {
  const u = Math.random();
  const noise = (sd) => (Math.random() + Math.random() + Math.random() - 1.5) * sd * 1.4;
  let g;
  if (u < 0.08) g = Math.random() * 100; // level 0, truly random
  else if (u < 0.22) g = 50 + noise(6); // "the middle"
  else if (u < 0.5) g = 33.3 + noise(4);
  else if (u < 0.74) g = 22.2 + noise(3);
  else if (u < 0.86) g = 14.8 + noise(2.5);
  else if (u < 0.94) g = 9.9 + noise(2);
  else g = Math.random() < 0.6 ? 0 : 1;
  return Math.round(Math.min(100, Math.max(0, g)) * 10) / 10;
}
function addBots(count) {
  for (let i = 0; i < count && players.size < MAX_PLAYERS; i += 1) {
    const pid = 'bot_' + Math.random().toString(36).slice(2, 12);
    const r = Math.random();
    const team = r < 0.45 ? 'um' : r < 0.85 ? 'cwru' : 'other';
    const name = `${BOT_FIRST[(Math.random() * BOT_FIRST.length) | 0]}-${BOT_LAST[(Math.random() * BOT_LAST.length) | 0]} ${(Math.random() * 90 + 10) | 0}`;
    players.set(pid, { name, team, guess: status === 'revealed' ? null : botGuess(), at: Date.now(), bot: true });
  }
  bump();
}

/* --------------------------------------------------------------- the URLs */

function joinUrl(req) {
  const base = APP_URL || `${req.protocol}://${req.get('host')}${req.baseUrl || ''}`;
  return `${base}/play`;
}
const qrCache = new Map();

/* ---------------------------------------------------------------- routes */

const noStore = (res) => res.set('Cache-Control', 'no-store');
const page = (file) => (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', file));
};

router.get('/', page('play.html'));
router.get('/play', page('play.html'));
router.get('/teacher', page('teacher.html'));
router.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: true }));

router.get('/healthz', (req, res) => res.json({ ok: true }));

router.get('/qr.svg', async (req, res) => {
  const url = joinUrl(req);
  try {
    if (!qrCache.has(url)) {
      qrCache.set(url, await QRCode.toString(url, {
        type: 'svg', margin: 1, errorCorrectionLevel: 'M',
        color: { dark: '#00274C', light: '#FFFFFF' },
      }));
    }
    res.type('image/svg+xml').set('Cache-Control', 'no-cache').send(qrCache.get(url));
  } catch (e) {
    res.status(500).send('QR failed');
  }
});

// Phones -------------------------------------------------------------------

router.get('/api/state', (req, res) => {
  noStore(res);
  const pid = cleanPid(req.query.pid);
  const p = pid ? players.get(pid) : null;
  const out = {
    round, status, version,
    joined: players.size,
    locked: [...players.values()].filter((x) => x.guess != null).length,
    me: p ? { name: p.name, team: p.team, guess: p.guess } : null,
    result: null,
  };
  if (status === 'revealed' && result) {
    const mine = pid ? result.mine.get(pid) : null;
    out.result = {
      n: result.n, avg: result.avg, target: result.target, median: result.median,
      winners: result.winners.slice(0, 5), winnerCount: result.winners.length, winDist: result.winDist,
      teams: result.teams,
      mine: mine || null,
    };
  }
  res.json(out);
});

router.post('/api/join', (req, res) => {
  const pid = cleanPid(req.body && req.body.pid);
  if (!pid) return res.status(400).json({ error: 'Bad player id.' });
  const existing = players.get(pid);
  if (!existing && players.size >= MAX_PLAYERS) return res.status(429).json({ error: 'The stadium is full!' });
  const name = cleanName(req.body.name);
  const team = cleanTeam(req.body.team);
  players.set(pid, { guess: null, at: Date.now(), ...existing, name, team });
  bump();
  res.json({ ok: true });
});

router.post('/api/guess', (req, res) => {
  const pid = cleanPid(req.body && req.body.pid);
  if (!pid) return res.status(400).json({ error: 'Bad player id.' });
  if (status !== 'open') {
    return res.status(409).json({ error: status === 'waiting' ? 'Guessing has not opened yet.' : 'The whistle has blown: guessing is closed.' });
  }
  const guess = parseGuess(req.body.guess);
  if (guess == null) return res.status(400).json({ error: 'Pick a number from 0 to 100.' });
  const existing = players.get(pid);
  if (!existing && players.size >= MAX_PLAYERS) return res.status(429).json({ error: 'The stadium is full!' });
  const name = req.body.name != null ? cleanName(req.body.name) : (existing && existing.name) || '';
  const team = req.body.team != null ? cleanTeam(req.body.team) : (existing && existing.team) || 'other';
  const first = !existing || existing.guess == null;
  players.set(pid, { ...existing, name, team, guess, at: Date.now() });
  if (first) {
    ticker.unshift({ name: name || 'Anonymous', team });
    ticker = ticker.slice(0, 10);
  }
  bump();
  res.json({ ok: true, guess });
});

// Projector ----------------------------------------------------------------

router.get('/api/deck', (req, res) => {
  noStore(res);
  const all = [...players.values()];
  const teamCounts = {};
  for (const t of TEAMS) teamCounts[t] = all.filter((p) => p.team === t).length;
  res.json({
    round, status, version,
    joined: all.length,
    locked: all.filter((p) => p.guess != null).length,
    teamCounts,
    ticker,
    result: status === 'revealed' ? publicResult(result) : null,
    history,
    joinUrl: joinUrl(req),
  });
});

router.post('/api/admin/:action', (req, res) => {
  if ((req.get('x-teacher-key') || '') !== TEACHER_KEY) return res.status(403).json({ error: 'Wrong teacher key.' });
  const a = req.params.action;
  if (a === 'check') return res.json({ ok: true });
  if (a === 'open') {
    if (status === 'revealed') return res.status(409).json({ error: 'Start a new round first.' });
    status = 'open';
  } else if (a === 'close') {
    if (status === 'open') status = 'closed';
  } else if (a === 'reveal') {
    if (status === 'open' || status === 'closed' || status === 'revealed') {
      status = 'revealed';
      result = compute();
      const summary = { round, n: result.n, avg: result.avg, target: result.target, winGuess: result.winners[0] ? result.winners[0].guess : null };
      history = history.filter((h) => h.round !== round).concat(summary);
    }
  } else if (a === 'newround') {
    round += 1;
    status = 'waiting';
    result = null;
    ticker = [];
    // Keep everyone's name and team, clear the guesses; robots go home.
    for (const [pid, p] of players) {
      if (p.bot) players.delete(pid);
      else p.guess = null;
    }
  } else if (a === 'bots') {
    const count = Math.max(1, Math.min(200, Number(req.body && req.body.count) || 25));
    if (status === 'revealed') return res.status(409).json({ error: 'Start a new round first.' });
    addBots(count);
  } else if (a === 'reset') {
    round = 1;
    status = 'waiting';
    players = new Map();
    result = null;
    history = [];
    ticker = [];
  } else {
    return res.status(404).json({ error: 'Unknown action.' });
  }
  bump();
  res.json({ ok: true, status, round });
});

module.exports = router;
module.exports.levelOf = levelOf;
