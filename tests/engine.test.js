// Engine unit tests: every scenario's objection line must be detected with
// the right category, and generation must return EN + ES lines for every
// category and angle.
const { test } = require('node:test');
const assert = require('node:assert');
const { SCENARIOS } = require('../src/data/scenarios.js');
const { detect, generate } = require('../public/engine.js');

test('every scenario is detected with the expected category', () => {
  const expected = {
    'seller-commission': 'commission',
    'seller-existing-agent': 'existing_agent',
    'seller-testing-market': 'testing_market',
    'seller-timing': 'price_timing',
    'buyer-financing': 'financing',
    'buyer-inspection': 'inspection',
    'buyer-more-options': 'more_options',
    'buyer-price': 'price',
  };

  for (const scenario of SCENARIOS) {
    const clientText = scenario.lines
      .filter((l) => l.speaker === 'client')
      .map((l) => l.text)
      .join(' ');
    const result = detect(clientText, scenario.role);
    assert.ok(result, `${scenario.id}: no objection detected`);
    assert.strictEqual(result.category, expected[scenario.id], `${scenario.id}: wrong category`);
    assert.ok(result.confidence >= 72 && result.confidence <= 98, `${scenario.id}: confidence out of range (${result.confidence})`);
    assert.ok(result.why.includes(result.label), `${scenario.id}: why does not cite label`);
  }
});

test('a calm client turn is not flagged as an objection', () => {
  assert.strictEqual(detect("Thanks, we really like the house and the neighborhood.", 'buyer'), null);
  assert.strictEqual(detect("The kitchen is beautiful and the yard is perfect.", 'seller'), null);
});

test('generation returns EN + ES lines for every category and angle', () => {
  const categories = Object.keys(require('../public/engine.js'));
  // Categories are the keys of LINES (not exported); enumerate via detect usage.
  const seen = new Set();
  for (const scenario of SCENARIOS) {
    const result = detect(
      scenario.lines.filter((l) => l.speaker === 'client').map((l) => l.text).join(' '),
      scenario.role
    );
    seen.add(result.category);
  }

  for (const category of seen) {
    for (let angle = 0; angle < 3; angle++) {
      const out = generate(category, angle);
      assert.ok(out.en && out.en.length > 10, `${category}@${angle}: EN line too short`);
      assert.ok(out.es && out.es.length > 10, `${category}@${angle}: ES line too short`);
    }
  }
});

test('regenerate cycles through three distinct angles', () => {
  const a0 = generate('price', 0).en;
  const a1 = generate('price', 1).en;
  const a2 = generate('price', 2).en;
  assert.notStrictEqual(a0, a1);
  assert.notStrictEqual(a1, a2);
  assert.notStrictEqual(a0, a2);
});
