# Wingman Pilot — integrated, with live microphone support

The real Wingman Pilot app (pulled from the deployed build) with the ElevenLabs audio
bridge wired in. One app, two input sources, chosen from a dropdown:

| Source | What it does | Needs |
|---|---|---|
| **Simulated feed** | Streams one of 8 scripted conversations, phrase by phrase, at speaking pace | Nothing. Works offline. |
| **Live microphone** | Streams your actual voice, transcribed by ElevenLabs Scribe Realtime v2 | An API key on the server |

Detection, EN/ES generation, Accept/Skip/Regenerate and the interaction log are the app's
original code, untouched. Only the input source changed.

```
                 ┌──────────────┐
  mic ──────────►│  LiveSource  │──┐
                 └──────────────┘  │   {type:'start'|'chunk'|'turn-end'|'done'}
                 ┌──────────────┐  ├──► app.js ──► Engine.detect() ──► EN/ES line
  scripts ──────►│  SimSource   │──┘      (unchanged)
                 └──────────────┘
```

Both sources emit the identical message protocol, so `app.js` cannot tell them apart.
That is the seam that makes tomorrow's audio work a config change rather than a rewrite.

## Run it

**Double-click `RUN-APP.bat`.** A browser opens with the app. Keep the black window open
while you use it; close it to stop.

**Check it works:** double-click `CHECK-MY-WORK.bat`. A green `ALL 64 CHECKS PASS` banner
means the whole pipeline is verified.

Nothing to install — the launcher uses PowerShell's built-in web server.

## Files

| File | Purpose |
|---|---|
| `index.html`, `styles.css` | The app's UI (from the deployed build), plus a source/side dropdown and a voice toggle |
| `app.js` | App logic. Now source-agnostic; consumes either input through one `onmessage`. |
| `engine.js` | Detection + EN/ES generation. Unchanged from the deployed build. |
| `sim-source.js` | Simulated feed. Streams phrases at speaking pace. |
| `live-source.js` | Live microphone → ElevenLabs Scribe Realtime v2. |
| `speak.js` | Optional: reads the coaching line aloud (ElevenLabs TTS). |
| `server-route.js` | Server handlers for `/api/scribe-token` and `/api/speak`. |
| `scenarios.js` | The 8 sample conversations (4 seller, 4 buyer). |
| `server.js`, `package.json` | Zero-dependency Node server — this is what gets deployed |
| `Dockerfile`, `railway.json` | Deploy config for Railway / any Docker host |
| `DEPLOY.md` | How to put this live |
| `integration-test.html` | 71-check suite that drives the real `app.js` |
| `syntax-check.html` | 21 checks — parses every file (for when Node isn't installed) |
| `serve.ps1`, `RUN-APP.bat`, `CHECK-MY-WORK.bat` | Local server and launchers |

## Turn on the live microphone

The simulator works with no setup. The microphone needs a key.

**1.** Get an API key from ElevenLabs.

**2.** Copy `.env.example` to `.env` in this folder and paste your key in:

```
ELEVENLABS_API_KEY=sk_your_key_here
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM     # optional, for the voice toggle
```

**3.** Run the app: `RUN-APP.bat` (Windows, no installs) or `npm start` (Node). Both
serve the app *and* the two ElevenLabs routes, so the key stays on the server and the
browser only ever receives a 15-minute single-use token.

**4.** Pick **Live microphone** in the dropdown.

If the key is missing, the app says so in the status line and keeps working on the
simulated feed — it does not hang or go blank.

## What's verified

**71 checks pass**, driving the real `app.js` in a browser (see `integration-result.txt`):

- Both sources emit one protocol — `start` / `chunk` / `turn-end` / `done`
- Detection fires from the stream: correct category, confidence, and a "why" quoting the
  words actually heard
- **Accept** logs it as accepted, with category, the line used, and a timestamp
- **Skip** logs it as skipped and keeps listening
- **Regenerate** cycles exactly 3 distinct angles and wraps back to the first
- **Pause** freezes the transcript; **Resume** continues it
- Buyer-side selections use the buyer rule set, and an explicit side choice survives
- The live source never puts the API key in the socket URL, tags audio frames with
  `message_type` (not `type`) and a required `commit` flag, and ignores malformed frames
- **Live mic with no key fails gracefully** — it reports the reason, emits `done` so the
  UI is never stuck, and opens no socket

Plus **21 checks** that every file parses and `package.json` is deployable, and **87
checks** on the bridge's own suite (`../wingman-elevenlabs/`).

**Three real bugs this testing caught:**

1. The deployed `app.js` uses `source.onmessage = fn`, but the first bridge only
   implemented `addEventListener`. The swap would have silently received nothing.
2. The bridge emitted `{speaker, text}` while `app.js` switches on `msg.type`. Same
   failure mode, caught the same way.
3. A missing API key surfaced as an empty error, because an `Error` object serializes to
   `{}`. The user would have seen nothing explaining why the mic was dead.

**Not yet proven — be clear-eyed:**

- **Never run against a real microphone or a real API key.** The suite mocks both. It
  proves the plumbing, not the audio. The first live run is still the real test.
- One loose end in the wire format is unconfirmed against the live API: the audio chunk
  field. ElevenLabs' event reference says `audio_base_64`; if frames are rejected, that is
  the one string to change.
- The deploy itself has not been run — no git, npm or hosting credentials on this machine.
  See `DEPLOY.md`.

## Known limitations

**Speaker attribution.** One microphone hears the realtor *and* the client, so everything
is tagged `client`. Detection watches client objections and realtor speech mostly won't
match, but a realtor line like "some clients worry about the commission" could false-fire.
Proper fixes: two mics, diarization on the committed transcript, or source separation.

**Partial retriggering.** `partial_transcript` streams a sentence in growing pieces.
`LiveSource` emits `turn-end` on `committed_transcript`, which resets detection between
utterances — that is what keeps one objection from raising repeated cards.
