// Root server.
//   /          students' phone page (also /play)
//   /teacher   the projector deck (?key=TEACHER_KEY to take control)
//   /demo      the older backup version (demo/)
const express = require('express');

const PORT = process.env.PORT || 3000;
const app = express();
app.set('trust proxy', 1);

app.use('/demo', require('./demo/server'));
app.use('/', require('./game/server'));

app.listen(PORT, () => {
  console.log(`The 2/3 Game on http://localhost:${PORT}/teacher  (students: /play, backup: /demo)`);
});
