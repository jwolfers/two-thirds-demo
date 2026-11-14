// The ⅔ Game, Michigan edition.
//
// One round at a time lives in memory. Phones post guesses to /api/guess and poll
// /api/state; the projector deck polls /api/deck and drives the round through
// /api/admin/* with the teacher key.
'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const TEACHER_KEY = process.env.TEACHER_KEY || 'bronco-blue';
const APP_URL = (process.env.APP_URL || '').replace(/\/+$/, '');
const BUILD = 'big-house-2026-11';
const MAX_PLAYERS = 5000;
const EPS = 1e-9;

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '8kb' }));

/* ------------------------------------------------------------------ state */

function newRound(number) {
  return { number, status: 'waiting', players: new Map(), result: null };
}

let round = newRound(1);
let history = []; // one summary per revealed round
let latest = null; // full public result of the most recent revealed round
let recent = []; // newest arrivals, for the join slide's ticker
let arrivals = 0;

/* ------------------------------------------------------------ cleaning up */

const BAD_WORDS = /(f+u+c+k|sh[i1]t|c+u+n+t|n[i1]gg|f[a@]gg|b[i1]tch|wh[o0]re|slut|rap(e|ist)|nazi|hitler|a+ss+h[o0]le|porn)/i;

function cleanText(value, max) {
  const s = String(value == null ? '' : value)
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return BAD_WORDS.test(s) ? '' : s;
}

function cleanPid(value) {
  const s = String(value || '');
  return /^[A-Za-z0-9_-]{8,64}$/.test(s) ? s : null;
}

// Accepts 33, "33", "33.3" or "33,3"; keeps two decimals; null if out of range.
function parseGuess(value) {
  const raw = String(value == null ? '' : value).trim().replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

/* --------------------------------------------------------------- scoring */

function computeResult(players) {
  const list = [...players.values()];
  const n = list.length;
  if (n === 0) {
    return { n: 0, avg: null, target: null, median: null, zeros: 0, guesses: [], winners: [], winningGuesses: [], ranks: new Map() };
  }
  const avg = list.reduce((s, p) => s + p.guess, 0) / n;
  const target = (2 / 3) * avg;
  const dist = (p) => Math.abs(p.guess - target);
  const sorted = list.slice().sort((a, b) => dist(a) - dist(b) || a.at - b.at);
  const best = dist(sorted[0]);
  const winners = sorted.filter((p) => dist(p) - best <= EPS);

  // Ties share a rank, so every winner is #1.
  const ranks = new Map();
  let rank = 1;
  let prev = null;
  sorted.forEach((p, i) => {
    const d = dist(p);
    if (prev !== null && d - prev > EPS) rank = i + 1;
    prev = d;
    ranks.set(p.pid, rank);
  });

  const guesses = list.map((p) => p.guess).sort((a, b) => a - b);
  const median = n % 2 ? guesses[(n - 1) / 2] : (guesses[n / 2 - 1] + guesses[n / 2]) / 2;
  return {
    n,
    avg,
    target,
    median,
    zeros: guesses.filter((g) => g < 1).length,
    guesses,
    winners: winners.map(publicPlayer),
    winningGuesses: [...new Set(winners.map((w) => w.guess))].sort((a, b) => a - b),
    ranks,
  };
}

function publicPlayer(p) {
  return { name: p.name, school: p.school, guess: p.guess, bot: !!p.bot };
}

function publicResult(r, number) {
  return {
    round: number,
    n: r.n,
    avg: r.avg,
    target: r.target,
    median: r.median,
    zeros: r.zeros,
    guesses: r.guesses,
    winningGuesses: r.winningGuesses,
    winners: r.winners.slice(0, 12),
    winnersTotal: r.winners.length,
  };
}

/* --------------------------------------------------------------- players */

function addPlayer({ pid, name, school, guess, bot }) {
  arrivals += 1;
  const p = {
    pid,
    name: name || `Wolverine #${arrivals}`,
    school: school || '',
    guess,
    bot: !!bot,
    at: Date.now(),
  };
  round.players.set(pid, p);
  recent.unshift({ id: arrivals, name: p.name, school: p.school, bot: p.bot });
  recent = recent.slice(0, 8);
  return p;
}

const BOT_NAMES = [
  'Ann Arbot', 'Bot Schembechler', 'Fielding H. Bot', 'Robo-Wolverine', 'The Maize-imizer',
  'HAIL-9000', 'The Diag-onalizer', 'Big House Bot', 'Keynes-o-Tron', 'Nash Bot',
  'Level-K Kid', 'Bayesian Buckeye', 'Sparty-Bot', 'Go Blue Screen', 'Victor Valiant',
  'Botsy Blue', 'The Optimist-Bot', 'Rational Ricky', 'Two-Thirds Terry', 'Overthinker 3000',
];

function normal(mean, sd) {
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// A rough mix of the level-k types that show up in real classrooms.
function botGuess() {
  const r = Math.random();
  const g =
    r < 0.10 ? Math.random() * 100 : // level 0: anything goes
    r < 0.18 ? normal(50, 7) : //        level 0: "about half"
    r < 0.42 ? normal(33.3, 2.5) : //    level 1
    r < 0.63 ? normal(22.2, 2) : //      level 2
    r < 0.74 ? normal(14.8, 1.5) : //    level 3
    r < 0.81 ? normal(9.9, 1.5) : //     level 4
    r < 0.92 ? (Math.random() < 0.7 ? 0 : 1) : // Nash, or nearly
    66.7 + Math.random() * 33.3; //      didn't read the rules
  const v = Math.min(100, Math.max(0, g));
  return Math.random() < 0.8 ? Math.round(v) : Math.round(v * 10) / 10;
}

let botSerial = 0;
function addBots(n) {
  const thisRound = round;
  const spread = Math.min(3000, 60 * n); // trickle in, so the counter climbs
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      if (round !== thisRound || round.status === 'revealed' || round.players.size >= MAX_PLAYERS) return;
      botSerial += 1;
      const base = BOT_NAMES[(botSerial - 1) % BOT_NAMES.length];
      const lap = Math.floor((botSerial - 1) / BOT_NAMES.length);
      addPlayer({
        pid: 'bot-' + crypto.randomBytes(6).toString('hex'),
        name: lap ? `${base} ${lap + 1}` : base,
        school: 'Robot U.',
        guess: botGuess(),
        bot: true,
      });
    }, Math.round((i / n) * spread));
  }
}

