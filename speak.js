/* Wingman Pilot — client speech output.
 *
 * Reads a coaching line (EN or ES) aloud through ElevenLabs TTS via the app's
 * own server (/api/speak), so the API key never reaches the browser.
 *
 * Zero dependencies; fetch and Audio are injectable so this is testable
 * without a browser. Loads as <script> (window.WingmanSpeech) or require().
 *
 * If /api/speak is absent (e.g. the static local demo), speak() fails quietly
 * and returns false — the app keeps working without voice.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis);
  else root.WingmanSpeech = factory(root);
})(typeof self !== 'undefined' ? self : globalThis, function (env) {
  'use strict';

  var SPEAK_PATH = '/api/speak';

  /* ---------- pure helpers ---------- */

  function normalizeLine(text) {
    if (typeof text !== 'string') return null;
    var t = text.trim();
    return t ? t : null;
  }

  function buildSpeakRequest(text, opts) {
    opts = opts || {};
    var body = { text: text };
    if (opts.lang) body.lang = opts.lang;
    if (opts.voiceId) body.voiceId = opts.voiceId;
    return {
      url: opts.basePath || SPEAK_PATH,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    };
  }

  /* ---------- player ---------- */

  function SpeechPlayer(opts) {
    opts = opts || {};
    this.fetchImpl = opts.fetch || env.fetch;
    this.AudioCtor = opts.Audio || env.Audio;
    this.createObjectURL = opts.createObjectURL || (env.URL && env.URL.createObjectURL);
    this.basePath = opts.basePath || SPEAK_PATH;
    this.voiceId = opts.voiceId || null;
    this.audio = null;
    this.generation = 0;
  }

  // Speak one line, replacing anything already playing. Resolves true if audio
  // started; false if the line was empty, superseded, or the request failed.
  SpeechPlayer.prototype.speak = function (text, lang) {
    var self = this;
    var line = normalizeLine(text);
    if (!line || !this.fetchImpl) return Promise.resolve(false);

    this.stop();                 // invalidates any in-flight line
    var mine = this.generation;  // this call owns the current generation

    var req = buildSpeakRequest(line, {
      basePath: this.basePath,
      lang: lang,
      voiceId: this.voiceId,
    });

    return Promise.resolve(this.fetchImpl(req.url, req.init))
      .then(function (r) {
        if (!r.ok) throw new Error('speak failed: HTTP ' + r.status);
        return r.blob();
      })
      .then(function (blob) {
        if (mine !== self.generation) return false; // a newer line won
        if (!self.createObjectURL || !self.AudioCtor) return false;
        self.audio = new self.AudioCtor(self.createObjectURL(blob));
        if (self.audio && self.audio.play) self.audio.play();
        return true;
      })
      .catch(function () { return false; });
  };

  // Halt playback and invalidate any request still in flight.
  SpeechPlayer.prototype.stop = function () {
    this.generation++;
    if (this.audio) {
      try { if (this.audio.pause) this.audio.pause(); } catch (e) {}
      this.audio = null;
    }
    return this;
  };

  SpeechPlayer.normalizeLine = normalizeLine;
  SpeechPlayer.buildSpeakRequest = buildSpeakRequest;
  SpeechPlayer.SPEAK_PATH = SPEAK_PATH;
  return SpeechPlayer;
});
