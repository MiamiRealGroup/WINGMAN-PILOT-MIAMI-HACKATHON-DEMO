// Confirm a deployed instance is running the cross-viewer isolation fix.
// The fix makes the SSE `start` frame carry a clientId and gives each viewer
// an independent stream. An old build has neither.
const https = require('https');

const HOST = process.argv[2] || 'wingman-pilot-miami-hackathon-demo-production.up.railway.app';
const t0 = Date.now();

function openStream(scenario, onMsg) {
  const req = https.get({ host: HOST, path: `/api/stream?scenario=${scenario}`, headers: { Accept: 'text/event-stream' } }, (res) => {
    res.setEncoding('utf8');
    let buf = '';
    res.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (!frame.startsWith('data: ')) continue;
        let m;
        try { m = JSON.parse(frame.slice(6)); } catch { continue; }
        onMsg(m);
      }
    });
  });
  req.on('error', () => {});
  return { close: () => req.destroy() };
}

const state = { a: { chunks: [], id: null }, b: { chunks: [], id: null } };
const ha = openStream(0, (m) => {
  if (m.type === 'start') state.a.id = m.clientId;
  if (m.type === 'chunk') state.a.chunks.push(m.text);
});
const hb = openStream(4, (m) => {
  if (m.type === 'start') state.b.id = m.clientId;
  if (m.type === 'chunk') state.b.chunks.push(m.text);
});

setTimeout(() => {
  ha.close(); hb.close();

  const { SCENARIOS } = require('../src/data/scenarios.js');
  const chunkSet = (i) => {
    const s = new Set();
    for (const line of SCENARIOS[i].lines) {
      const w = line.text.split(/\s+/);
      for (let k = 0; k < w.length; k += 3) s.add(w.slice(k, k + 3).join(' '));
    }
    return s;
  };
  const setA = chunkSet(0);
  const setB = chunkSet(4);
  const aForeign = state.a.chunks.filter((c) => !setA.has(c));
  const bForeign = state.b.chunks.filter((c) => !setB.has(c));

  console.log(`DEPLOYED HOST: ${HOST}`);
  console.log(`A: id=${state.a.id}  chunks=${state.a.chunks.length}  foreign=${aForeign.length}`);
  console.log(`B: id=${state.b.id}  chunks=${state.b.chunks.length}  foreign=${bForeign.length}`);
  if (aForeign.length) console.log(`  leaked into A: ${JSON.stringify(aForeign.slice(0, 3))}`);
  if (bForeign.length) console.log(`  leaked into B: ${JSON.stringify(bForeign.slice(0, 3))}`);

  const hasFix = state.a.id != null && state.b.id != null;
  const isolated = !aForeign.length && !bForeign.length;
  console.log(`\nfixed build deployed (clientId present): ${hasFix}`);
  console.log(`streams isolated: ${isolated}`);
  console.log(`VERDICT: ${hasFix && isolated ? 'LIVE DEPLOY IS RUNNING THE FIX' : hasFix ? 'FIX DEPLOYED BUT STREAMS NOT ISOLATED' : 'OLD BUILD STILL DEPLOYED — redeploy pending'}`);
  process.exit(hasFix && isolated ? 0 : 1);
}, 15000);