/* ------------------------------------------------------------ responses */

function baseUrl(req) {
  return APP_URL || `${req.protocol}://${req.get('host')}`;
}

function deckState(req, isTeacher) {
  const base = baseUrl(req);
  return {
    build: BUILD,
    round: round.number,
    status: round.status,
    count: round.players.size,
    recent,
    history,
    latest,
    isTeacher,
    join: { url: base + '/play', short: base.replace(/^https?:\/\//, '') },
  };
}

function isTeacherReq(req) {
  const given = Buffer.from(String(req.get('x-teacher-key') || ''));
  const want = Buffer.from(TEACHER_KEY);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/* ----------------------------------------------------------------- API */

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, build: BUILD }));

// Phones: the round's status, your own guess, and (after the reveal) how you did.
app.get('/api/state', (req, res) => {
  const pid = cleanPid(req.query.pid);
  const p = pid ? round.players.get(pid) : null;
  const out = {
    round: round.number,
    status: round.status,
    count: round.players.size,
    me: p ? { guess: p.guess, name: p.name, school: p.school } : null,
    result: null,
  };
  if (round.status === 'revealed' && round.result) {
    const r = round.result;
    out.result = {
      n: r.n,
      avg: r.avg,
      target: r.target,
      winningGuesses: r.winningGuesses,
      winners: r.winners.slice(0, 5).map((w) => w.name),
      winnersTotal: r.winners.length,
      you: p
        ? { guess: p.guess, distance: Math.abs(p.guess - r.target), rank: r.ranks.get(pid), won: r.ranks.get(pid) === 1 }
        : null,
    };
  }
  res.json(out);
});

