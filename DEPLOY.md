# Deploying Wingman Pilot

The app is ready to deploy. One folder, no build step, no dependencies.

## What to deploy

Everything in `C:\Users\ZIRAK\wingman-integrated\`. That folder **is** the app —
the same files that pass 64 checks locally.

## One environment variable

Set this in your hosting dashboard (Railway → your service → **Variables**):

```
ELEVENLABS_API_KEY = sk_your_key_here
```

Without it the deploy still works — the simulated feed runs fine, and the
microphone button reports that it needs a key. Never put the key in a file that
gets committed.

## Railway (where the current app lives)

**If your Railway project is connected to GitHub:**

1. Upload this folder's contents to that GitHub repo (replacing the old files).
2. Railway redeploys automatically.
3. Add `ELEVENLABS_API_KEY` under Variables.
4. Settings → Networking → **Generate Domain** if you need a public URL.

**If it deploys from the CLI:** install the Railway CLI, run `railway up` in this
folder, then set the variable.

**If neither is available:** Railway's dashboard accepts a Docker image. This
folder already contains a `Dockerfile`, so any Docker host works the same way:

```
docker build -t wingman-pilot .
docker run -p 3000:3000 -e ELEVENLABS_API_KEY=sk_... wingman-pilot
```

## What the deploy needs to know

| Thing | Value |
|---|---|
| Start command | `node server.js` |
| Port | `PORT` (set by the host; defaults to 3000) |
| Health check | `/api/health` |
| Node version | 18 or newer (20 recommended) |
| Build step | **none** — zero dependencies |

`railway.json` and `Dockerfile` already contain all of this, so a host that reads
them needs no manual configuration.

## After it deploys

Open the URL and check:

1. The page loads and the transcript starts streaming (simulated feed).
2. An objection card appears with an EN and an ES line.
3. `/api/health` returns `{"ok":true,"hasKey":true,"scenarios":8}`.
   If `hasKey` is `false`, the variable is missing — the microphone will not work
   until it is set and the service restarts.

## Honest caveat

Everything above is prepared and locally verified (64 checks on the app, 21 on the
server file). The **deploy itself has not been run** — this machine has no git,
no npm, and no Railway credentials, so I cannot push it. The upload step needs
whoever holds the hosting account.

The first genuinely untested thing will be the live microphone: it has only ever
run against a mocked API. Expect the first real-microphone run to need one small
field-name fix (`audio_base_64`), which is flagged in the README.
