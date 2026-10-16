# The Two-Thirds Game

A classroom Keynesian beauty contest for Econ 101. Students pick 0–100 on their phones; whoever is closest to ⅔ of the average wins.

The working (backup) version lives in `demo/` and is served at `/demo`:

- **Students:** `/demo/` (the QR code on the "Play" slide points here)
- **Teacher deck:** `/demo/teacher?key=YOUR_KEY` (the key is remembered in that browser afterwards)

The teacher key comes from the `TEACHER_KEY` environment variable (default `bronco-blue`). The site root `/` opens the teacher deck (`/demo/teacher`); its QR code sends students to `/demo/`. Without the key the deck is view-only.

State is held in memory, so a server restart clears it. On Render's free plan, open the site a minute before class so it's awake.

## Local

```
npm install
npm start   # http://localhost:3000/demo/
```
