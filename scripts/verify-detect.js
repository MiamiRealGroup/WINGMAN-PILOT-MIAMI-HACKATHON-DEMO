// End-to-end verification of the streaming detection loop.
// For every scenario: connect to the real SSE stream, replay the client's
// exact logic (accumulate the current client utterance, run Engine.detect per
// chunk), and report the objection that fires plus the generated EN/ES line.
//
// This is the regression check for "the streaming loop must work every time".
// Run the server first, then: node scripts/verify-detect.js
const http = require('http');
const https = require('https');
const { SCENARIOS } = require('../src/data/scenarios.js');
const { detect, generate } = require('../public/engine.js');

const BASE = (process.argv[2] || process.env.BASE || 'http://localhost:5173').trim();
// Pick the transport from the URL so the same harness can check localhost
// or a deployed deployment over HTTPS.
const transport = BASE.startsWith('https') ? https : http;

// One scenario, streamed live, returning the first objection that fires.
function runScenario(index) {
  return new Promise((resolve, reject) => {
    const scenario = SCENARIOS[index];
    let clientTurn = '';
    let fired = null;
    let role = scenario.role;

    const req = transport.get(`${BASE}/api/stream?scenario=${index}`, (res) => {
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

          if (msg.type === 'start') role = msg.role;
          if (msg.type === 'chunk' && msg.speaker === 'client') {
            clientTurn = (clientTurn ? clientTurn + ' ' : '') + msg.text;
            const result = detect(clientTurn, role);
            if (result && !fired) {
              fired = { ...result, line: generate(result.category, 0) };
            }
          }
          if (msg.type === 'done') {
            res.destroy();
            fired ? resolve({ scenario, fired }) : reject(new Error(`${scenario.id}: no objection fired`));
            return;
          }
        }
      });
    });
    req.on('error', reject);
    setTimeout(() => { req.destroy(); reject(new Error(`${scenario.id}: timeout`)); }, 30000);
  });
}

(async () => {
  let failures = 0;
  console.log(`Verifying ${SCENARIOS.length} scenarios against ${BASE}\n`);

  for (let i = 0; i < SCENARIOS.length; i++) {
    try {
      const { scenario, fired } = await runScenario(i);
      const ok = scenario.role === (scenario.role) && fired.confidence >= 72;
      console.log(`✔ ${scenario.id} [${scenario.role}]`);
      console.log(`    category   : ${fired.category}`);
      console.log(`    confidence : ${fired.confidence}%`);
      console.log(`    why        : ${fired.why}`);
      console.log(`    EN         : ${fired.line.en}`);
      console.log(`    ES         : ${fired.line.es}\n`);
      if (!ok) failures++;
    } catch (e) {
      console.error(`✖ ${e.message}\n`);
      failures++;
    }
  }

  console.log(failures === 0 ? `ALL ${SCENARIOS.length} SCENARIOS DETECTED` : `${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})();
