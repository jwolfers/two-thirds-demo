const express = require('express');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Render's reverse proxy for correct protocol detection
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- In-memory game state ---
const gameState = {
  guesses: [],   // { name: string, guess: number }
  gameOpen: true
};

// --- Compute results ---
function computeResults() {
  if (gameState.guesses.length === 0) {
    return null;
  }

  const values = gameState.guesses.map(g => g.guess);
  const average = values.reduce((sum, v) => sum + v, 0) / values.length;
  const target = (2 / 3) * average;

  // Find winners (closest to target)
  const EPSILON = 1e-9;
  let minDist = Infinity;
  let winners = [];

  for (const entry of gameState.guesses) {
    const dist = Math.abs(entry.guess - target);
    if (dist < minDist - EPSILON) {
      minDist = dist;
      winners = [entry];
    } else if (Math.abs(dist - minDist) < EPSILON) {
      winners.push(entry);
    }
  }

  // Build histogram bins (0-5, 5-10, ..., 95-100)
  const bins = new Array(20).fill(0);
  const binLabels = [];
  for (let i = 0; i < 20; i++) {
    binLabels.push(`${i * 5}-${(i + 1) * 5}`);
  }
  for (const v of values) {
    let idx = Math.floor(v / 5);
    if (idx >= 20) idx = 19;
    bins[idx]++;
  }

  return {
    count: gameState.guesses.length,
    average: Math.round(average * 100) / 100,
    target: Math.round(target * 100) / 100,
    winners,
    isTie: winners.length > 1,
    bins,
    binLabels,
    guesses: gameState.guesses
  };
}

// =====================
//  PAGE ROUTES
// =====================

// Instructor lobby
app.get('/', async (req, res) => {
  const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const playUrl = `${baseUrl}/play`;

  const qrDataUrl = await QRCode.toDataURL(playUrl, {
    width: 400,
    margin: 2,
    color: { dark: '#00274C', light: '#ffffff' }
  });

  res.render('instructor', {
    qrDataUrl,
    playUrl,
    count: gameState.guesses.length,
    gameOpen: gameState.gameOpen
  });
});

// Student entry form
app.get('/play', (req, res) => {
  if (!gameState.gameOpen) {
    return res.redirect('/closed');
  }
  res.render('play', { error: null });
});

// Submit guess
app.post('/play', (req, res) => {
  if (!gameState.gameOpen) {
    return res.redirect('/closed');
  }

  const name = (req.body.name || '').trim();
  const guess = parseFloat(req.body.guess);

  if (!name) {
    return res.render('play', { error: 'Please enter your name.' });
  }
  if (name.length > 100) {
    return res.render('play', { error: 'Name is too long.' });
  }
  if (isNaN(guess) || guess < 0 || guess > 100) {
    return res.render('play', { error: 'Please enter a number between 0 and 100.' });
  }

  gameState.guesses.push({
    name,
    guess: Math.round(guess * 100) / 100
  });

  res.redirect('/play/thanks');
});

// Confirmation
app.get('/play/thanks', (req, res) => {
  res.render('thanks');
});

// Results page
app.get('/results', (req, res) => {
  const results = computeResults();
  res.render('results', { results });
});

// Explain page
app.get('/explain', (req, res) => {
  const results = computeResults();
  res.render('explain', { results });
});

// Closed page
app.get('/closed', (req, res) => {
  res.render('closed');
});

// =====================
//  API ROUTES
// =====================

app.get('/api/status', (req, res) => {
  res.json({
    count: gameState.guesses.length,
    gameOpen: gameState.gameOpen
  });
});

app.get('/api/results', (req, res) => {
  res.json(computeResults());
});

app.post('/api/close', (req, res) => {
  gameState.gameOpen = false;
  res.json({ success: true });
});

app.post('/api/open', (req, res) => {
  gameState.gameOpen = true;
  res.json({ success: true });
});

app.post('/api/reset', (req, res) => {
  gameState.guesses = [];
  gameState.gameOpen = true;
  res.json({ success: true });
});

// =====================
//  START
// =====================
app.listen(PORT, () => {
  console.log(`Two-Thirds Game running on port ${PORT}`);
});
