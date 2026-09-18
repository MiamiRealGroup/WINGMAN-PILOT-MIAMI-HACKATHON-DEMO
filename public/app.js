// Wingman Pilot — client. Consumes the transcript stream (SSE), runs the
// detection loop live, renders the feed, and handles Accept/Skip/Regenerate.
// The stream is consumed through a single source.onMessage handler, so the
// transport (SSE today, WebSocket/WebRTC audio tomorrow) is swappable without
// touching this UI logic.

(() => {
  // ------------------------------------------------------------- state
  let source = null;
  let role = 'seller';
  let scenarioIndex = 0;
  let clientTurn = '';      // accumulated text for the current client utterance
  let alertActive = false;  // an objection alert is currently on screen
  let cooldown = false;     // suppress re-detection of the same moment
  let currentVariant = 0;   // Regenerate cycles through coaching variants
  let currentAlert = null;  // { category, label, confidence, why }
  let currentBubble = null; // DOM bubble we're appending to
  let currentSpeaker = null;
  const interactions = [];  // in-memory log (Accept / Skip)

  // ------------------------------------------------------------- DOM
  const $ = (id) => document.getElementById(id);
  const transcriptEl = $('transcript');
  const scenarioEl = $('scenario');
  const pauseBtn = $('pause-btn');
  const statusText = $('status-text');
  const liveDot = $('live-dot');
  const scenarioMeta = $('scenario-meta');
  const alertPanel = $('alert-panel');
  const idleState = $('idle-state');
  const logEl = $('log');

  // ------------------------------------------------------------- stream
  function connect(index) {
    if (source) { source.close(); source = null; }
    resetConversation();
    setStatus('connecting');

    source = new EventSource(`/api/stream?scenario=${index}`);
    source.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      handleMessage(msg);
    };
    source.onerror = () => setStatus('disconnected');
  }

  function handleMessage(msg) {
    if (msg.type === 'start') {
      role = msg.role;
      scenarioMeta.textContent = `${msg.label} — ${msg.role === 'seller' ? 'seller side' : 'buyer side'}`;
      setStatus('live');
      return;
    }
    if (msg.type === 'chunk') {
      onChunk(msg);
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
      // Only fire once per moment: while an alert is up, or until the next
      // client turn begins, don't re-run detection on the same words.
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
      line: $('line-en').textContent,    // the EN coaching line (used or skipped)
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
          <span>${e.disposition === 'accepted' ? '✓ Accepted' : '↷ Skipped'}</span>
          <span>${e.timestamp}</span>
        </div>
        <div class="log-cat">${e.label}</div>
        <div class="log-line">${escapeHtml(e.line)}</div>
      </li>`).join('');
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
    } else {
      statusText.textContent = 'Disconnected';
      liveDot.className = 'dot';
    }
  }

  // ------------------------------------------------------------- controls
  // Pause state is tracked here rather than inferred from the button's label:
  // reading DOM text as state makes the handler depend on index.html's markup
  // and breaks the moment the initial label changes.
  let isPaused = false;
  pauseBtn.addEventListener('click', async () => {
    isPaused = !isPaused;
    await fetch('/api/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused: isPaused }),
    });
    pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    setStatus(isPaused ? 'paused' : 'live');
  });

  scenarioEl.addEventListener('change', () => {
    scenarioIndex = Number(scenarioEl.value);
    connect(scenarioIndex);
  });

  $('accept-btn').addEventListener('click', () => { log('accepted'); clearAlert(); });
  $('skip-btn').addEventListener('click', () => { log('skipped'); clearAlert(); });
  $('regen-btn').addEventListener('click', () => {
    // Cycle through however many angles the engine actually provides.
    const { variants } = window.Engine.generate(currentAlert.category, currentVariant);
    currentVariant = (currentVariant + 1) % variants;
    renderCoaching();
  });

  // ------------------------------------------------------------- boot
  async function boot() {
    const res = await fetch('/api/scenarios');
    const scenarios = await res.json();
    scenarioEl.innerHTML = scenarios.map((s) => `<option value="${s.index}">${s.label}</option>`).join('');
    renderLog();
    connect(0);
  }

  boot();
})();
