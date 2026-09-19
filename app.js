// Wingman Pilot — client. Consumes the transcript stream, runs the detection
// loop live, renders the feed, and handles Accept/Skip/Regenerate.
//
// The stream arrives through ONE handler (`source.onmessage`), so the transport
// is swappable: SimSource (canned scripts, works offline) or LiveSource
// (microphone -> ElevenLabs Scribe Realtime v2). Neither the detection loop nor
// the UI knows which one is running.

(() => {
  // ------------------------------------------------------------- state
  let source = null;
  let sourceMode = 'sim';   // 'sim' | 'live'
  let role = 'seller';
  let scenarioIndex = 0;
  let clientTurn = '';      // accumulated text for the current client utterance
  let alertActive = false;  // an objection alert is currently on screen
  let cooldown = false;     // suppress re-detection of the same moment
  let currentVariant = 0;   // Regenerate cycles through coaching variants
  let currentAlert = null;  // { category, label, confidence, why }
  let currentBubble = null; // DOM bubble we're appending to
  let currentSpeaker = null;
  // Set when the realtor picks a side explicitly. Without this, the scenario's
  // own role would immediately overwrite their choice on the next connect.
  let roleLocked = false;
  const interactions = [];  // in-memory log (Accept / Skip)

  // ------------------------------------------------------------- DOM
  const $ = (id) => document.getElementById(id);
  const transcriptEl = $('transcript');
  const scenarioEl = $('scenario');
  const pauseBtn = $('pause-btn');
  const modeEl = $('mode');
  const statusText = $('status-text');
  const liveDot = $('live-dot');
  const scenarioMeta = $('scenario-meta');
  const alertPanel = $('alert-panel');
  const idleState = $('idle-state');
  const logEl = $('log');
  const sideEl = $('side');

  // ------------------------------------------------------------- stream
  function makeSource(index) {
    if (sourceMode === 'live') {
      // Role drives which rule set detection uses, so it is explicit here.
      const side = (role === 'buyer') ? 'buyer' : 'seller';
      return new window.LiveSource({
        role: side,
        label: 'Live microphone',
      });
    }
    return new window.SimSource(window.SCENARIOS);
  }

  function connect(index) {
    if (source) { source.close(); source = null; }
    resetConversation();
    setStatus('connecting');

    source = makeSource(index);
    source.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      handleMessage(msg);
    };
    source.onerror = (ev) => {
      // Live mode fails for a reason worth reading — usually a missing API key.
      // Show it, or the realtor is left staring at "Waiting for feed".
      const info = (ev && ev.info) || {};
      const detail = info.message || 'The audio source stopped.';
      if (sourceMode === 'live') {
        scenarioMeta.textContent = detail;
        setStatus('error');
      } else {
        setStatus('disconnected');
      }
    };

    if (sourceMode === 'live') source.start();
    else source.start(index);
  }

  function handleMessage(msg) {
    if (msg.type === 'start') {
      if (msg.role && !roleLocked) role = msg.role;
      scenarioMeta.textContent = `${msg.label || 'Conversation'} — ${role === 'seller' ? 'seller side' : 'buyer side'}`;
      setStatus('live');
      return;
    }
    if (msg.type === 'chunk') {
      onChunk(msg);
      return;
    }
    if (msg.type === 'turn-end') {
      // Utterance boundary: the objection moment is over, so allow detection
      // on the next client turn. Keeps partial transcripts from re-firing.
      clientTurn = '';
      cooldown = false;
      return;
    }
    if (msg.type === 'done') {
      scenarioMeta.textContent = scenarioMeta.textContent + ' · scenario complete';
      setStatus('idle');
      return;
    }
  }

  // ------------------------------------------------------------- detection
  function onChunk(msg) {
    appendTranscript(msg);

    if (msg.speaker === 'client') {
      clientTurn = (clientTurn ? clientTurn + ' ' : '') + msg.text;
      // Fire once per moment: while an alert is up, or until the next client
      // turn begins, don't re-run detection on the same words.
      if (!alertActive && !cooldown) {
        const result = window.Engine.detect(clientTurn, role);
        if (result) showAlert(result);
      }
    } else {
      // Agent turn: the objection moment is over; reset for the next one.
      clientTurn = '';
      cooldown = false;
    }
  }

  function showAlert(result) {
    alertActive = true;
    currentAlert = result;
    currentVariant = 0;

    $('confidence').textContent = `${result.confidence}% confidence`;
    $('alert-category').textContent = result.label;
    $('alert-why').textContent = result.why;
    renderCoaching();

    alertPanel.classList.remove('hidden');
    idleState.classList.add('hidden');
  }

  function renderCoaching() {
    const { en, es } = window.Engine.generate(currentAlert.category, currentVariant);
    $('line-en').textContent = en;
    $('line-es').textContent = es;
    // Keep speech in sync only when the realtor has audio coaching switched on.
    if (window.WingmanSpeech && speechOn) player.speak(en, 'en');
  }

  function clearAlert() {
    alertActive = false;
    currentAlert = null;
    cooldown = true;
    alertPanel.classList.add('hidden');
    idleState.classList.remove('hidden');
  }

  // ------------------------------------------------------------- actions
  function log(disposition) {
    const entry = {
      disposition,                       // 'accepted' | 'skipped'
      category: currentAlert.category,
      label: currentAlert.label,
      line: $('line-en').textContent,
      timestamp: new Date().toLocaleTimeString(),
    };
    interactions.unshift(entry);
    renderLog();
  }

  function renderLog() {
    if (!interactions.length) {
      logEl.innerHTML = '<li class="empty">No interactions yet.</li>';
      return;
    }
    logEl.innerHTML = interactions.map((e) => `
      <li class="${e.disposition}">
        <div class="log-top">
          <span>${e.disposition === 'accepted' ? '\u2713 Accepted' : '\u21b7 Skipped'}</span>
          <span>${e.timestamp}</span>
        </div>
        <div class="log-cat">${e.label}</div>
        <div class="log-line">${escapeHtml(e.line)}</div>
      </li>`).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // ------------------------------------------------------------- transcript
  function appendTranscript(msg) {
    if (msg.speaker !== currentSpeaker) {
      currentSpeaker = msg.speaker;
      currentBubble = null;
    }
    if (!currentBubble) {
      const wrap = document.createElement('div');
      wrap.className = `msg ${msg.speaker}`;
      const name = document.createElement('div');
      name.className = 'speaker';
      name.textContent = msg.speaker === 'agent' ? 'Realtor' : role === 'seller' ? 'Seller' : 'Buyer';
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      wrap.append(name, bubble);
      transcriptEl.appendChild(wrap);
      currentBubble = bubble;
    }
    currentBubble.textContent += (currentBubble.textContent ? ' ' : '') + msg.text;
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }

  function resetConversation() {
    transcriptEl.innerHTML = '';
    clientTurn = '';
    currentBubble = null;
    currentSpeaker = null;
    alertActive = false;
    cooldown = false;
    alertPanel.classList.add('hidden');
    idleState.classList.remove('hidden');
    setStatus('connecting');
  }

  function setStatus(mode) {
    if (mode === 'live') {
      statusText.textContent = 'Listening…';
      liveDot.className = 'dot live';
    } else if (mode === 'connecting') {
      statusText.textContent = 'Connecting…';
      liveDot.className = 'dot';
    } else if (mode === 'paused') {
      statusText.textContent = 'Paused';
      liveDot.className = 'dot paused';
    } else if (mode === 'idle') {
      statusText.textContent = 'Waiting for feed';
      liveDot.className = 'dot';
    } else if (mode === 'error') {
      statusText.textContent = 'Needs attention';
      liveDot.className = 'dot paused';
    } else {
      statusText.textContent = 'Disconnected';
      liveDot.className = 'dot';
    }
  }

  // ------------------------------------------------------------- speech output
  // Optional: read the coaching line aloud through ElevenLabs TTS. Off by
  // default so the app works with no key at all.
  let speechOn = false;
  const player = window.WingmanSpeech ? new window.WingmanSpeech() : null;

  // ------------------------------------------------------------- controls
  // Pause state is tracked here rather than inferred from the button's label:
  // reading DOM text as state makes the handler depend on index.html's markup
  // and breaks the moment the initial label changes.
  let isPaused = false;
  pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    if (source && source.pause) source.pause(isPaused);
    pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    setStatus(isPaused ? 'paused' : 'live');
  });

  scenarioEl.addEventListener('change', () => {
    scenarioIndex = Number(scenarioEl.value);
    connect(scenarioIndex);
  });

  modeEl.addEventListener('change', () => {
    sourceMode = modeEl.value === 'live' ? 'live' : 'sim';
    scenarioEl.disabled = sourceMode === 'live';
    role = sourceMode === 'live' ? (sideEl.value || 'seller') : role;
    connect(scenarioIndex);
  });

  sideEl.addEventListener('change', () => {
    // An explicit choice sticks: reconnect so detection switches rule sets now.
    role = sideEl.value;
    roleLocked = true;
    connect(scenarioIndex);
  });

  const speechBtn = $('speech-btn');
  if (speechBtn) {
    speechBtn.addEventListener('click', () => {
      if (!player) return;
      speechOn = !speechOn;
      speechBtn.textContent = speechOn ? 'Voice: on' : 'Voice: off';
      if (speechOn && currentAlert) renderCoaching();
      else player.stop();
    });
  }

  $('accept-btn').addEventListener('click', () => { log('accepted'); clearAlert(); });
  $('skip-btn').addEventListener('click', () => { log('skipped'); clearAlert(); });
  $('regen-btn').addEventListener('click', () => {
    // Cycle through however many angles the engine actually provides.
    const { variants } = window.Engine.generate(currentAlert.category, currentVariant);
    currentVariant = (currentVariant + 1) % variants;
    renderCoaching();
  });

  // ------------------------------------------------------------- boot
  // Scenarios come from the bundled scenarios.js when present, so the app runs
  // with no backend at all. Falls back to the API for the deployed build.
  async function loadScenarios() {
    if (window.SCENARIOS) return window.SCENARIOS;
    const res = await fetch('/api/scenarios');
    return res.json();
  }

  async function boot() {
    let scenarios = [];
    try {
      scenarios = await loadScenarios();
    } catch (err) {
      scenarioMeta.textContent = 'Could not load scenarios.';
      setStatus('disconnected');
      return;
    }
    scenarioEl.innerHTML = scenarios
      .map((s) => `<option value="${s.index}">${s.label}</option>`)
      .join('');
    if (scenarios[0]) role = scenarios[0].role;
    sideEl.value = role;
    renderLog();
    connect(0);
  }

  boot();
})();
