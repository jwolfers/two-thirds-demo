# The Two-Thirds Game

A classroom Keynesian beauty contest for Econ 101. Students pick 0–100 on their phones; whoever is closest to ⅔ of the average wins.

- **Students:** `/` (the QR code on the "Play" slide points here)
- **Teacher deck:** `/teacher?key=YOUR_KEY` (the key is remembered in that browser afterwards)

The teacher key comes from the `TEACHER_KEY` environment variable (default `bronco-blue`). Set your own in Render → Environment.

## Running class

| Slide | What to do |
|---|---|
| Welcome, Rules | Talk. The prize line on Rules is editable: click it and type. |
| Play | Click **Open the game**. Watch the counter. Click **Close the game** when done. |
| Results | Click **Reveal**. The histogram animates in, then the average and ⅔ lines. Phones show each student's rank. |
| Winner | **Open the envelope**. Ties get a **Flip the coin** button. |
| The logic, Level-k, Nash, Theory vs. you | The teaching. All of them use your class's live numbers. |
| Theory vs. you | **Play round 2** resets and reopens; the slide then shows the target falling round to round. |

Keys: ← → (or a clicker) to move, **F** for fullscreen. The ⚙ dock in the bottom-right corner has every control, plus **+500 demo guesses** for rehearsal and **Wipe everything**.

State is held in memory, so a server restart clears it. On Render's free plan, open the site a minute before class so it's awake.

## Local

```
npm install
npm start   # http://localhost:3000
```
