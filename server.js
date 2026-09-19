/* Wingman Pilot — server.
 *
 * Serves the app and the two ElevenLabs routes. Zero dependencies: Node's own
 * http/fs only, so a deploy needs no `npm install` step.
 *
 *   npm start            -> http://localhost:3000
 *   PORT is honoured      (Railway, Render, Fly and friends all set it)
 *
 * The API key stays here. The browser only ever receives a single-use token.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const eleven = require('./server-route.js');
const SCENARIOS = require('./scenarios.js');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/* ---------------------------------------------------------------- adapters
 * server-route.js targets Express-shaped (req, res). These thin shims let the
 * same handlers run on a bare http server, so the tested code is the shipped
 * code rather than a rewrite.
 */
function shimRes(res) {
  const headers = {};
  return {
    statusCode: 200,
    set(k, v) { headers[String(k).toLowerCase()] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(obj) {
      const body = Buffer.from(JSON.stringify(obj));
      headers['content-type'] = 'application/json; charset=utf-8';
      headers['content-length'] = body.length;
      res.writeHead(this.statusCode, headers);
      res.end(body);
      return this;
    },
    send(data) {
      let body;
      if (data === undefined || data === null) body = Buffer.alloc(0);
      else if (Buffer.isBuffer(data)) body = data;
      else if (data instanceof Uint8Array) body = Buffer.from(data);
      else if (typeof data === 'string') body = Buffer.from(data);
      else body = Buffer.from(JSON.stringify(data));
      if (!headers['content-type']) headers['content-type'] = 'application/octet-stream';
      headers['content-length'] = body.length;
      res.writeHead(this.statusCode, headers);
      res.end(body);
      return this;
    },
  };
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(parse(raw)); } };
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) { req.destroy(); finish(); } // cap at 1MB
    });
    req.on('end', finish);
    req.on('error', finish);
    function parse(s) { try { return s ? JSON.parse(s) : {}; } catch (e) { return {}; } }
  });
}

/* ------------------------------------------------------------------ routes */
const scribeToken = eleven.createScribeTokenHandler();
const speak = eleven.createSpeakHandler();

function sendJson(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
  });
  res.end(body);
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      hasKey: !!eleven.resolveKey({}),
      scenarios: SCENARIOS.length,
    });
    return true;
  }

  if (pathname === '/api/scenarios') {
    sendJson(res, 200, SCENARIOS.map((s) => ({ index: s.index, role: s.role, label: s.label })));
    return true;
  }

  if (pathname === '/api/scribe-token') {
    await scribeToken(req, shimRes(res));
    return true;
  }

  if (pathname === '/api/speak') {
    req.body = await readJsonBody(req);
    await speak(req, shimRes(res));
    return true;
  }

  return false;
}

/* ------------------------------------------------------------------ static */
function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  // Resolve inside ROOT only — a bare path.join would let /../ escape the app.
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'content-length': data.length });
    res.end(data);
  });
}

/* ------------------------------------------------------------------ server */
const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  } catch (e) {
    res.writeHead(400); res.end('bad request'); return;
  }

  try {
    if (pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, pathname);
      if (!handled) sendJson(res, 404, { error: 'no such endpoint' });
      return;
    }
    serveStatic(req, res, pathname);
  } catch (err) {
    console.error('[server]', err && err.message);
    if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
    else res.end();
  }
});

server.listen(PORT, () => {
  const hasKey = !!eleven.resolveKey({});
  console.log(`Wingman Pilot listening on http://localhost:${PORT}`);
  console.log(`  scenarios : ${SCENARIOS.length}`);
  console.log(`  live mic  : ${hasKey ? 'ready (ELEVENLABS_API_KEY set)' : 'needs ELEVENLABS_API_KEY'}`);
});
