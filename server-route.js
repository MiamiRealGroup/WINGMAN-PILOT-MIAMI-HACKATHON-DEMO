/* Wingman Pilot — server-side ElevenLabs routes.
 *
 * Keeps ELEVENLABS_API_KEY on the server. The browser only ever sees a
 * short-lived single-use token (15-min expiry), never the key.
 *
 * Framework-agnostic: handlers take plain (req, res) with Express-shaped
 * methods, so they drop into the app's server.js as-is.
 *
 *   const eleven = require('./server-route.js');
 *   app.get('/api/scribe-token', eleven.createScribeTokenHandler());
 *   app.post('/api/speak', express.json(), eleven.createSpeakHandler());
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis);
  else root.WingmanElevenLabsServer = factory(root);
})(typeof self !== 'undefined' ? self : globalThis, function (env) {
  'use strict';

  var TOKEN_URL = 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe';
  var TTS_BASE = 'https://api.elevenlabs.io/v1/text-to-speech/';
  var TTS_MODEL = 'eleven_multilingual_v2'; // handles EN + ES from one voice
  var DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'; // replace with your chosen voice id

  function resolveKey(opts) {
    if (opts.apiKey !== undefined) return opts.apiKey;
    return (env.process && env.process.env && env.process.env.ELEVENLABS_API_KEY) || null;
  }

  // Lets ELEVENLABS_VOICE_ID in .env pick the default voice, so the documented
  // variable actually does something. An explicit opts.voiceId wins.
  function resolveVoice(opts) {
    if (opts.voiceId) return opts.voiceId;
    var fromEnv = env.process && env.process.env && env.process.env.ELEVENLABS_VOICE_ID;
    return fromEnv || DEFAULT_VOICE;
  }

  /* POST /api/scribe-token -> { token }
   *
   * VERIFIED against the live endpoint 2026-09-19: the path is correct (no
   * credentials gave 411 then 401, never 404). The explicit content-length:0
   * matters — a POST with no declared length is rejected with HTTP 411 before
   * auth is even attempted.
   */
  function createScribeTokenHandler(opts) {
    opts = opts || {};
    var apiKey = resolveKey(opts);
    var doFetch = opts.fetch || env.fetch;

    return function scribeTokenHandler(req, res) {
      if (!apiKey) {
        res.status(500).json({ error: 'ELEVENLABS_API_KEY is not set on the server' });
        return Promise.resolve();
      }
      return Promise.resolve(doFetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'content-length': '0' },
      }))
        .then(function (r) {
          if (!r.ok) {
            return r.text().then(function (t) {
              throw new Error('ElevenLabs ' + r.status + ': ' + t);
            });
          }
          return r.json();
        })
        .then(function (body) {
          var token = body && (body.token || body.value);
          if (!token) throw new Error('ElevenLabs returned no token field');
          res.json({ token: token, expiresInSeconds: 900 });
        })
        .catch(function (err) {
          res.status(502).json({ error: 'Could not mint ElevenLabs token', detail: err.message });
        });
    };
  }

  /* POST /api/speak  { text, lang } -> audio/mpeg
   *
   * Reads the coaching line aloud — useful when the realtor is listening
   * rather than reading. Buffered; switch to the /stream variant if latency
   * matters.
   */
  function createSpeakHandler(opts) {
    opts = opts || {};
    var apiKey = resolveKey(opts);
    var doFetch = opts.fetch || env.fetch;

    return function speakHandler(req, res) {
      var body = (req && req.body) || {};
      var text = typeof body.text === 'string' ? body.text.trim() : '';
      var voiceId = body.voiceId || resolveVoice(opts);

      if (!apiKey) {
        res.status(500).json({ error: 'ELEVENLABS_API_KEY is not set on the server' });
        return Promise.resolve();
      }
      if (!text) {
        res.status(400).json({ error: 'text is required' });
        return Promise.resolve();
      }

      var url = TTS_BASE + encodeURIComponent(voiceId) + '?output_format=mp3_44100_128';
      return Promise.resolve(doFetch(url, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ text: text, model_id: TTS_MODEL }),
      }))
        .then(function (r) {
          if (!r.ok) {
            return r.text().then(function (t) {
              throw new Error('ElevenLabs ' + r.status + ': ' + t);
            });
          }
          return r.arrayBuffer();
        })
        .then(function (audio) {
          if (res.set) res.set('content-type', 'audio/mpeg');
          // Uint8Array, not Buffer: this file also runs in the browser test page.
          res.status(200).send(new Uint8Array(audio));
        })
        .catch(function (err) {
          res.status(502).json({ error: 'Could not synthesize speech', detail: err.message });
        });
    };
  }

  return {
    createScribeTokenHandler: createScribeTokenHandler,
    createSpeakHandler: createSpeakHandler,
    resolveKey: resolveKey,
    resolveVoice: resolveVoice,
    TOKEN_URL: TOKEN_URL,
    TTS_MODEL: TTS_MODEL,
    DEFAULT_VOICE: DEFAULT_VOICE,
  };
});
