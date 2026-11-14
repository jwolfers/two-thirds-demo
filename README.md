# Go Blue, Guess Low

The two-thirds-of-the-average game, live in class, in maize and blue. Everyone picks a number from 0 to 100 on their phone; whoever is closest to ⅔ of the average wins. Then the deck uses the room's own guesses to teach level-k thinking and Nash equilibrium, with a few shots at Michigan football along the way.

## Links

- **Projector deck:** `/teacher?key=go-blue` (e.g. https://two-thirds-demo.onrender.com/teacher?key=go-blue). The key is remembered in that browser and scrubbed from the address bar. Without it the deck is view only.
- **Phones:** `/play` (the QR code points here). The bare site root opens the same page.
- **Backup:** an older version still lives at `/demo`.

## The deck

1. Title
2. The rules
3. Join: QR code, live counts, names as people lock in (never their numbers), schools in the room, and Open / Whistle / See results buttons
4. Results, one click at a time: histogram, average, ⅔ target, winner(s) with confetti. Phones show each player's result once the winner is up.
5. How it worked: sum ÷ players = average, × ⅔ = target, winning guess; median, range, dominated guesses, zeros; a round-by-round table after round 2
6. Level-k thinking: a ladder from Level 0 (50) through 33, 22, 15, 10 to Nash, with the room's share at each level and how many steps the room's average implies
7. Nash equilibrium: iterated elimination of dominated strategies, step by step, with the room's guesses greying out
8. Why didn't we all say zero? Common knowledge of rationality, Keynes's beauty contest, and this room against Nagel (1995) and the 1997 *FT* contest; play another round
9. Steal this game: notes for instructors

**Keys:** → / ← (or a clicker) move between slides and step through slides 4 and 7. **O** open guessing, **C** close it, **R** reveal, **N** new round, **B** add 25 robot players, **F** full screen, **1–9** jump to a slide. Move the mouse to bring up the dock, which also has **Reset**.

A new round keeps everyone's nickname, clears the guesses, and sends the robots home.

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
- `game/server.js`: the round, scoring and ties, level-k bands, robots, the phone and deck APIs, the QR code.
- `game/public/`: `teacher.*` (the deck), `play.*` (the phones), `confetti.js`, `brand.css`, and `blockm.svg` (a hand-drawn block M homage, not the official logo file).
