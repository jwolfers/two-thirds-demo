// The Two-Thirds Game — a Keynesian beauty contest for a lecture hall.
// BACKUP VERSION, mounted by ../server.js at /demo.
// Students:  /demo/          (phones, via QR code)
// Teacher:   /demo/teacher   (projector; controls need TEACHER_KEY)

const express = require('express');
const path = require('path');
const QRCode = require('qrcode');

const app = express.Router();
const TEACHER_KEY = process.env.TEACHER_KEY || 'bronco-blue';

app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ---------------------------------------------------------------------------
// In-memory game state (one lecture hall, one game at a time)
// ---------------------------------------------------------------------------
// phase: waiting -> open -> closed -> revealed
const state = {
  round: 1,
  phase: 'waiting',
  entries: new Map(), // clientId -> { name, guess, at }
  history: [],        // summaries of earlier rounds
  pick: null          // tie-break winner chosen by the teacher
};

let cache = null;
function invalidate() { cache = null; }

const round2 = x => Math.round(x * 100) / 100;

// Level-k benchmarks: level 0 averages 50, each level best-responds to the one below.
const LEVELS = [0, 1, 2, 3, 4].map(k => ({ k, value: 50 * Math.pow(2 / 3, k) }));

function computeResults() {
  if (cache) return cache;
  const list = [...state.entries.entries()].map(([cid, e]) => ({ cid, ...e }));
  const n = list.length;
  if (n === 0) {
    cache = { count: 0, round: state.round };
    return cache;
  }
  const values = list.map(e => e.guess).sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const median = n % 2 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2;
  const target = (2 / 3) * mean;

  // Rank everyone by distance to the target (ties share a rank).
  const ranked = list
    .map(e => ({ ...e, dist: Math.abs(e.guess - target) }))
    .sort((a, b) => a.dist - b.dist);
  const ranks = new Map();
  let rank = 1;
  ranked.forEach((e, i) => {
    if (i > 0 && e.dist - ranked[i - 1].dist > 1e-9) rank = i + 1;
    ranks.set(e.cid, rank);
  });
  const best = ranked[0].dist;
  const winners = ranked
    .filter(e => Math.abs(e.dist - best) < 1e-9)
    .map(e => ({ name: e.name, guess: e.guess }));

  // One bin per integer, 0..100.
  const bins = new Array(101).fill(0);
  for (const v of values) bins[Math.min(100, Math.max(0, Math.round(v)))]++;

  // How many people sit near each level-k benchmark (within ±2).
  const levels = LEVELS.map(l => ({
    ...l,
    count: values.filter(v => Math.abs(v - l.value) <= 2).length
  }));
  const zeros = values.filter(v => v <= 1).length;
  const dominated = values.filter(v => v > 200 / 3).length;
  const hundreds = values.filter(v => v >= 100).length;

  cache = {
    round: state.round,
    count: n,
    mean: round2(mean),
    median: round2(median),
    target: round2(target),
    targetExact: target,
    winners,
    bins,
    levels,
    zeros,
    dominated,
    hundreds,
    min: values[0],
    max: values[n - 1],
    ranks
  };
  return cache;
}

function publicSummary() {
  const r = computeResults();
  if (!r.count) return null;
  return {
    count: r.count, mean: r.mean, median: r.median, target: r.target,
    winners: r.winners, pick: state.pick
  };
}

// ---------------------------------------------------------------------------
// Student API
// ---------------------------------------------------------------------------
app.get('/api/state', (req, res) => {
  const cid = String(req.query.cid || '');
  const out = { round: state.round, phase: state.phase, count: state.entries.size };
  const mine = state.entries.get(cid);
  if (mine) out.mine = { name: mine.name, guess: mine.guess };
  if (state.phase === 'revealed') {
    out.summary = publicSummary();
    if (mine) {
      const r = computeResults();
      out.mine.rank = r.ranks.get(cid);
      out.mine.dist = round2(Math.abs(mine.guess - r.targetExact));
    }
  }
  res.set('Cache-Control', 'no-store').json(out);
});

