# The ⅔ Game (Michigan edition)

A classroom Keynesian beauty contest for Econ 101. Everyone picks a number from 0 to 100 on their phone; whoever is closest to ⅔ of the average wins. Maize and blue throughout, with a few jokes at the expense of this year's Michigan football team.

## Links

- **Projector deck:** `/teacher?key=YOUR_KEY`. The key is remembered in that browser and scrubbed from the address bar, so it never shows on the projector. Without it the deck is view only.
- **Students:** `/play` (the QR code points here). The bare site root opens the same phone page, so the short address on screen works too.
- **Backup:** the older version still lives at `/demo`.

## The deck

1. Title
2. How to play
3. Join: QR code, live count, newest arrivals, open/close button
4. Results: scoreboard, histogram on a football field, average and ⅔ target sliding in, winners announced
5. Level-k thinking: the room's guesses against levels 0, 1, 2, 3, 4+ and ∞, with each level's share of the room (steps through one level per click)
6. Nash equilibrium: iterated elimination of dominated strategies, marching the ball from 100 to 0 (steps through)
7. Theory meets the room: this room's average next to the Financial Times, Spektrum and Expansión newspaper contests (Bosch-Domènech, Montalvo, Nagel and Satorra, *AER* 2002)
8. Play again: averages by round, and a button to start the next round
9. Steal this game: how it's built

Keys: → / ← (or a clicker) move, and also step through slides 5 and 6. **O** opens guessing, **C** closes it, **R** reveals (press again on the results slide to replay the animation), **N** starts a new round, **F** goes full screen, **1–9** jump to a slide. The dock at the bottom appears when you move the mouse. Its **+25 🤖** button adds robot players for a demo, and **Reset** clears every round.

## Settings

- `TEACHER_KEY`: the teacher key (default `bronco-blue`).
- `APP_URL`: the public address used in the QR code (set in `render.yaml`).

State lives in memory, so a restart clears it. On Render's free plan the site sleeps when idle: open the deck a few minutes before class. Once it's open, its polling keeps the site awake.

## Run it locally

```
npm install
npm start   # http://localhost:3000/teacher?key=bronco-blue
```

## Files

- `server.js`: mounts the game at `/` and the backup at `/demo`.
- `game/server.js`: rounds, scoring, the phone and deck APIs, and the QR code.
- `game/public/`: `teacher.*` (the deck), `play.*` (the phones), `common.js` and `brand.css` (shared).
