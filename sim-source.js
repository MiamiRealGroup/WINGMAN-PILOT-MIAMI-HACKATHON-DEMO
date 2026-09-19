/* Wingman Pilot — simulated transcript source.
 *
 * Stands in for a live microphone. Streams a scenario phrase by phrase at a
 * natural speaking pace, emitting the SAME message protocol the live audio
 * source emits, so the app cannot tell the two apart:
 *
 *   { type: 'start', role, label }
 *   { type: 'chunk', speaker, text }
 *   { type: 'turn-end' }          // utterance boundary (see live-source.js)
 *   { type: 'done' }
 *
 * Supports onmessage/onerror as properties and addEventListener, mirroring
 * EventSource — which is how app.js consumes it.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis);
  else root.SimSource = factory(root);
})(typeof self !== 'undefined' ? self : globalThis, function (env) {
  'use strict';

  var WORDS_PER_MINUTE = 165; // conversational pace

  function SimSource(scenarios, options) {
    options = options || {};
    this.scenarios = scenarios || [];
    this.wpm = options.wpm || WORDS_PER_MINUTE;
    // Floor between phrases. Tests lower these via SimSource.MIN_DELAY so a
    // scenario plays in milliseconds instead of ~10 seconds.
    this.minDelay = options.minDelay || SimSource.MIN_DELAY || 320;
    this.initialDelay = options.initialDelay || SimSource.INITIAL_DELAY || 600;
    this.listeners = { message: [], error: [] };
    this.timer = null;
    this.closed = false;
    this.paused = false;
    this.index = 0;
  }

  SimSource.prototype.addEventListener = function (type, fn) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
    return this;
  };

  SimSource.prototype._emit = function (msg) {
    var ev = { data: JSON.stringify(msg) };
    var fns = this.listeners.message || [];
    for (var i = 0; i < fns.length; i++) fns[i](ev);
    if (typeof this.onmessage === 'function') this.onmessage(ev);
    return ev;
  };

  SimSource.prototype.close = function () {
    this.closed = true;
    if (this.timer) { env.clearTimeout(this.timer); this.timer = null; }
  };

  SimSource.prototype.pause = function (on) { this.paused = !!on; };
  SimSource.prototype.isPaused = function () { return this.paused; };

  // Build the flat phrase timeline for a scenario, then walk it on a timer.
  SimSource.prototype.start = function (scenarioIndex) {
    var self = this;
    var scenario = this.scenarios[scenarioIndex] || this.scenarios[0];
    if (!scenario) return;

    this.close();
    this.closed = false;
    this.index = scenarioIndex || 0;

    this._emit({ type: 'start', role: scenario.role, label: scenario.label });

    // Flatten every line into phrases so text arrives incrementally, never as
    // one submitted block.
    var phrases = [];
    for (var li = 0; li < scenario.lines.length; li++) {
      var line = scenario.lines[li];
      var parts = String(line.text).match(/[^,.;!?]+[,.;!?]*/g) || [line.text];
      for (var pi = 0; pi < parts.length; pi++) {
        var piece = parts[pi].trim();
        if (piece) phrases.push({ speaker: line.speaker, text: piece });
      }
    }

    var cursor = 0;
    function step() {
      if (self.closed) return;
      if (self.paused) { self.timer = env.setTimeout(step, 200); return; }
      if (cursor >= phrases.length) {
        self._emit({ type: 'done' });
        return;
      }
      var phrase = phrases[cursor++];
      self._emit({ type: 'chunk', speaker: phrase.speaker, text: phrase.text });

      // A client line ending a sentence marks the end of that utterance.
      var endsUtterance = /[.!?]$/.test(phrase.text);
      if (endsUtterance) self._emit({ type: 'turn-end' });

      var words = phrase.text.split(/\s+/).length;
      var delay = Math.max(self.minDelay, (words / self.wpm) * 60000);
      self.timer = env.setTimeout(step, delay);
    }

    this.timer = env.setTimeout(step, this.initialDelay);
  };

  SimSource.WORDS_PER_MINUTE = WORDS_PER_MINUTE;
  return SimSource;
});
