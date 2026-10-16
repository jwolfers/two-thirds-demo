// Root server. Right now the only game is the backup version in demo/, served at /demo.
const express = require('express');

const PORT = process.env.PORT || 3000;
const app = express();
app.set('trust proxy', 1);

app.use('/demo', require('./demo/server'));
// The main address opens the teacher deck; its QR code sends students to /demo/.
app.get('/', (req, res) => res.redirect('/demo/teacher'));

app.listen(PORT, () => {
  console.log(`Two-thirds game on http://localhost:${PORT}/demo/  (teacher: /demo/teacher)`);
});
