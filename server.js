// Root server. Right now the only game is the backup version in demo/, served at /demo.
const express = require('express');

const PORT = process.env.PORT || 3000;
const app = express();
app.set('trust proxy', 1);

app.use('/demo', require('./demo/server'));
app.get('/', (req, res) => res.redirect('/demo/'));

app.listen(PORT, () => {
  console.log(`Two-thirds game on http://localhost:${PORT}/demo/  (teacher: /demo/teacher)`);
});
