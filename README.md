# Wingman Pilot

Real-time objection coach for realtors. It listens to a live real-estate
conversation, and the moment the buyer or seller raises an objection or
hesitation, it shows the detected category, a confidence score, why it
matched, and the exact next line the realtor should say — in English and
Spanish — with Accept / Skip / Regenerate actions.

**Tonight's build:** there is no live audio yet, so the app simulates a live
transcript feed by streaming sample conversations phrase-by-phrase at natural
speaking pace. That simulation is the single swap point for tomorrow's real
microphone.

## Run

```bash
node server.js
```

Then open **http://localhost:5173**.

Zero dependencies — no `npm install` needed. (The repo-level `server.js` in
the parent folder is an unrelated Twilio dialer; this app lives in its own
folder and does not touch it.)

## How the pieces fit

```
public/app.js  ── consumes the stream, runs detection, renders UI
public/engine.js ── detection (detect) + generation (generate)
server.js      ── SSE transport + the simulated transcript feed
src/data/scenarios.js ── sample conversations (buyer + seller)
```

### The stream interface (the important part)

The client consumes the transcript through a single `source.onmessage`
handler. Today `source` is a `EventSource` over `/api/stream`; tomorrow it can
be a WebSocket or WebRTC audio pipeline that emits the same
`{ speaker, text }` messages. Nothing downstream of that handler changes.

Server side, `simulator.run()` is the only thing that knows it's simulated.
Replacing it with a live-ASR feed is a drop-in change to one file.

### Detection

`engine.js#detect(clientText, side)` runs pattern rules per side (seller vs
buyer) over the client's current utterance, returning the strongest match:
category, label, confidence, and a "why" string. Rule-based and deterministic
on purpose — the streaming loop has to work reliably every run. The interface
is narrow, so a real model can replace the rules later without touching the UI.

### Generation

`engine.js#generate(category, angle)` returns short EN + ES coaching lines with
three variants each. Regenerate cycles the angle. Rule/template based now,
same swap point as detection.

## Coverage

- **Seller:** commission pushback, already have an agent, just testing the
  market, price/timing hesitation.
- **Buyer:** financing concerns, inspection worries, wants to see more first,
  price too high.

## Test

```bash
npm test          # engine unit tests (detection + generation)
npm run verify    # live-stream detection check + UI interaction harness
```

- `npm run verify:detect` — connects to the real SSE stream and confirms every
  scenario's objection fires with the right category, confidence and EN/ES line.
- `npm run verify:ui` — loads the real `public/app.js` against a DOM stub and
  drives the Accept / Skip / Regenerate / Pause handlers.

Start the server first; `verify:detect` needs it running on port 5173.