app.post('/api/guess', (req, res) => {
  const b = req.body || {};
  const pid = cleanPid(b.pid);
  if (!pid) return res.status(400).json({ error: 'Your phone lost its player ID. Reload the page and try again.' });
  if (round.status !== 'open') {
    const error = round.status === 'waiting' ? "Guessing isn't open yet. Hang tight." : 'Too late! Guessing just closed.';
    return res.status(409).json({ error, status: round.status });
  }
  const guess = parseGuess(b.guess);
  if (guess === null) return res.status(400).json({ error: 'Pick a number from 0 to 100.' });

  const name = cleanText(b.name, 24);
  const school = cleanText(b.school, 32);
  let p = round.players.get(pid);
  if (!p) {
    if (round.players.size >= MAX_PLAYERS) return res.status(503).json({ error: 'The stadium is full. Seriously.' });
    p = addPlayer({ pid, name, school, guess });
  } else {
    p.guess = guess;
    if (name) p.name = name;
    p.school = school;
    p.at = Date.now();
  }
  res.json({ ok: true, me: { guess: p.guess, name: p.name, school: p.school }, count: round.players.size });
});

// Projector: anyone may watch; nothing about guesses leaks before the reveal.
app.get('/api/deck', (req, res) => res.json(deckState(req, isTeacherReq(req))));

const ACTIONS = {
  check() {},
  open() {
    if (round.status === 'revealed') throw httpError(409, 'This round is over. Start a new round first.');
    round.status = 'open';
  },
  close() {
    if (round.status === 'open') round.status = 'closed';
  },
  reveal() {
    if (round.status === 'revealed') return;
    round.status = 'revealed';
    round.result = computeResult(round.players);
    latest = publicResult(round.result, round.number);
    const r = round.result;
    history = history
      .filter((h) => h.round !== round.number)
      .concat({ round: round.number, n: r.n, avg: r.avg, target: r.target, winningGuesses: r.winningGuesses });
  },
  newround(body) {
    round = newRound(round.number + 1);
    recent = [];
    if (body && body.open) round.status = 'open';
  },
  reset() {
    round = newRound(1);
    history = [];
    latest = null;
    recent = [];
    arrivals = 0;
    botSerial = 0;
  },
  bots(body) {
    if (round.status === 'revealed') throw httpError(409, 'Robots only play before the reveal.');
    const n = Math.max(1, Math.min(300, parseInt(body && body.n, 10) || 25));
    addBots(n);
  },
};

app.post('/api/admin/:action', (req, res) => {
  if (!isTeacherReq(req)) return res.status(401).json({ error: 'That teacher key is not right.' });
  const fn = ACTIONS[req.params.action];
  if (!fn) return res.status(404).json({ error: 'Unknown action.' });
  try {
    fn(req.body || {});
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
  res.json(deckState(req, true));
});

/* ------------------------------------------------------------------- QR */

const qrCache = new Map();
app.get('/qr.svg', async (req, res, next) => {
  try {
    const url = baseUrl(req) + '/play';
    if (!qrCache.has(url)) {
      qrCache.set(url, await QRCode.toString(url, {
        type: 'svg',
        errorCorrectionLevel: 'H', // room for the Block M in the middle
        margin: 1,
        color: { dark: '#00274C', light: '#FFFFFF' },
      }));
    }
    res.type('image/svg+xml').set('Cache-Control', 'no-cache').send(qrCache.get(url));
  } catch (e) {
    next(e);
  }
});

/* ---------------------------------------------------------------- pages */

const PUBLIC = path.join(__dirname, 'public');
const page = (file) => (req, res) => res.sendFile(path.join(PUBLIC, file));

app.get('/', page('play.html'));
app.get('/play', page('play.html'));
app.get('/teacher', page('teacher.html'));
app.use(express.static(PUBLIC, { index: false }));

app.use((req, res) => {
  res.status(404).type('html').send(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Fumble</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#00274C;color:#fff;font:600 20px system-ui;text-align:center">' +
    '<div><div style="font-size:64px">🏈</div><h1 style="color:#FFCB05;margin:.2em 0">Fumble.</h1>' +
    '<p>That page doesn\'t exist.</p><p><a style="color:#FFCB05" href="/play">Play the game</a></p></div>'
  );
});

module.exports = app;
