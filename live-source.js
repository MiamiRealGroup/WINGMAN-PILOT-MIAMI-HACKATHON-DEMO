/* Wingman Pilot — live microphone source (ElevenLabs Scribe Realtime v2).
 *
 * Drop-in replacement for SimSource: emits the identical message protocol, so
 * app.js cannot tell the difference:
 *
 *   { type: 'start', role, label }
 *   { type: 'chunk', speaker, text }
 *   { type: 'turn-end' }
 *   { type: 'done' }
 *
 * Wire format per ElevenLabs' realtime event reference:
 *   out: { message_type:'input_audio_chunk', audio_base_64, commit:false, sample_rate }
 *   in : partial_transcript | committed_transcript | final_transcript  (message_type)
 *
 * The API key never reaches the browser — a single-use token is fetched from
 * our own /api/scribe-token route.
 *
 * SPEAKER ATTRIBUTION CAVEAT: one microphone hears both people. Everything is
 * tagged 'client' so detection still runs on the objection-bearing speech. See
 * the README for the two-mic / diarization upgrade.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis);
  else root.LiveSource = factory(root);
})(typeof self !== 'undefined' ? self : globalThis, function (env) {
  'use strict';

  var WS_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';
  var MODEL_ID = 'scribe_v2_realtime';
  var TOKEN_PATH = '/api/scribe-token';
  var SPEAKER = 'client';

  /* ---------------- pure helpers (unit-testable) ---------------- */

  function floatToPcm16(samples) {
    var pcm = new Int16Array(samples.length);
    for (var i = 0; i < samples.length; i++) {
      var s = samples[i];
      if (s > 1) s = 1; else if (s < -1) s = -1;
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm;
  }

  function pcm16ToBase64(pcm) {
    var bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    var binary = '';
    var STEP = 0x8000; // chunked: fromCharCode.apply overflows the stack on big frames
    for (var i = 0; i < bytes.length; i += STEP) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
    }
    return env.btoa(binary);
  }

  // Map one ElevenLabs event to the app's message protocol.
  // partial -> chunk (detection can fire mid-sentence)
  // committed/final -> chunk + turn-end (utterance boundary resets detection)
  function routeEvent(msg) {
    if (!msg || typeof msg !== 'object') return null;
    var text = typeof msg.text === 'string' ? msg.text.trim() : '';
    if (!text) return null;
    var kind = msg.message_type || msg.type;
    if (kind === 'partial_transcript') {
      return { type: 'chunk', speaker: SPEAKER, text: text, partial: true };
    }
    if (kind === 'committed_transcript' || kind === 'final_transcript') {
      return { type: 'chunk', speaker: SPEAKER, text: text, partial: false, endsTurn: true };
    }
    return null;
  }

  /* ---------------- the source ---------------- */

  function LiveSource(options) {
    options = options || {};
    this.sampleRate = options.sampleRate || 16000;
    this.tokenPath = options.tokenPath || TOKEN_PATH;
    this.role = options.role || 'seller';
    this.label = options.label || 'Live conversation';
    this.microphone = options.microphone !== false;
    this.fetchImpl = options.fetch || env.fetch;
    this.WebSocketImpl = options.WebSocket || env.WebSocket;
    this.audioContextFactory = options.createAudioContext || null;
    this.listeners = { message: [], error: [] };
    this.closed = false;
    this.paused = false;
    this.ws = null;
    this.ctx = null;
    this.stream = null;
  }

  LiveSource.prototype.addEventListener = function (type, fn) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
    return this;
  };

  LiveSource.prototype._emit = function (msg) {
    var ev = { data: JSON.stringify(msg) };
    var fns = this.listeners.message || [];
    for (var i = 0; i < fns.length; i++) fns[i](ev);
    if (typeof this.onmessage === 'function') this.onmessage(ev);
    return ev;
  };

  // Always hand back a plain, serializable object. An Error instance stringifies
  // to {} over the wire, which would leave the user staring at an empty error.
  function describeError(err) {
    if (!err) return { message: 'unknown error' };
    if (typeof err === 'string') return { message: err };
    if (err instanceof Error) return { message: err.message, name: err.name };
    if (err.reason) return { message: String(err.reason) };
    if (err.message) return { message: String(err.message) };
    try { return { message: JSON.stringify(err) }; } catch (e) { return { message: 'error' }; }
  }

  LiveSource.prototype._emitError = function (info) {
    var ev = { type: 'error', info: describeError(info) };
    var fns = this.listeners.error || [];
    for (var i = 0; i < fns.length; i++) fns[i](ev);
    if (typeof this.onerror === 'function') this.onerror(ev);
    return ev;
  };

  // Feed a raw socket frame in; emit only when it carries transcript text.
  LiveSource.prototype._ingest = function (raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch (e) { return null; }
    if (msg && (msg.message_type === 'error' || msg.type === 'error')) {
      this._emitError(msg);
      return null;
    }
    var out = routeEvent(msg);
    if (!out) return null;
    if (out.endsTurn) {
      // Emit the settled text, then close the utterance so app.js resets and
      // can detect the next objection.
      this._emit({ type: 'chunk', speaker: out.speaker, text: out.text });
      this._emit({ type: 'turn-end' });
    } else {
      this._emit(out);
    }
    return out;
  };

  LiveSource.prototype.start = function () {
    var self = this;
    this._emit({ type: 'start', role: this.role, label: this.label });
    return Promise.resolve(this.fetchImpl(this.tokenPath))
      .then(function (r) {
        // Read the body either way: the server explains *why* it refused
        // (usually a missing ELEVENLABS_API_KEY), and that message is the
        // whole value of the error to whoever is setting this up.
        return Promise.resolve(r.json()).catch(function () { return {}; })
          .then(function (body) {
            if (!r.ok) {
              throw new Error((body && body.error) ||
                ('token request failed with HTTP ' + r.status));
            }
            var token = body && (body.token || body.value);
            if (!token) throw new Error('no token returned by ' + self.tokenPath);
            return token;
          });
      })
      .then(function (token) { return self._connect(token); })
      .catch(function (err) {
        self._emitError(err);
        self._emit({ type: 'done' });
      });
  };

  LiveSource.prototype._connect = function (token) {
    var self = this;
    if (this.microphone && env.navigator && env.navigator.mediaDevices) {
      return env.navigator.mediaDevices
        .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
        .then(function (stream) { self.stream = stream; return self._openSocket(token); });
    }
    return this._openSocket(token);
  };

  LiveSource.prototype._socketUrl = function (token) {
    if (typeof env.URL === 'function') {
      var u = new env.URL(WS_URL);
      u.searchParams.set('model_id', MODEL_ID);
      u.searchParams.set('audio_format', 'pcm_' + this.sampleRate);
      u.searchParams.set('token', token);
      return u.toString();
    }
    return WS_URL + '?model_id=' + MODEL_ID + '&audio_format=pcm_' + this.sampleRate +
      '&token=' + encodeURIComponent(token);
  };

  LiveSource.prototype._openSocket = function (token) {
    var self = this;
    var ws = new this.WebSocketImpl(this._socketUrl(token));
    this.ws = ws;
    ws.onopen = function () { self._startAudio(); };
    ws.onmessage = function (e) { self._ingest(e && e.data); };
    ws.onerror = function (info) { self._emitError(info); };
    ws.onclose = function () {
      if (!self.closed) {
        self._emit({ type: 'done' });
        self._emitError({ reason: 'socket closed' });
      }
    };
    return ws;
  };

  LiveSource.prototype._startAudio = function () {
    if (!this.stream) return null;
    var AC = this.audioContextFactory || env.AudioContext || env.webkitAudioContext;
    if (!AC) return null;
    var self = this;
    this.ctx = new AC({ sampleRate: this.sampleRate });
    var src = this.ctx.createMediaStreamSource(this.stream);
    var node = this.ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = function (ev) {
      if (self.paused) return;
      self._onAudio(ev.inputBuffer.getChannelData(0));
    };
    src.connect(node);
    node.connect(this.ctx.destination); // WebAudio needs a sink; outputs silence
    return node;
  };

  // One mic frame -> PCM16 -> base64 -> input_audio_chunk.
  LiveSource.prototype._onAudio = function (channelData) {
    if (!this.ws || this.ws.readyState !== 1) return null; // 1 === OPEN
    var frame = {
      message_type: 'input_audio_chunk',
      audio_base_64: pcm16ToBase64(floatToPcm16(channelData)),
      commit: false,
      sample_rate: this.sampleRate,
    };
    this.ws.send(JSON.stringify(frame));
    return frame;
  };

  // Explicitly finalize a segment (needed if commit_strategy is manual).
  LiveSource.prototype.commit = function () {
    if (!this.ws || this.ws.readyState !== 1) return null;
    var frame = { message_type: 'commit' };
    this.ws.send(JSON.stringify(frame));
    return frame;
  };

  LiveSource.prototype.pause = function (on) { this.paused = !!on; };
  LiveSource.prototype.isPaused = function () { return this.paused; };

  LiveSource.prototype.close = function () {
    this.closed = true;
    try { if (this.ws) this.ws.close(); } catch (e) {}
    if (this.stream && this.stream.getTracks) {
      this.stream.getTracks().forEach(function (t) { t.stop(); });
    }
    try { if (this.ctx) this.ctx.close(); } catch (e) {}
  };

  LiveSource.floatToPcm16 = floatToPcm16;
  LiveSource.pcm16ToBase64 = pcm16ToBase64;
  LiveSource.routeEvent = routeEvent;
  LiveSource.describeError = describeError;
  LiveSource.WS_URL = WS_URL;
  LiveSource.MODEL_ID = MODEL_ID;
  LiveSource.TOKEN_PATH = TOKEN_PATH;
  return LiveSource;
});
