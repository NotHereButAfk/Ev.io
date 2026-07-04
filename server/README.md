# kyx-server

A small always-on WebSocket relay that shares the deathmatch countdown timer
and the roster of real connected players across everyone's browser — so
joining the arena mid-match shows the real elapsed time and real other
players instead of everyone getting a private simulated match.

It does **not** simulate positions, movement, or hit detection — that all
stays client-side exactly as it is today. If this server is unreachable or
never deployed, the game falls back to the existing local-only simulation
automatically; nothing breaks.

## Why this is separate from the main site

The main site (`dist/`) is deployed to Hostinger as static files over FTP —
that hosting can only serve files, it can't keep a Node process running.
This server needs to run continuously somewhere else. Any host that can run
`npm start` and keep the process alive works:

- A VPS (including a Hostinger VPS, if you have one — plain shared hosting
  does not support this)
- Render.com — "Web Service" (the **paid** tier; the free tier sleeps after
  15 minutes of inactivity, which defeats "24/7")
- Railway.app
- Fly.io
- Any small always-on Linux box you already have

## Deploy

1. `cd server && npm install`
2. `npm start` (reads `PORT` from the environment, defaults to 8787)
3. Point your host's process at `server/` as the working directory with
   `npm start` as the run command.
4. Once deployed, you'll have a URL like `wss://your-app.example.com`.

## Wire the client to it

In the repo root, set the build-time env var `VITE_WS_URL` to your server's
`wss://` URL (see `.env.example`). If you deploy via the existing GitHub
Action (`.github/workflows/deploy-hostinger.yml`), add a repo secret named
`VITE_WS_URL` — the workflow already passes it through to the build. Leaving
it unset keeps today's local-only behavior.

## Local testing

```
cd server
npm install
npm start
```

Then in the repo root, create `.env.local` with:

```
VITE_WS_URL=ws://localhost:8787
```

and run the usual dev server (`npx vite --port 5999 --host`). Open two
browser tabs — both should show the same countdown and each other's kills.
