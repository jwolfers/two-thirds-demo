// The Two-Thirds Game: a Keynesian beauty contest, Michigan-visits-Western edition.
// Mounted by ../server.js at the site root.
//   Teacher deck: /teacher?key=TEACHER_KEY   (projector; the key unlocks the controls)
//   Students:     /play                      (phones, via the QR code)

const express = require('express');
const path = require('path');
const QRCode = require('qrcode');

const router = express.Router();
const TEACHER_KEY = process.env.TEACHER_KEY || 'bronco-blue';
const MAX_ENTRIES = 5000;

router.use(express.json({ limit: '10kb' }));
router.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ---------------------------------------------------------------------------
// State: one room, one game at a time, held in memory.
// phase: lobby -> open -> closed -> revealed
// ---------------------------------------------------------------------------
const game = {
  round: 1,
  phase: 'lobby',
  entries: new Map(), // cid -> { name, guess, bot }
  results: null,      // computed when the teacher reveals
  history: []         // one summary per finished round
};

// Level-k benchmarks: level 0 guesses 50 on average, each level best-responds to the one below.
const LEVELS = [0, 1, 2, 3, 4, 5].map(k => ({ k, value: 50 * Math.pow(2 / 3, k) }));

const r2 = x => Math.round(x * 100) / 100;

function levelOf(guess) {
  if (guess > 50 + 1e-9) return 'over';   // only a level-0 coin flip or a troll goes here
  if (guess < 0.5) return 'nash';
  // nearest benchmark
  let best = LEVELS[0];
  for (const L of LEVELS) if (Math.abs(guess - L.value) < Math.abs(guess - best.value)) best = L;
  return 'L' + best.k;
}

function computeResults() {
  const list = [...game.entries.entries()].map(([cid, e]) => ({ cid, ...e }));
  const n = list.length;
  if (!n) return { n: 0 };

  const values = list.map(e => e.guess).sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const median = n % 2 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2;
  const target = (2 / 3) * mean;

  const ranked = list
    .map(e => ({ ...e, dist: Math.abs(e.guess - target) }))
    .sort((a, b) => a.dist - b.dist);
  const ranks = {};
  let rank = 1;
  ranked.forEach((e, i) => {
    if (i > 0 && e.dist - ranked[i - 1].dist > 1e-9) rank = i + 1;
    ranks[e.cid] = rank;
  });
  const winners = ranked
    .filter(e => e.dist - ranked[0].dist <= 1e-9)
    .map(e => ({ name: e.name, guess: e.guess }));

  // 20 bins of width 5; 100 goes in the last bin.
  const bins = new Array(20).fill(0);
  values.forEach(v => { bins[Math.min(19, Math.floor(v / 5))]++; });

  const levels = { over: 0, L0: 0, L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, nash: 0 };
  values.forEach(v => { levels[levelOf(v)]++; });

  return {
    n,
    mean: r2(mean),
    median: r2(median),
    target: r2(target),
    min: values[0],
    max: values[n - 1],
    winners,
    bins,
    levels,
    ranks,
    zeros: values.filter(v => v === 0).length,
    hundreds: values.filter(v => v === 100).length
  };
}

