// Regression tests for cross-viewer isolation.
//
// 1. STREAM ISOLATION — two simultaneous viewers, different scenarios, must
//    each receive only their own transcript. Before the fix, simulator.push()
//    broadcast every frame to every connection, so both transcripts interleaved
//    into both browsers.
// 2. PAUSE ISOLATION — one viewer hitting Pause must not freeze the other.
//    Before the fix, `paused` was a single global flag.
//
// Run the server first: node server.js
const http = require('http');
const { SCENARIOS } = require('../src/data/scenarios.js');

const BASE = process.argv[2] || 'http://localhost:5173';
const transport = BASE.startsWith('https') ? require('https') : http;

// Open a stream and hand each frame to `onMsg`. Returns a handle to close it.
function openStream(scenarioIndex, onMsg) {
  const req = transport.get(`${BASE}/api/stream?scenario=${scenarioIndex}`, (res) => {
    res.setEncoding('utf8');
    let buf = '';
    res.on('data', (d) => {
      buf += d;
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (!frame.startsWith('data: ')) continue;
        let msg;
        try { msg = JSON.parse(frame.slice(6)); } catch { continue; }
        onMsg(msg);
      }
    });
  });
  req.on('error', () => {});
  return { close: () => req.destroy() };
}

function post(path, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = transport.request(
      `${BASE}${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let out = '';
        res.on('data', (c) => (out += c));
        res.on('end', () => { try { resolve(JSON.parse(out)); } catch { resolve(out); } });
      }
    );
    req.on('error', reject);
    req.end(body);
  });
}

// Rebuild a scenario's chunk list the way the server does, so text from one
// scenario can be told apart from text from another.
function chunkSet(i) {
  const set = new Set();
  for (const line of SCENARIOS[i].lines) {
    const words = line.text.split(/\s+/);
    for (let w = 0; w < words.length; w += 3) set.add(words.slice(w, w + 3).join(' '));
  }
  return set;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Test 1: streams must not interleave -------------------------------
async function testStreamIsolation() {
  const A = 0; // seller-commission
  const B = 4; // buyer-financing

  const ra = { chunks: [] };
  const rb = { chunks: [] };
  const ha = openStream(A, (m) => { if (m.type === 'chunk') ra.chunks.push(m.text); });
  const hb = openStream(B, (m) => { if (m.type === 'chunk') rb.chunks.push(m.text); });

  await wait(11000);
  ha.close(); hb.close();

  const setA = chunkSet(A);
  const setB = chunkSet(B);
  const aForeign = ra.chunks.filter((c) => !setA.has(c));
  const bForeign = rb.chunks.filter((c) => !setB.has(c));

  console.log(`  viewer A: ${ra.chunks.length} chunks, ${aForeign.length} foreign`);
  console.log(`  viewer B: ${rb.chunks.length} chunks, ${bForeign.length} foreign`);
  if (aForeign.length) console.log(`    leaked into A: ${JSON.stringify(aForeign.slice(0, 4))}`);
  if (bForeign.length) console.log(`    leaked into B: ${JSON.stringify(bForeign.slice(0, 4))}`);

  return !aForeign.length && !bForeign.length && ra.chunks.length > 0 && rb.chunks.length > 0;
}

// ---- Test 2: pausing one viewer must not pause the other ---------------
async function testPauseIsolation() {
  const counts = { a: 0, b: 0 };
  let idA = null;
  let idB = null;

  const ha = openStream(0, (m) => {
    if (m.type === 'start') idA = m.clientId;
    if (m.type === 'chunk') counts.a++;
  });
  const hb = openStream(4, (m) => {
    if (m.type === 'start') idB = m.clientId;
    if (m.type === 'chunk') counts.b++;
  });

  // Let both streams get going and capture their client ids.
  await wait(1500);
  if (!idA || !idB) { ha.close(); hb.close(); console.log('  could not read clientId from start frame'); return false; }
  const distinct = idA !== idB;
  console.log(`  clientIds: A=${idA} B=${idB} (distinct: ${distinct})`);

  // Pause A only.
  const resp = await post('/api/pause', { paused: true, clientId: idA });
  console.log(`  pause response for A: ${JSON.stringify(resp)}`);

  // Measure progress in a window after the pause lands.
  const aBefore = counts.a;
  const bBefore = counts.b;
  await wait(2000);
  const aDuring = counts.a - aBefore;
  const bDuring = counts.b - bBefore;

  ha.close(); hb.close();

  console.log(`  while A paused: A advanced ${aDuring} chunks, B advanced ${bDuring} chunks`);
  // A must be frozen; B must keep streaming.
  return distinct && aDuring === 0 && bDuring > 0;
}

(async () => {
  console.log(`Cross-viewer isolation tests against ${BASE}\n`);

  console.log('TEST 1: stream isolation (two viewers, different scenarios)');
  const t1 = await testStreamIsolation();
  console.log(`  ${t1 ? 'PASS' : 'FAIL'}\n`);

  console.log('TEST 2: pause isolation (one viewer pauses, other keeps going)');
  const t2 = await testPauseIsolation();
  console.log(`  ${t2 ? 'PASS' : 'FAIL'}\n`);

  const ok = t1 && t2;
  console.log(ok ? 'ALL ISOLATION TESTS PASSED' : 'ISOLATION FAILURE(S)');
  process.exit(ok ? 0 : 1);
})();