app.post('/api/guess', (req, res) => {
  if (state.phase !== 'open') {
    return res.status(409).json({ error: state.phase === 'waiting'
      ? "The game hasn't opened yet. Patience, grasshopper."
      : 'Pencils down! Submissions are closed.' });
  }
  const cid = String(req.body.cid || '').slice(0, 64);
  const name = String(req.body.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const guess = Number(req.body.guess);
  if (cid.length < 8) return res.status(400).json({ error: 'Something went wrong. Refresh and try again.' });
  if (!name) return res.status(400).json({ error: "We need a name to crown the winner." });
  if (!Number.isFinite(guess) || guess < 0 || guess > 100) {
    return res.status(400).json({ error: 'Pick a number from 0 to 100. (Nice try.)' });
  }
  state.entries.set(cid, { name, guess: round2(guess), at: Date.now() });
  invalidate();
  res.json({ ok: true, round: state.round, guess: round2(guess), count: state.entries.size });
});

// ---------------------------------------------------------------------------
// Teacher API
// ---------------------------------------------------------------------------
function teacherOnly(req, res, next) {
  if (req.get('x-teacher-key') === TEACHER_KEY) return next();
  res.status(401).json({ error: 'Teacher key required' });
}

app.get('/api/teacher/check', teacherOnly, (req, res) => res.json({ ok: true }));

app.get('/api/teacher/results', teacherOnly, (req, res) => {
  const r = computeResults();
  const { ranks, targetExact, ...rest } = r;
  res.set('Cache-Control', 'no-store').json({
    ...rest, phase: state.phase, pick: state.pick, history: state.history
  });
});

app.post('/api/teacher/phase', teacherOnly, (req, res) => {
  const phase = req.body.phase;
  if (!['waiting', 'open', 'closed', 'revealed'].includes(phase)) {
    return res.status(400).json({ error: 'Bad phase' });
  }
  state.phase = phase;
  res.json({ ok: true, phase });
});

app.post('/api/teacher/pick', teacherOnly, (req, res) => {
  const r = computeResults();
  if (!r.count || r.winners.length < 2) return res.json({ pick: null });
  state.pick = r.winners[Math.floor(Math.random() * r.winners.length)];
  res.json({ pick: state.pick });
});

// Start a fresh round. Keeps a summary of the old one so we can show convergence.
app.post('/api/teacher/reset', teacherOnly, (req, res) => {
  const r = computeResults();
  if (r.count && !req.body.discard) {
    state.history.push({ round: state.round, count: r.count, mean: r.mean, target: r.target });
  }
  if (req.body.wipeHistory) state.history = [];
  state.round = req.body.wipeHistory ? 1 : state.round + 1;
  state.entries.clear();
  state.phase = 'waiting';
  state.pick = null;
  invalidate();
  res.json({ ok: true, round: state.round });
});

// Rehearsal helper: fill the room with ~500 plausible fake students.
app.post('/api/teacher/demo', teacherOnly, (req, res) => {
  const n = Math.min(1000, Number(req.body.n) || 500);
  const first = ['Ava', 'Liam', 'Noah', 'Emma', 'Mia', 'Owen', 'Zoe', 'Eli', 'Maya', 'Jack', 'Lena', 'Omar',
    'Priya', 'Sam', 'Grace', 'Leo', 'Nora', 'Ethan', 'Isla', 'Ben', 'Aria', 'Kai', 'Ruby', 'Max', 'Jada',
    'Theo', 'Lucy', 'Dev', 'Hana', 'Cole', 'Ivy', 'Luis', 'Tess', 'Ari', 'June', 'Raj', 'Nina', 'Finn'];
  const gauss = () => Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
  const draw = () => {
    const u = Math.random();
    if (u < 0.10) return Math.random() * 100;
    if (u < 0.22) return 50 + gauss() * 3;
    if (u < 0.45) return 33 + gauss() * 2.5;
    if (u < 0.63) return 22 + gauss() * 2;
    if (u < 0.73) return 15 + gauss() * 1.5;
    if (u < 0.80) return 10 + gauss() * 1.5;
    if (u < 0.88) return Math.random() < 0.7 ? 0 : 1;
    if (u < 0.94) return Math.random() * 12;
    return [66, 67, 69, 77, 100, 42][Math.floor(Math.random() * 6)];
  };
  for (let i = 0; i < n; i++) {
    const g = Math.round(Math.max(0, Math.min(100, draw())));
    const name = `${first[i % first.length]} ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}.`;
    state.entries.set(`demo-${state.round}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      { name, guess: g, at: Date.now() });
  }
  invalidate();
  res.json({ ok: true, count: state.entries.size });
});

// QR code for the student URL (SVG so it stays crisp on a projector).
app.get('/qr.svg', async (req, res) => {
  const url = playUrl(req);
  const svg = await QRCode.toString(url, {
    type: 'svg', margin: 1, errorCorrectionLevel: 'M',
    color: { dark: '#00274C', light: '#FFFFFF' }
  });
  res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
});

app.get('/api/info', (req, res) => res.json({ playUrl: playUrl(req) }));

function playUrl(req) {
  return (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '') + '/demo/';
}

app.get('/teacher', (req, res) => res.sendFile(path.join(__dirname, 'public', 'teacher.html')));

module.exports = app;
