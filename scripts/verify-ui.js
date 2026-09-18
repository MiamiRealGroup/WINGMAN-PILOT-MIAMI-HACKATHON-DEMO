// UI interaction harness — verifies the REAL public/app.js (not a copy) by
// loading it against a minimal DOM stub, feeding it stream messages, and
// invoking the actual click handlers for Accept / Skip / Regenerate / Pause.
//
// This is what proves the interaction log and variant cycling work, since the
// headless browser tools re-navigate on every call and cannot hold the page
// open long enough to click mid-stream. Run: node scripts/verify-ui.js
const assert = require('node:assert');

// ------------------------------------------------------------- DOM stub
function makeEl(id) {
  const classes = new Set();
  return {
    id,
    textContent: '',
    innerHTML: '',
    className: '',
    value: '0',
    scrollTop: 0,
    scrollHeight: 0,
    children: [],
    handlers: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    addEventListener(evt, fn) { (this.handlers[evt] ||= []).push(fn); },
    append(...kids) { this.children.push(...kids); },
    appendChild(k) { this.children.push(k); },
    click() { (this.handlers.click || []).forEach((f) => f()); },
  };
}

const registry = {};
const ids = [
  'transcript', 'scenario', 'pause-btn', 'status-text', 'live-dot', 'scenario-meta',
  'alert-panel', 'idle-state', 'log', 'confidence', 'alert-category', 'alert-why',
  'line-en', 'line-es', 'accept-btn', 'skip-btn', 'regen-btn',
];
for (const id of ids) registry[id] = makeEl(id);
registry['alert-panel'].classList.add('hidden');

globalThis.document = {
  getElementById: (id) => registry[id] || null,
  createElement: () => makeEl('dyn'),
};

// ------------------------------------------------------------- net stubs
const SCENARIOS = require('../src/data/scenarios.js').SCENARIOS;
let pauseCalls = [];
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('/api/pause')) {
    pauseCalls.push(JSON.parse(opts.body));
    return { json: async () => ({ paused: true }) };
  }
  return {
    json: async () => SCENARIOS.map((s, i) => ({ index: i, id: s.id, role: s.role, label: s.label })),
  };
};

class FakeEventSource {
  static last = null;
  constructor(url) { this.url = url; FakeEventSource.last = this; }
  close() { this.closed = true; }
  emit(msg) { this.onmessage({ data: JSON.stringify(msg) }); }
}
globalThis.EventSource = FakeEventSource;

// app.js assigns window.Engine; engine.js exports under Node, so wire it up.
globalThis.window = { Engine: require('../public/engine.js') };

// ------------------------------------------------------------- load app
require('../public/app.js');

const tick = () => new Promise((r) => setImmediate(r));
const el = (id) => registry[id];
const results = [];
function check(name, fn) {
  try { fn(); results.push(['✔', name]); }
  catch (e) { results.push(['✖', `${name} — ${e.message}`]); }
}

