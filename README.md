# Hail to the Two-Thirds

A live classroom Keynesian beauty contest, in maize and blue. Everyone picks a number from 0 to 100 on their phone; whoever is closest to ⅔ of the average wins. Results are drawn on a 100-yard football field, and the Michigan football team takes a few hits along the way.

## Links

- **Projector deck:** `/teacher?key=go-blue`. The key is remembered in that browser and scrubbed from the address bar. Without it the deck is view only.
- **Phones:** `/play` (the QR code points here). The bare site root opens the same page.
- **Backup:** an older version still lives at `/demo`.

## The deck

1. Title
2. The rules
3. Join: QR code, live counts, names as people lock in (never their numbers), and Open / Whistle / Reveal buttons
4. Results, revealed one click at a time: histogram, average, ⅔ target, winner (with confetti). Phones show each player's result once the winner is up.
5. The math: sum ÷ players = average, × ⅔ = target, closest guess; median, range, dominated guesses, zeros
6. Level-k thinking: a ladder from Level 0 (50) through 33, 22, 15, 10… to Nash, with this room's share at each rung and the level of reasoning the room's average implies
7. Nash equilibrium: iterated elimination of dominated strategies, the room's guesses greying out as the bound falls from 100 to 0
8. Why didn't we all say zero? Common knowledge of rationality, best responses, Keynes; this room against Nagel (1995) and the *FT* contest; play another round
9. Steal this game: ideas for instructors

**Keys:** → / ← (or a clicker) move and step through slides 6 and 7; on the results slide → advances the reveal. **O** open guessing, **C** close it, **R** reveal (replays once final), **N** new round, **B** add 25 robot players, **F** full screen, **1–9** jump to a slide. Move the mouse to bring up the dock, which also has **Reset**.

A new round keeps everyone's nickname, clears the guesses, and sends the robots home. Robots get a little smarter every round.

## Settings

- `TEACHER_KEY`: the teacher key (default `go-blue`).
- `APP_URL`: the public address used in the QR code (set in `render.yaml`).

State lives in memory, so a restart clears it. On Render's free plan the site sleeps when idle: open the deck a few minutes before class.

## Run it locally

```
npm install
npm start   # http://localhost:3000/teacher?key=go-blue
```

## Files

- `server.js`: mounts the game at `/` and the backup at `/demo`.
- `game/server.js`: the round, scoring, level-k bands, robots, the phone and deck APIs, the QR code.
- `game/public/`: `teacher.*` (the deck), `play.*` (the phones), `shared.js` (level-k copy, jokes, confetti), `brand.css`, and `m.svg` (a hand-drawn block M homage, not the official logo file).
