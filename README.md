# The Two-Thirds Game: Michigan visits Western

A classroom Keynesian beauty contest for Econ 101. Students pick 0–100 on their phones; whoever is closest to ⅔ of the average wins. Themed for a University of Michigan professor visiting Western Michigan University.

- **Teacher deck:** `/teacher?key=YOUR_KEY` (the site root `/` opens it too). The key is remembered in that browser afterwards. Without it the deck is view-only.
- **Students:** `/play` (the QR code on the Join slide points here).
- **Backup (older version):** `/demo/`, untouched.

The teacher key comes from the `TEACHER_KEY` environment variable (default `bronco-blue`).

## The deck

1. Title · 2. Rules · 3. Join (QR, live counter, Open/Close) · 4. Results (histogram, average and ⅔ lines) · 5. Winner (Reveal button, confetti) · 6. Level-k thinking (with this room's shares at each level) · 7. Nash equilibrium (step through iterated elimination) · 8. Theory vs. the room · 9. Play again (round-by-round averages) · 10. Build your own

Keys: ←/→ to move, `F` fullscreen, `S` adds 40 simulated students while guessing is open (for rehearsal).

The distribution stays hidden until guessing closes, so nobody anchors on the projector. Students can change their guess until close, and see their own rank once the winner is revealed.

State is held in memory, so a server restart clears it. On Render's free plan, open the site a minute before class so it's awake.

The M and W lettermarks are original geometric shapes in each school's colors, not the official logos.

## Local

```
npm install
npm start   # http://localhost:3000/teacher
```
