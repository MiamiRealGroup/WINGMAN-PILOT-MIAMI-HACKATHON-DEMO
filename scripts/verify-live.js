// Verify SSE streaming through the live Railway deployment.
// Connects, timestamps every frame, and reports whether chunks arrive
// progressively (streaming works) or all at once at the end (proxy buffering).
const https = require('https');

const HOST = process.env.HOST || 'wingman-pilot-miami-hackathon-demo-production.up.railway.app';
const PATH = '/api/stream?scenario=0';

const t0 = Date.now();
const arrivals = [];
let buf = '';
let reported = false;

// SSE keeps the connection open after `done`, so `end` never fires. Evaluate
// as soon as the stream says it is finished, and only ever report once.
function report(reason) {
  if (reported) return;
  reported = true;

  const chunks = arrivals.filter((a) => a.type === 'chunk');
  const firstMs = chunks.length ? chunks[0].ms : null;
  const lastMs = chunks.length ? chunks[chunks.length - 1].ms : null;
  const span = firstMs != null ? lastMs - firstMs : 0;
  const gotDone = arrivals.some((a) => a.type === 'done');

  console.log(`\n=== RESULT (${reason}) ===`);
  console.log(`frames: ${arrivals.length}  (chunks: ${chunks.length})`);
  console.log(`first chunk at: ${firstMs}ms   last chunk at: ${lastMs}ms   span: ${span}ms`);
  console.log(`done event: ${gotDone}`);

  let ok;
  if (!chunks.length) {
    console.log('VERDICT: NO CHUNKS — stream produced nothing.');
    ok = false;
  } else if (span > 3000) {
    console.log('VERDICT: STREAMING WORKS — chunks arrived progressively over time.');
    ok = true;
  } else {
    console.log('VERDICT: BUFFERED — all chunks arrived in a burst, not progressively.');
    ok = false;
  }
  process.exit(ok ? 0 : 1);
}

const req = https.get({ host: HOST, path: PATH, headers: { Accept: 'text/event-stream' } }, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`CONTENT-TYPE: ${res.headers['content-type']}`);
  console.log(`TRANSFER-ENCODING: ${res.headers['transfer-encoding'] || '(none)'}`);
  console.log(`CONTENT-ENCODING: ${res.headers['content-encoding'] || '(none)'}`);
  console.log(`proxy headers: ${JSON.stringify(Object.keys(res.headers).filter((h) => /railway|proxy|cf-|cache|via/i.test(h)))}`);
  console.log('--- frame arrivals (ms since connect) ---');

  res.setEncoding('utf8');
  res.on('data', (d) => {
    buf += d;
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      if (!frame.startsWith('data: ')) continue;
      let msg;
      try { msg = JSON.parse(frame.slice(6)); } catch { continue; }

      const ms = Date.now() - t0;
      arrivals.push({ ms, type: msg.type, text: msg.text });
      if (msg.type === 'start' || msg.type === 'done' || arrivals.length <= 3) {
        console.log(`  +${ms}ms  ${msg.type}${msg.text ? `  "${msg.text}"` : ''}`);
      }
      if (msg.type === 'done') report('done event received');
    }
  });

  res.on('end', () => report('connection closed'));
});

req.on('error', (e) => { console.error('ERROR:', e.message); process.exit(1); });

setTimeout(() => report('timeout — stream never completed'), 30000);
