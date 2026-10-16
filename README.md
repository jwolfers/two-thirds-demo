# The Two-Thirds Game

A classroom Keynesian beauty contest for Econ 101. Students pick 0–100 on their phones; whoever is closest to ⅔ of the average wins.

## ⅔ of a Chance (main version, `game/`)

Themed Michigan-visits-Western: maize & blue meets brown & gold.

- **Teacher deck:** `/teacher?key=YOUR_KEY` (also the site root). The key is remembered in that browser and scrubbed from the address bar so it never shows on the projector. Without it the deck is view-only.
- **Students:** `/play` (the QR code on the "Grab your phone" slide points here)

Slides: title → rules → QR join with live counter → results (histogram, average, ⅔ target, winners) → level-k thinking (where the room landed) → Nash equilibrium (step-through elimination) → theory vs. the room → round 2 with history → notes for instructors.

Keyboard: ←/→ (or a clicker) to move, **O** open, **C** close, **R** reveal. The dock's **+25 🤖** button adds robot players for demos.

## Backup version (`demo/`)

The older version is served at `/demo` (students `/demo/`, teacher `/demo/teacher?key=…`).

## Settings

The teacher key comes from the `TEACHER_KEY` environment variable (default `bronco-blue`). `APP_URL` sets the address in the QR code.

State is held in memory, so a server restart clears it. On Render's free plan, open the site a minute before class so it's awake.

## Local

```
npm install
npm start   # http://localhost:3000/teacher
```
