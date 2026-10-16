// Root server. The new game lives in game/ at the site root; the backup version stays at /demo.
const express = require('express');

const PORT = process.env.PORT || 3000;
const app = express();
app.set('trust proxy', 1);

app.use('/demo', require('./demo/server'));
app.use('/', require('./game/server'));

app.listen(PORT, () => {
  console.log(`Two-thirds game on http://localhost:${PORT}/teacher  (students: /play, backup: /demo/)`);
});