(async () => {
  await tick(); await tick(); await tick();

  const src = FakeEventSource.last;
  assert.ok(src, 'app.js did not open a stream');
  check('app.js booted and opened the SSE stream', () => {
    assert.ok(src.url.includes('/api/stream'), `unexpected url: ${src.url}`);
  });
  check('scenario dropdown populated from /api/scenarios', () => {
    assert.ok(el('scenario').innerHTML.includes('Commission pushback'));
  });

  // Stream a seller scenario up to the objection.
  src.emit({ type: 'start', role: 'seller', label: 'Seller · Commission pushback', total: 6 });
  src.emit({ type: 'chunk', speaker: 'agent', text: 'So thanks for having me over' });
  src.emit({ type: 'chunk', speaker: 'client', text: "Before we get too far — what's" });
  src.emit({ type: 'chunk', speaker: 'client', text: 'your commission' });

  check('objection alert appears mid-stream with category + confidence', () => {
    assert.ok(!el('alert-panel').classList.contains('hidden'), 'alert panel still hidden');
    assert.strictEqual(el('alert-category').textContent, 'Commission pushback');
    assert.ok(el('confidence').textContent.includes('%'), 'no confidence shown');
    assert.ok(el('alert-why').textContent.startsWith('Heard'), `why malformed: ${el('alert-why').textContent}`);
  });
  check('EN and ES coaching lines both rendered', () => {
    assert.ok(el('line-en').textContent.length > 20, 'EN line empty');
    assert.ok(el('line-es').textContent.length > 20, 'ES line empty');
    assert.notStrictEqual(el('line-en').textContent, el('line-es').textContent);
  });

  // --- Regenerate: must produce a different angle for the same moment.
  const before = el('line-en').textContent;
  el('regen-btn').click();
  check('Regenerate swaps to a different EN+ES angle', () => {
    assert.notStrictEqual(el('line-en').textContent, before, 'EN line did not change');
  });
  const second = el('line-en').textContent;
  el('regen-btn').click();
  const third = el('line-en').textContent;
  check('Regenerate cycles through 3 distinct angles, then wraps', () => {
    // Regenerate must visit all three angles before repeating: A -> B -> C -> A.
    const seen = new Set([before, second, third]);
    assert.strictEqual(seen.size, 3, `expected 3 distinct angles, got ${seen.size}`);
    el('regen-btn').click();
    assert.strictEqual(el('line-en').textContent, before, 'did not wrap back to the first angle');
  });

  // --- Accept: logs to the in-memory list, clears the alert.
  el('accept-btn').click();
  check('Accept logs the interaction and clears the alert', () => {
    assert.ok(el('log').innerHTML.includes('Accepted'), 'no Accepted entry');
    assert.ok(el('log').innerHTML.includes('Commission pushback'), 'category not logged');
    assert.ok(el('alert-panel').classList.contains('hidden'), 'alert did not clear');
    assert.ok(!el('idle-state').classList.contains('hidden'), 'idle state not restored');
  });

  // Next objection -> Skip path (agent turn resets the cooldown).
  src.emit({ type: 'chunk', speaker: 'agent', text: 'I charge six percent' });
  src.emit({ type: 'chunk', speaker: 'client', text: 'Six percent feels like a lot' });
  check('a second objection is detected after the agent turn', () => {
    assert.ok(!el('alert-panel').classList.contains('hidden'), 'second alert did not fire');
  });
  el('skip-btn').click();
  check('Skip logs as skipped and keeps listening', () => {
    assert.ok(el('log').innerHTML.includes('Skipped'), 'no Skipped entry');
    assert.ok(el('alert-panel').classList.contains('hidden'), 'alert did not clear after skip');
  });

  // --- Pause / Resume control.
  el('pause-btn').click();
  await tick(); await tick();
  check('Pause posts to /api/pause and flips the button', () => {
    assert.strictEqual(pauseCalls.length, 1, 'no pause request sent');
    assert.strictEqual(pauseCalls[0].paused, true, 'wrong pause payload');
    assert.strictEqual(el('pause-btn').textContent, 'Resume', 'button label not flipped');
    assert.strictEqual(el('status-text').textContent, 'Paused', 'status not updated');
  });
  el('pause-btn').click();
  await tick(); await tick();
  check('Resume posts paused:false and restores Listening', () => {
    assert.strictEqual(pauseCalls[1].paused, false, 'wrong resume payload');
    assert.strictEqual(el('pause-btn').textContent, 'Pause', 'button label not restored');
  });

  // --- Scenario switch reconnects the stream.
  el('scenario').value = '4';
  (el('scenario').handlers.change || []).forEach((f) => f());
  check('switching scenario reconnects to the new stream', () => {
    assert.ok(FakeEventSource.last.url.includes('scenario=4'), `url: ${FakeEventSource.last.url}`);
    assert.ok(FakeEventSource.last !== src, 'did not open a new stream');
  });

  // --- Report
  console.log('UI interaction verification (driving the real public/app.js)\n');
  for (const [mark, name] of results) console.log(`${mark} ${name}`);
  const failed = results.filter((r) => r[0] === '✖').length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
