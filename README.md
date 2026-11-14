# The ⅔ Game: Maize & Blue × Spartan Blue

A classroom Keynesian beauty contest. Everyone picks a number from 0 to 100 on their phone; whoever is closest to ⅔ of the average wins. Styled for a University of Michigan × Case Western Reserve crowd, with the results drawn on a 100-yard football field and a few jokes at the expense of this year's Michigan football team.

## Links

- **Projector deck:** `/teacher?key=YOUR_KEY`. The key is remembered in that browser and scrubbed from the address bar, so it never shows on the projector. Without it the deck is view only.
- **Students:** `/play` (the QR code points here). The bare site root opens the same phone page.
- **Backup:** the older version still lives at `/demo`.

## The deck

1. Title
2. The rules
3. Join: QR code, live counts, a school-by-school split, names as people lock in (never their numbers), and big Open / Close / Reveal buttons
4. Results: the guesses stacked on a football field by school, then the average, then the ⅔ target, then the winner(s) with confetti; plus "which school thinks deeper?"
5. Level-k thinking: steps through levels 0, 1, 2, 3, 4+ and ∞, with this room's share at each level and the room's implied depth of reasoning
6. Nash equilibrium: iterated elimination of dominated strategies, pushing the line from 100 back to 0, with a count of how many guesses each step eliminates
7. So why didn't we all say zero? This room (and each school) against the Financial Times, Spektrum and Expansión contests (Bosch-Domènech, Montalvo, Nagel & Satorra, *AER* 2002)
8. Play again: averages by round, and a button for the next round
9. Steal this game

Keys: → / ← (or a clicker) move, and step through slides 5 and 6. **O** opens guessing, **C** closes it, **R** reveals (on the results slide it replays the animation), **N** starts a new round, **B** adds 25 robot players, **F** goes full screen, **1–9** jump to a slide. Move the mouse to bring up the dock at the bottom, which has the same controls plus **Reset**.

A new round keeps everyone's nickname and school, clears the guesses, and sends the robots home.

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
- `game/server.js`: the round, scoring, level-k bands, robots, the phone and deck APIs, and the QR code.
- `game/public/`: `teacher.*` (the deck), `play.*` (the phones), `common.js` and `brand.css` (marks, colors, confetti). The block M and the CWRU shield are hand-drawn homages, not official logo files.
