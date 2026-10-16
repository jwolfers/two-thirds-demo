// The Two-Thirds Game: Michigan at Western edition.
// One in-memory game. Phases: waiting -> open -> closed -> revealed. Then "play again" starts a new round.
const express = require('express');
const path = require('path');
const QRCode = require('qrcode');

const TEACHER_KEY = process.env.TEACHER_KEY || 'bronco-blue';
const router = express.Router();
router.use(express.json({ limit: '10kb' }));

const game = {
  round: 1,
  phase: 'waiting',
  guesses: new Map(), // deviceId -> { guess, name, t }
  history: [],        // finished rounds: { round, n, mean, target, winning }
  openedAt: null,
};

const round2 = (x) => Math.round(x * 100) / 100;
const isTeacher = (req) => (req.get('x-teacher-key') || req.query.key || '') === TEACHER_KEY;

function joinUrl(req) {
  const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/$/, '')}/play`;
}

function results() {
  const all = [...game.guesses.entries()].map(([id, g]) => ({ id, ...g }));
  const n = all.length;
  if (!n) return { n: 0 };
  const values = all.map((g) => g.guess).sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const target = (2 / 3) * mean;
  const median = n % 2 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2;
  let best = Infinity;
  for (const g of all) best = Math.min(best, Math.abs(g.guess - target));
  const winners = all.filter((g) => Math.abs(Math.abs(g.guess - target) - best) < 1e-9);
  // Rank everyone by distance (ties share a rank)
  const dists = all.map((g) => Math.abs(g.guess - target)).sort((a, b) => a - b);
  const rankOf = (d) => dists.findIndex((x) => Math.abs(x - d) < 1e-9) + 1;
  return {
    n, mean: round2(mean), target: round2(target), median: round2(median),
    min: values[0], max: values[n - 1], values,
    winning: winners[0].guess,
    winners: winners.map((w) => ({ name: w.name || 'Anonymous genius', guess: w.guess })),
    over67: values.filter((v) => v > 66.67).length,
    zeros: values.filter((v) => v === 0).length,
    _rank: (id) => {
      const g = game.guesses.get(id);
      return g ? rankOf(Math.abs(g.guess - target)) : null;
    },
  };
}

function publicState(req) {
  const s = { round: game.round, phase: game.phase, count: game.guesses.size, history: game.history, joinUrl: joinUrl(req) };
  const teacher = isTeacher(req);
  s.teacher = teacher;
  // The distribution goes on the projector only once guessing is closed (no anchoring!)
  if (game.phase === 'closed' || game.phase === 'revealed') {
    const r = results();
    delete r._rank;
    if (game.phase !== 'revealed' && !teacher) delete r.winners;
    s.results = r;
  }
  return s;
}

router.get('/api/state', (req, res) => res.json(publicState(req)));

router.get('/api/me', (req, res) => {
  const id = String(req.query.id || '');
  const mine = game.guesses.get(id) || null;
  const out = { round: game.round, phase: game.phase, count: game.guesses.size, mine };
  if (game.phase === 'revealed' && game.guesses.size) {
    const r = results();
    out.result = {
      n: r.n, mean: r.mean, target: r.target, winning: r.winning,
      winners: r.winners, rank: mine ? r._rank(id) : null,
      won: mine ? r.winners.some((w) => w.guess === mine.guess) : false,
    };
  }
  res.json(out);
});

router.post('/api/guess', (req, res) => {
  if (game.phase !== 'open') return res.status(409).json({ error: 'Guessing is not open right now.' });
  const id = String(req.body.id || '').slice(0, 64);
  const guess = Number(req.body.guess);
  const name = String(req.body.name || '').trim().slice(0, 24);
  if (!id) return res.status(400).json({ error: 'Missing device id.' });
  if (!Number.isFinite(guess) || guess < 0 || guess > 100) return res.status(400).json({ error: 'Pick a number from 0 to 100.' });
  game.guesses.set(id, { guess: round2(guess), name, t: Date.now() });
  res.json({ ok: true, mine: game.guesses.get(id), count: game.guesses.size });
});

// ---- Teacher controls ----
function teacherOnly(req, res, next) {
  if (!isTeacher(req)) return res.status(403).json({ error: 'Teacher key required.' });
  next();
}

router.post('/api/open', teacherOnly, (req, res) => {
  if (game.phase === 'revealed') return res.status(409).json({ error: 'Start a new round first.' });
  game.phase = 'open';
  game.openedAt = game.openedAt || Date.now();
  res.json(publicState(req));
});

router.post('/api/close', teacherOnly, (req, res) => {
  if (game.phase === 'open') game.phase = 'closed';
  res.json(publicState(req));
});

router.post('/api/reveal', teacherOnly, (req, res) => {
  if (game.phase !== 'closed') return res.status(409).json({ error: 'Close guessing first.' });
  game.phase = 'revealed';
  const r = results();
  if (r.n) {
    game.history = game.history.filter((h) => h.round !== game.round);
    game.history.push({ round: game.round, n: r.n, mean: r.mean, target: r.target, winning: r.winning });
  }
  res.json(publicState(req));
});

router.post('/api/new-round', teacherOnly, (req, res) => {
  if (game.phase === 'revealed' || game.guesses.size === 0) {
    if (game.guesses.size) game.round += 1;
  } else {
    return res.status(409).json({ error: 'Reveal this round before starting another.' });
  }
  game.guesses.clear();
  game.phase = 'waiting';
  game.openedAt = null;
  res.json(publicState(req));
});

router.post('/api/reset', teacherOnly, (req, res) => {
  game.round = 1;
  game.phase = 'waiting';
  game.guesses.clear();
  game.history = [];
  game.openedAt = null;
  res.json(publicState(req));
});

// Rehearsal helper: fill the room with simulated students who think at different levels.
router.post('/api/simulate', teacherOnly, (req, res) => {
  if (game.phase !== 'open') return res.status(409).json({ error: 'Open guessing first.' });
  const n = Math.min(Number(req.body.n) || 40, 500);
  const levels = [50, 33.33, 22.22, 14.81];
  const fake = ['Bucky', 'Brutus', 'Buster', 'Goldy', 'Sparty', 'Herbie', 'Smokey', 'Aubie'];
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    let g;
    if (u < 0.15) g = Math.random() * 100;                       // level-0: random
    else if (u < 0.8) g = levels[Math.floor(Math.random() * 4)] + (Math.random() - 0.5) * 8;
    else if (u < 0.92) g = Math.random() * 5;                    // Nash-ish
    else g = 100;                                                // trolls
    g = Math.max(0, Math.min(100, Math.round(g)));
    game.guesses.set(`sim-${game.round}-${Date.now()}-${i}`, { guess: g, name: `${fake[i % fake.length]} ${i + 1}`, t: Date.now() });
  }
  res.json(publicState(req));
});

router.get('/api/qr.svg', async (req, res) => {
  const svg = await QRCode.toString(joinUrl(req), { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#00274C', light: '#FFFFFF' } });
  res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
});

const pub = path.join(__dirname, 'public');
router.get('/', (req, res) => res.redirect('/teacher' + (req.query.key ? `?key=${encodeURIComponent(req.query.key)}` : '')));
router.get('/teacher', (req, res) => res.sendFile(path.join(pub, 'teacher.html')));
router.get('/play', (req, res) => res.sendFile(path.join(pub, 'play.html')));
router.use(express.static(pub, { index: false }));

module.exports = router;
