# Who Am I? — a multiplayer party guessing game

Everyone joins a room with a code and gets a secret pop-culture character they
_can't_ see. On your turn you ask the group one yes/no question; everyone else
(who can see your character) answers. Deduce who you are, guess, and race to the
top of the leaderboard. Up to 8 players, plays in the same room or fully remote.

## Tech

- **Server:** Node + Express + Socket.IO (authoritative in-memory game state)
- **Client:** React + Vite, mobile-first
- Single origin in production — the server serves the built client.

## Run it locally

```bash
npm install          # server deps
npm run build        # installs client deps + builds it once (optional for dev)
npm run dev          # runs server (:3001) and client (:5173) together
```

Then open **http://localhost:5173**. To play across phones on the same Wi-Fi,
open `http://<your-computer-ip>:5173` on each device.

For a production-style run (single port):

```bash
npm run build
npm start            # serves everything on http://localhost:3001
```

## Deploy to Render (free)

1. Push this folder to a GitHub repo.
2. On [Render](https://render.com): **New + → Blueprint**, select the repo.
   `render.yaml` sets it up as one free web service.
3. You get a URL like `https://who-am-i.onrender.com`. Share it and play.

Notes on the free tier: the service sleeps after ~15 min idle, so the first
visitor after a quiet spell waits ~30–60s for it to wake. Game state lives in
memory, so a restart clears any in-progress rooms.

## Gameplay rules

- 2–8 players (best with 3+). Host sets the number of rounds (default 3).
- Each round everyone is assigned a random character from `server/characters.js`.
- On your turn: ask one yes/no question → the whole group answers → see the
  tally → optionally type a guess (wrong guesses are free) → turn passes.
- Solve to "finish"; you keep answering others' questions after you're done.
- **Scoring:** finishing sooner scores more (1st place = #players points, and so
  on), plus an efficiency bonus (+3 if solved in ≤3 of your own questions, +1 if
  ≤6). Highest total after all rounds wins.

Edit `server/characters.js` to customize the character pool.