function publicState(cid) {
  const me = cid && game.entries.get(cid);
  const out = {
    round: game.round,
    phase: game.phase,
    count: game.entries.size,
    me: me ? { name: me.name, guess: me.guess } : null,
    history: game.history,
    levels: LEVELS.map(L => ({ k: L.k, value: r2(L.value) }))
  };
  if (game.phase === 'revealed' && game.results) {
    const { ranks, ...rest } = game.results;
    out.results = rest;
    if (me) out.me.rank = ranks[cid];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Student API
// ---------------------------------------------------------------------------
router.get('/api/state', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(publicState(String(req.query.cid || '')));
});

router.post('/api/guess', (req, res) => {
  const { cid, name, guess } = req.body || {};
  if (game.phase !== 'open') {
    return res.status(409).json({ error: 'The game is closed. The professor has spoken.' });
  }
  if (typeof cid !== 'string' || cid.length < 8 || cid.length > 64) {
    return res.status(400).json({ error: 'Your phone forgot who it is. Reload the page?' });
  }
  const g = Number(guess);
  if (!Number.isFinite(g) || g < 0 || g > 100) {
    return res.status(400).json({ error: 'Pick a number from 0 to 100. Those are the rules, Hoss.' });
  }
  if (!game.entries.has(cid) && game.entries.size >= MAX_ENTRIES) {
    return res.status(429).json({ error: 'The room is full. Impressive turnout!' });
  }
  const cleanName = String(name || '').replace(/[<>]/g, '').trim().slice(0, 24) || 'Anonymous';
  game.entries.set(cid, { name: cleanName, guess: Math.round(g * 100) / 100, bot: false });
  res.json(publicState(cid));
});

// ---------------------------------------------------------------------------
// Teacher API (needs the key)
// ---------------------------------------------------------------------------
function requireKey(req, res, next) {
  if (req.get('x-teacher-key') !== TEACHER_KEY) {
    return res.status(403).json({ error: 'Wrong teacher key.' });
  }
  next();
}

router.get('/api/teacher/check', requireKey, (req, res) => res.json({ ok: true }));

const BOT_NAMES = ['RoboBronco', 'Wolverine 3000', 'HAL 9000', 'Level-k Larry', 'Nash Bot',
  'Coin Flipper', 'Rational Rita', 'Overthinking Otto', 'Keynes-o-tron', 'Bayesian Bob'];

function botGuess() {
  // A rough mix of the levels people actually play, plus some noise and a few trolls.
  const u = Math.random();
  const noise = () => (Math.random() - 0.5) * 8;
  let g;
  if (u < 0.15) g = Math.random() * 100;          // level 0
  else if (u < 0.40) g = 33.3 + noise();          // level 1
  else if (u < 0.70) g = 22.2 + noise();          // level 2
  else if (u < 0.82) g = 14.8 + noise();          // level 3
  else if (u < 0.92) g = Math.random() * 3;       // Nash-ish
  else if (u < 0.96) g = 100;                     // troll
  else g = 9.9 + noise();
  return Math.round(Math.max(0, Math.min(100, g)));
}

router.post('/api/teacher/:action', requireKey, (req, res) => {
  const action = req.params.action;
  switch (action) {
    case 'open':
      if (game.phase === 'revealed') return res.status(409).json({ error: 'Start a new round first.' });
      game.phase = 'open';
      break;
    case 'close':
      if (game.phase === 'open') game.phase = 'closed';
      break;
    case 'reveal':
      if (game.phase === 'open') game.phase = 'closed';
      game.results = computeResults();
      game.phase = 'revealed';
      break;
    case 'newround':
      if (game.results && game.results.n) {
        const { mean, target, n, winners } = game.results;
        game.history.push({ round: game.round, n, mean, target, winning: winners[0].guess });
      }
      game.round += 1;
      game.entries.clear();
      game.results = null;
      game.phase = 'lobby';
      break;
    case 'reset':
      game.round = 1;
      game.entries.clear();
      game.results = null;
      game.history = [];
      game.phase = 'lobby';
      break;
    case 'bots': {
      if (game.phase === 'revealed') return res.status(409).json({ error: 'Start a new round first.' });
      const k = Math.max(1, Math.min(200, Number((req.body || {}).count) || 25));
      for (let i = 0; i < k; i++) {
        const cid = 'bot-' + Math.random().toString(36).slice(2, 12);
        const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + ' #' + Math.floor(Math.random() * 900 + 100);
        game.entries.set(cid, { name, guess: botGuess(), bot: true });
      }
      break;
    }
    default:
      return res.status(404).json({ error: 'Unknown action.' });
  }
  res.json(publicState());
});

// ---------------------------------------------------------------------------
// QR code pointing at the student page
// ---------------------------------------------------------------------------
function playUrl(req) {
  const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  return base.replace(/\/$/, '') + '/play';
}

router.get('/api/config', (req, res) => res.json({ playUrl: playUrl(req) }));

router.get('/api/qr.svg', async (req, res) => {
  try {
    const svg = await QRCode.toString(playUrl(req), {
      type: 'svg', margin: 1, errorCorrectionLevel: 'M',
      color: { dark: '#00274C', light: '#FFFFFF' }
    });
    res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
  } catch (e) {
    res.status(500).send('QR failed');
  }
});

router.get('/', (req, res) => res.redirect('/teacher'));

module.exports = router;
