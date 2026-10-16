// Root server.
//   /        the new two-thirds game (game/): teacher deck at /teacher, students at /play
//   /demo    the older backup version (demo/)
const express = require('express');

const PORT = process.env.PORT || 3000;
const app = express();
app.set('trust proxy', 1);

app.use('/demo', require('./demo/server'));
app.use('/', require('./game/server'));

app.listen(PORT, () => {
  console.log(`Two-thirds game on http://localhost:${PORT}/teacher  (students: /play, backup: /demo)`);
});
