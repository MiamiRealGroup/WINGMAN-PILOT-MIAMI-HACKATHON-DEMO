// Wingman Pilot — zero-dependency Node server.
// Serves the static frontend and streams a simulated live transcript over
// Server-Sent Events (SSE). The SSE feed is the "stream interface": swapping
// the simulator for a real live-audio transcription service tomorrow only
// touches this file, never the client.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5173;

// ---------------------------------------------------------------- transcript
// A continuous transcript is just a sequence of { speaker, text } utterances.
// The simulator emits them phrase-by-phrase at natural speaking pace, exactly
// like a live-ASR stream would. feedController replaces this tomorrow.
const { SCENARIOS } = require('./src/data/scenarios.js');

// --------------------------------------------------------------- static app
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(__dirname, 'public', path.normalize(urlPath));
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

// ------------------------------------------------------------------- server
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (req.method === 'GET' && url === '/api/scenarios') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify(SCENARIOS.map((s, i) => ({ index: i, id: s.id, role: s.role, label: s.label })))
    );
    return;
  }
  if (req.method === 'GET' && url === '/api/stream') {
    handleStream(req, res);
    return;
  }
  if (req.method === 'POST' && url === '/api/pause') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const { paused } = JSON.parse(body || '{}');
        simulator.paused = Boolean(paused);
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ paused: simulator.paused }));
      } catch {
        res.writeHead(400).end('Bad request');
      }
    });
    return;
  }
  serveStatic(req, res);
});

// ----------------------------------------------------------------- simulator
// Each client gets its own feed so the demo is deterministic per tab. The
// controller below is the single point that would be replaced by a live
// microphone pipeline — everything upstream of "push an utterance" is opaque
// to the rest of the app.
const simulator = {
  paused: false,
  clients: new Set(),

  push(obj) {
    const frame = `data: ${JSON.stringify(obj)}\n\n`;
    for (const res of this.clients) res.write(frame);
  },

  run(scenarioIndex, res) {
    const scenario = SCENARIOS[scenarioIndex % SCENARIOS.length];
    this.push({ type: 'start', scenarioId: scenario.id, role: scenario.role, label: scenario.label, total: scenario.lines.length });

    // Flatten every line into phrase-sized chunks, then pace the whole feed.
    let chunkIndex = 0;
    const chunks = [];
    for (const line of scenario.lines) {
      for (const chunk of chunkPhrases(line.text)) {
        chunks.push({ speaker: line.speaker, text: chunk });
      }
    }

    const timer = setInterval(() => {
      if (this.paused) return;
      if (chunkIndex >= chunks.length) {
        clearInterval(timer);
        this.push({ type: 'done' });
        return;
      }
      const chunk = chunks[chunkIndex++];
      const last = chunkIndex === chunks.length;
      this.push({ type: 'chunk', speaker: chunk.speaker, text: chunk.text, done: last });
    }, PACE_MS);

    // Stop streaming when the client disconnects.
    res.on('close', () => clearInterval(timer));
  },
};

const PACE_MS = 260; // ~4 phrase chunks per second — natural, readable speech pace.

// Split a line into 2–4 word phrases so text "arrives" incrementally like
// streaming ASR partials, rather than dropping whole lines at once.
function chunkPhrases(text) {
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += 3) {
    chunks.push(words.slice(i, i + 3).join(' '));
  }
  return chunks.length ? chunks : [text];
}

function handleStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(':ok\n\n');
  simulator.clients.add(res);

  // Client may request a specific scenario (?scenario=N); otherwise assign
  // the next scenario in round-robin so the demo cycles through the set.
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = Number(url.searchParams.get('scenario'));
  const scenarioIndex = Number.isInteger(requested) && SCENARIOS[requested]
    ? requested
    : simulator.clients.size - 1;

  simulator.run(scenarioIndex, res);
  req.on('close', () => simulator.clients.delete(res));
}

server.listen(PORT, () => {
  console.log(`Wingman Pilot running at http://localhost:${PORT}`);
});
