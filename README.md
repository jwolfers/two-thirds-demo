# The ⅔ Game: EconEd edition

A live classroom Keynesian beauty contest. Everyone picks a number from 0 to 100 on their phone; whoever is closest to ⅔ of the average wins. Dressed in maize and blue, with results drawn on a football field and a few jokes at the expense of this year's Michigan football team.

## Links

- **Projector deck:** `/teacher?key=go-blue`. The key is remembered in that browser and scrubbed from the address bar, so it never shows on the projector. Without it the deck is view only.
- **Phones:** `/play` (the QR code points here). The bare site root opens the same page.
- **Backup:** the older version still lives at `/demo`.

## The deck

1. Title
2. The rules
3. Join: QR code, live counts, names as people lock in (never their numbers), and big Open / Close / Reveal buttons
4. Results: a histogram on a football field, then the average, then the ⅔ target, then the winner(s) with confetti
5. The math: sum, average, ⅔, closest guess; plus median, range, and how many dominated guesses
6. Level-k thinking: steps through Level 0, 1, 2, 3, 4+, Nash and "dominated", with this room's share at each, then how many steps of reasoning the room's average implies
7. Nash equilibrium: iterated elimination of dominated strategies, pushing the upper bound from 100 to 0, with the room's guesses greying out as they're eliminated
8. So why didn't we all say zero? Common knowledge of rationality, best responses, Keynes; this room against Nagel (1995) and the *Financial Times* contest
9. Run it back: average and target by round, and a button for the next round
10. Steal this game: tips for instructors

**Keys:** → / ← (or a clicker) move, and step through slides 6 and 7. **O** opens guessing, **C** closes it, **R** reveals (on the results slide, replays the animation), **N** new round, **B** adds 25 robot players, **F** full screen, **1–9, 0** jump to a slide. Move the mouse to bring up the dock at the bottom, which has the same controls plus **Reset**.

A new round keeps everyone's nickname, clears the guesses, and sends the robots home.

## Settings

- `TEACHER_KEY`: the teacher key (default `go-blue`).
- `APP_URL`: the public address used in the QR code (set in `render.yaml`).

State lives in memory, so a restart clears it. On Render's free plan the site sleeps when idle: open the deck a few minutes before class. Once it's open, its polling keeps the site awake.

## Run it locally

```
npm install
npm start   # http://localhost:3000/teacher?key=go-blue
```

## Files

- `server.js`: mounts the game at `/` and the backup at `/demo`.
- `game/server.js`: the round, scoring, level-k bands, robots, the phone and deck APIs, and the QR code.
- `game/public/`: `teacher.*` (the deck), `play.*` (the phones), `brand.js` and `brand.css` (the block M, colors, level-k text, jokes, confetti). The block M is a hand-drawn homage, not the official logo file.
