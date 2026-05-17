/* ═══════════════════════════════════════════════
   Test12 — Voice Posts (record → confirm → publish)
   ═══════════════════════════════════════════════ */
(function () {
  'use strict';

  // Flow states for the single mic button
  const FLOW = {
    IDLE: 'idle',                          // nothing pending
    AUTO_READING: 'autoReading',           // TTS reading all posts on load
    AWAITING_REPLY_PROMPT: 'awaitingReplyPrompt', // asked "do you want to reply", waiting for tap
    RECORDING_REPLY_PROMPT: 'recordingReplyPrompt',
    PROCESSING_REPLY_PROMPT: 'processingReplyPrompt',
    AWAITING_REPLY_TARGET: 'awaitingReplyTarget', // asked "which number", waiting for tap
    RECORDING_REPLY_TARGET: 'recordingReplyTarget',
    PROCESSING_REPLY_TARGET: 'processingReplyTarget',
    RECORDING_POST: 'recordingPost',       // capturing name + message (top-level OR reply)
    PROCESSING_POST: 'processingPost',     // STT + parsing
    AWAITING_CONFIRM: 'awaitingConfirm',   // post staged, waiting for confirm tap
    RECORDING_CONFIRM: 'recordingConfirm', // capturing confirm/cancel utterance
    PROCESSING_CONFIRM: 'processingConfirm',
    POSTING: 'posting',                    // sending to server
  };

  const MAX_LEVEL = 3;

  const state = {
    flow: FLOW.IDLE,
    recording: false,
    speaking: false,
    voice: 'eve',
    mediaRecorder: null,
    audioChunks: [],
    audioContext: null,
    analyser: null,
    animFrameId: null,
    currentAudio: null,
    recordingSession: 0,
    speakSession: 0,                       // bumped to cancel in-flight TTS chunks
    pendingPost: null,                     // { name, message, parentId }
    replyTo: null,                         // parent post object when composing a reply
    numberedPosts: [],                     // flat list aligned with numbers spoken in auto-read
    author: '',
    lastFetchedPosts: [],
    suppressNextMicClick: false,           // set when the first interaction was on the mic
    autoReadStarted: false,                // becomes true after the first auto-read kickoff
  };

  const AUTHOR_STORAGE_KEY = 'test12_author';

  // ─── DOM Refs ───
  const $ = (id) => document.getElementById(id);
  const micBtn = $('mic-button');
  const micHint = $('mic-hint');
  const micIconRecord = micBtn.querySelector('.mic-button__icon:not(.mic-button__icon--stop)');
  const micIconStop = micBtn.querySelector('.mic-button__icon--stop');
  const canvas = $('waveform-canvas');
  const ctx = canvas.getContext('2d');
  const vizLabel = $('visualizer-label');
  const pageTitle = $('page-title');
  const pageUrl = $('page-url');
  const feed = $('transcript-feed');
  const linksSection = $('links-section');
  const voiceSelect = $('voice-selector');
  const statusText = $('status-text');
  const webmcpBadge = $('webmcp-badge');
  const postsList = $('posts-list');
  const authorInput = $('post-author-input');
  const composeForm = $('post-compose-form');
  const composeInput = $('post-compose-input');
  const composeBtn = $('post-compose-btn');
  const composeError = $('post-compose-error');
  const refreshPostsBtn = $('refresh-posts-btn');
  const replyBanner = $('reply-banner');
  const replyBannerText = $('reply-banner-text');
  const replyBannerCancel = $('reply-banner-cancel');
  const composeParentInput = $('post-compose-parent-id');

  // Browsing UI is no longer used in this build
  if (linksSection) linksSection.style.display = 'none';
  // Badge is shown because Test12 is now WebMCP compliant
  if (webmcpBadge) webmcpBadge.style.display = 'inline-flex';

  // ─── Canvas / Visualizer ───
  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width - 32;
    canvas.height = 100;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function drawIdleWave(t) {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(59,130,246,0.3)');
    grad.addColorStop(0.5, 'rgba(6,182,212,0.3)');
    grad.addColorStop(1, 'rgba(139,92,246,0.3)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const y = h / 2 + Math.sin(x * 0.02 + t * 0.002) * 8 + Math.sin(x * 0.01 + t * 0.001) * 5;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawAnalyserWave(color1, color2) {
    if (!state.analyser) return;
    const bufLen = state.analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    state.analyser.getByteTimeDomainData(data);
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, color1);
    grad.addColorStop(1, color2);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const sliceW = w / bufLen;
    let x = 0;
    for (let i = 0; i < bufLen; i++) {
      const v = data[i] / 128.0;
      const y = (v * h) / 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      x += sliceW;
    }
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  }

  let idleTime = 0;
  function animLoop() {
    if (state.recording) {
      drawAnalyserWave('rgba(239,68,68,0.8)', 'rgba(239,68,68,0.4)');
    } else if (state.speaking) {
      drawAnalyserWave('rgba(6,182,212,0.8)', 'rgba(139,92,246,0.6)');
    } else {
      idleTime += 16;
      drawIdleWave(idleTime);
    }
    state.animFrameId = requestAnimationFrame(animLoop);
  }
  animLoop();

  // ─── Activity Feed ───
  function addTranscript(type, html) {
    const labels = { user: 'You', system: 'Test12', error: 'Error', reading: 'Reading' };
    const div = document.createElement('div');
    div.className = `transcript-item transcript-item--${type}`;
    div.innerHTML = `<span class="transcript-badge">${labels[type] || type}</span><p>${html}</p>`;
    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
  }

  function setStatus(text) { statusText.textContent = text; }

  // ─── TTS ───
  async function speak(text) {
    if (!text || text.trim().length === 0) return;
    const mySession = ++state.speakSession;
    // Hold `speaking` true across the entire speak() call so a mic tap in the
    // microtask gap between chunks still routes through stopSpeaking() instead
    // of falling through to startRecording().
    state.speaking = true;
    setStatus('Speaking...');
    vizLabel.textContent = 'Speaking';
    vizLabel.className = 'visualizer-label speaking';
    const maxLen = 800;
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxLen) { chunks.push(remaining); break; }
      let cut = remaining.lastIndexOf('.', maxLen);
      if (cut < maxLen * 0.3) cut = remaining.lastIndexOf(' ', maxLen);
      if (cut < 10) cut = maxLen;
      chunks.push(remaining.substring(0, cut + 1).trim());
      remaining = remaining.substring(cut + 1).trim();
    }
    try {
      for (const chunk of chunks) {
        if (mySession !== state.speakSession) return; // cancelled
        await speakChunk(chunk, mySession);
        if (mySession !== state.speakSession) return; // cancelled mid-chunk
      }
    } finally {
      // Only the speak() that owns the current session may clear `speaking`.
      // If stopSpeaking() bumped the session, it already cleared the visuals.
      if (mySession === state.speakSession) {
        state.speaking = false;
        vizLabel.textContent = 'Idle';
        vizLabel.className = 'visualizer-label';
        setStatus('Ready');
      }
    }
  }

  function speakChunk(text, mySession) {
    return new Promise(async (resolve) => {
      try {
        const resp = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice_id: state.voice }),
        });

        // Cancelled while the fetch was in flight — don't allocate audio or play.
        if (mySession !== state.speakSession) { resolve(); return; }

        if (!resp.ok) { resolve(); return; }

        const blob = await resp.blob();
        if (mySession !== state.speakSession) { resolve(); return; }

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        state.currentAudio = audio;

        try {
          if (!state.audioContext) state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const source = state.audioContext.createMediaElementSource(audio);
          state.analyser = state.audioContext.createAnalyser();
          state.analyser.fftSize = 2048;
          source.connect(state.analyser);
          state.analyser.connect(state.audioContext.destination);
        } catch (e) { /* analyser optional */ }

        const cleanup = () => {
          if (state.currentAudio === audio) state.currentAudio = null;
          URL.revokeObjectURL(url);
        };
        audio.onended = () => { cleanup(); resolve(); };
        audio.onerror = () => { cleanup(); resolve(); };

        // Final session check — if the user tapped between the blob read and
        // play() (cheap path, but still possible), don't start the audio.
        if (mySession !== state.speakSession) { cleanup(); resolve(); return; }
        audio.play().catch(() => { cleanup(); resolve(); });
      } catch (e) {
        resolve();
      }
    });
  }

  function stopSpeaking() {
    state.speakSession++; // invalidates any in-flight speak() loop
    if (state.currentAudio) {
      try { state.currentAudio.pause(); } catch (_) {}
      try { state.currentAudio.currentTime = 0; } catch (_) {}
      // Drop the source so the element can't resume playback. Some browsers
      // keep a paused MediaElementSource feeding the audio graph until the
      // element is detached from its source.
      try { state.currentAudio.src = ''; } catch (_) {}
      try { state.currentAudio.load(); } catch (_) {}
      state.currentAudio = null;
    }
    state.speaking = false;
    vizLabel.textContent = 'Idle';
    vizLabel.className = 'visualizer-label';
    setStatus('Ready');
  }

  // ─── STT (Recording) ───
  async function startRecording() {
    if (state.speaking) stopSpeaking();
    if (state.recording && state.mediaRecorder) {
      state.mediaRecorder.stop();
      state.recording = false;
    }
    const session = ++state.recordingSession;
    resetMicVisuals();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session !== state.recordingSession) { stream.getTracks().forEach(t => t.stop()); return; }
      state.audioChunks = [];

      if (!state.audioContext) state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = state.audioContext.createMediaStreamSource(stream);
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 2048;
      source.connect(state.analyser);

      state.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      state.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) state.audioChunks.push(e.data); };
      state.mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(state.audioChunks, { type: 'audio/webm' });
        await processAudio(blob, session);
      };

      state.mediaRecorder.start();
      state.recording = true;
      micBtn.classList.add('recording');
      micIconRecord.style.display = 'none';
      micIconStop.style.display = 'block';
      micHint.textContent = 'Listening… tap to stop';
      vizLabel.textContent = 'Recording';
      vizLabel.className = 'visualizer-label recording';
      setStatus('Listening...');
    } catch (e) {
      addTranscript('error', 'Microphone access denied. Please allow microphone permissions.');
      state.flow = FLOW.IDLE;
      resetMicVisuals();
    }
  }

  function stopRecording() {
    if (!state.recording || !state.mediaRecorder) return;
    state.mediaRecorder.stop();
    state.recording = false;
    micBtn.classList.remove('recording');
    micBtn.classList.add('processing');
    micIconRecord.style.display = 'block';
    micIconStop.style.display = 'none';
    micHint.textContent = 'Processing...';
    vizLabel.textContent = 'Processing';
    vizLabel.className = 'visualizer-label processing';
    setStatus('Transcribing...');
  }

  async function processAudio(blob, session) {
    // Helper: when STT fails (empty/error), restore the prior conversational
    // state so the user can simply tap the mic and try again — instead of
    // being silently kicked back to "record a new post".
    function recoverFlowAfterSttFailure() {
      switch (state.flow) {
        case FLOW.PROCESSING_REPLY_PROMPT:  state.flow = FLOW.AWAITING_REPLY_PROMPT;  break;
        case FLOW.PROCESSING_REPLY_TARGET:  state.flow = FLOW.AWAITING_REPLY_TARGET;  break;
        case FLOW.PROCESSING_CONFIRM:       state.flow = FLOW.AWAITING_CONFIRM;       break;
        default:                            state.flow = FLOW.IDLE;
      }
    }
    try {
      const formData = new FormData();
      formData.append('file', blob, 'recording.webm');
      const resp = await fetch('/api/stt', { method: 'POST', body: formData });
      if (session !== state.recordingSession) return;
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.details || `STT failed: ${resp.status}`);
      }
      const data = await resp.json();
      if (session !== state.recordingSession) return;
      const text = (data.text || '').trim();
      if (!text) {
        addTranscript('error', 'I didn\'t catch that. Please try again.');
        await speak('I didn\'t catch that. Please tap the mic and try again.');
        recoverFlowAfterSttFailure();
        resetMicVisuals();
        return;
      }
      addTranscript('user', escapeHtml(text));
      // Dispatch by current flow
      if (state.flow === FLOW.PROCESSING_POST) {
        await handlePostUtterance(text);
      } else if (state.flow === FLOW.PROCESSING_CONFIRM) {
        await handleConfirmUtterance(text);
      } else if (state.flow === FLOW.PROCESSING_REPLY_PROMPT) {
        await handleReplyPromptUtterance(text);
      } else if (state.flow === FLOW.PROCESSING_REPLY_TARGET) {
        await handleReplyTargetUtterance(text);
      } else {
        // Defensive: shouldn't happen, but reset
        state.flow = FLOW.IDLE;
      }
    } catch (e) {
      if (session === state.recordingSession) {
        addTranscript('error', `Speech recognition failed: ${escapeHtml(e.message)}`);
        recoverFlowAfterSttFailure();
      }
    }
    if (session === state.recordingSession) resetMicVisuals();
  }

  function resetMicVisuals() {
    micBtn.classList.remove('processing', 'recording');
    micIconRecord.style.display = 'block';
    micIconStop.style.display = 'none';
    micHint.textContent = micHintForFlow();
    vizLabel.textContent = 'Idle';
    vizLabel.className = 'visualizer-label';
    setStatus('Ready');
  }

  function micHintForFlow() {
    switch (state.flow) {
      case FLOW.AWAITING_CONFIRM:       return 'Tap and say "confirm" to post';
      case FLOW.AUTO_READING:            return 'Tap to stop reading';
      case FLOW.AWAITING_REPLY_PROMPT:   return 'Tap and say "yes" or "no"';
      case FLOW.AWAITING_REPLY_TARGET:   return 'Tap and say a post number';
      default:
        return state.replyTo ? 'Tap to record your reply' : 'Tap to speak';
    }
  }

  // ─── Flow handlers ───
  async function handlePostUtterance(text) {
    setStatus('Understanding...');
    let parsed = null;
    try {
      const resp = await fetch('/api/parse-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, defaultAuthor: state.author }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      parsed = await resp.json();
    } catch (e) {
      addTranscript('error', `Couldn't parse your post: ${escapeHtml(e.message)}`);
      await speak('Sorry, I couldn\'t understand. Tap the mic and try again.');
      state.flow = FLOW.IDLE;
      return;
    }

    const name = (parsed?.name || '').trim();
    const message = (parsed?.message || '').trim();

    if (!message) {
      addTranscript('system', 'I didn\'t hear a message. Tap the mic and say your name and what you want to post.');
      await speak('I didn\'t hear a message. Tap the mic and say your name and what you want to post.');
      state.flow = FLOW.IDLE;
      return;
    }

    if (!name) {
      addTranscript('system', 'I didn\'t catch your name. Tap the mic and say <strong>"my name is …"</strong> followed by your message.');
      await speak('I didn\'t catch your name. Tap the mic and say my name is, then your message.');
      state.flow = FLOW.IDLE;
      return;
    }

    const parentId = state.replyTo ? state.replyTo.id : null;
    state.pendingPost = { name, message, parentId };
    if (authorInput) authorInput.value = name;
    setAuthor(name);

    const replyContext = state.replyTo
      ? ` as a reply to <strong>${escapeHtml(state.replyTo.author)}</strong>`
      : '';
    addTranscript(
      'system',
      `Got it. Posting${replyContext} as <strong>${escapeHtml(name)}</strong>: <em>"${escapeHtml(message)}"</em>.<br>Tap the mic and say <strong>"confirm"</strong> to post, or <strong>"cancel"</strong> to discard.`,
    );
    state.flow = FLOW.AWAITING_CONFIRM;
    const spokenContext = state.replyTo ? ` as a reply to ${state.replyTo.author}` : '';
    await speak(
      `I heard a post${spokenContext} from ${name} saying: ${message}. Please tap the mic and say confirm to post, or cancel to discard.`,
    );
    resetMicVisuals();
  }

  async function handleConfirmUtterance(text) {
    const lc = text.toLowerCase().trim().replace(/[.!?,]+$/g, '');
    const isConfirm = /\b(confirm|confirmed|yes|yep|yeah|ok(ay)?|sure|post(\s+it)?|publish|do it|go ahead)\b/.test(lc);
    const isCancel = /\b(cancel|cancelled|no|nope|stop|discard|don'?t|dont|abort|never\s*mind)\b/.test(lc);

    if (isCancel && !isConfirm) {
      state.pendingPost = null;
      addTranscript('system', 'Cancelled. Tap the mic to start a new post.');
      await speak('Cancelled. Tap the mic to start a new post.');
      state.flow = FLOW.IDLE;
      resetMicVisuals();
      return;
    }

    if (!isConfirm) {
      addTranscript(
        'system',
        'I need a clear <strong>"confirm"</strong> or <strong>"cancel"</strong>. Tap the mic and try again.',
      );
      await speak('I need a clear confirm or cancel. Tap the mic and try again.');
      // Stay in AWAITING_CONFIRM
      state.flow = FLOW.AWAITING_CONFIRM;
      resetMicVisuals();
      return;
    }

    const post = state.pendingPost;
    state.pendingPost = null;
    if (!post) {
      state.flow = FLOW.IDLE;
      resetMicVisuals();
      return;
    }

    state.flow = FLOW.POSTING;
    setStatus('Posting...');
    try {
      const body = { text: post.message, author: post.name };
      if (post.parentId) body.parent_id = post.parentId;
      const resp = await fetch('/api/voice-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.details || err.error || `HTTP ${resp.status}`);
      }
      let newPost = null;
      try { newPost = (await resp.json()).post; } catch (_) {}

      const wasReply = !!post.parentId;
      // Top-level post — prepend to the list. Reply — refetch so the parent's
      // replies tree gets the new node in the right place.
      if (wasReply) {
        await fetchPostsAndRender();
      } else if (newPost) {
        state.lastFetchedPosts = [{ ...newPost, replies: [] }, ...(state.lastFetchedPosts || [])];
        renderPosts(state.lastFetchedPosts, null);
      } else {
        await fetchPostsAndRender();
      }

      const replyHtml = wasReply ? ` (reply to <strong>${escapeHtml(state.replyTo?.author || '')}</strong>)` : '';
      addTranscript(
        'system',
        `Posted${replyHtml} as <strong>${escapeHtml(post.name)}</strong>: <em>${escapeHtml(post.message)}</em>`,
      );
      const replySpoken = wasReply ? ` as a reply to ${state.replyTo?.author || ''}` : '';
      await speak(`Posted${replySpoken}. ${post.name} says: ${post.message}`);
      clearReplyTarget();
    } catch (e) {
      addTranscript('error', `Failed to post: ${escapeHtml(e.message)}`);
      await speak(`Sorry, I couldn't post your message. ${e.message}`);
    } finally {
      state.flow = FLOW.IDLE;
      setStatus('Ready');
      resetMicVisuals();
    }
  }

  // ─── Reply target management ───
  function setReplyTarget(post) {
    if (!post) { clearReplyTarget(); return; }
    state.replyTo = post;
    if (composeParentInput) composeParentInput.value = String(post.id);
    if (replyBanner && replyBannerText) {
      replyBannerText.innerHTML =
        `Replying to <strong>${escapeHtml(post.author)}</strong>: <em>${escapeHtml(truncate(post.text, 80))}</em>`;
      replyBanner.classList.add('visible');
    }
    if (composeInput) composeInput.placeholder = `Reply to ${post.author}…`;
    micHint.textContent = micHintForFlow();
  }

  function clearReplyTarget() {
    state.replyTo = null;
    if (composeParentInput) composeParentInput.value = '';
    if (replyBanner) replyBanner.classList.remove('visible');
    if (composeInput) composeInput.placeholder = "What's happening? (or use the mic above)";
    micHint.textContent = micHintForFlow();
  }

  function truncate(s, n) {
    s = String(s || '');
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
  }

  // ─── Reply voice flow handlers ───
  // After the auto-read finishes, we ask "do you want to reply?". The user
  // taps the mic and answers; this routes their answer.
  async function handleReplyPromptUtterance(text) {
    const lc = text.toLowerCase().trim().replace(/[.!?,]+$/g, '');
    const yes = /\b(yes|yeah|yep|sure|ok(ay)?|reply|i do|please)\b/.test(lc);
    const no  = /\b(no|nope|nah|skip|cancel|not now|don'?t|dont)\b/.test(lc);
    if (no && !yes) {
      addTranscript('system', 'Okay. Tap the mic to record a new post.');
      await speak('Okay. Tap the mic to record a new post.');
      state.flow = FLOW.IDLE;
      resetMicVisuals();
      return;
    }
    if (!yes) {
      addTranscript('system', 'I need a clear <strong>"yes"</strong> or <strong>"no"</strong>. Tap the mic and try again.');
      await speak('I need a clear yes or no. Tap the mic and try again.');
      state.flow = FLOW.AWAITING_REPLY_PROMPT;
      resetMicVisuals();
      return;
    }
    const eligible = state.numberedPosts.filter((p) => (p.level || 1) < MAX_LEVEL);
    if (eligible.length === 0) {
      addTranscript('system', 'There are no posts available to reply to. Tap the mic to record a new post.');
      await speak('There are no posts available to reply to. Tap the mic to record a new post.');
      state.flow = FLOW.IDLE;
      resetMicVisuals();
      return;
    }
    addTranscript(
      'system',
      'Please say the <strong>name of the person</strong> whose post you want to reply to, and a few words from their post.',
    );
    state.flow = FLOW.AWAITING_REPLY_TARGET;
    await speak('Please say the name of the person whose post you want to reply to, and a few words from their post.');
    resetMicVisuals();
  }

  async function handleReplyTargetUtterance(text) {
    const lc = text.toLowerCase();
    if (/\b(cancel|stop|never\s*mind|forget it)\b/.test(lc)) {
      addTranscript('system', 'Reply cancelled.');
      await speak('Reply cancelled. Tap the mic to record a new post.');
      state.flow = FLOW.IDLE;
      resetMicVisuals();
      return;
    }
    const eligible = state.numberedPosts.filter((p) => (p.level || 1) < MAX_LEVEL);
    if (eligible.length === 0) {
      state.flow = FLOW.IDLE;
      resetMicVisuals();
      return;
    }
    setStatus('Matching...');
    let matched = null;
    try {
      const resp = await fetch('/api/match-reply-target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          candidates: eligible.map((p) => ({ id: p.id, author: p.author, text: p.text, level: p.level })),
        }),
      });
      if (resp.ok) {
        const result = await resp.json();
        if (result?.id) matched = eligible.find((p) => p.id === result.id) || null;
      }
    } catch (_) { /* fall through to local fallback */ }
    if (!matched) {
      const needle = text.toLowerCase();
      matched = eligible.find((p) => needle.includes(String(p.author).toLowerCase()))
        || eligible.find((p) => String(p.text).toLowerCase().split(/\s+/)
            .some((w) => w.length > 3 && needle.includes(w)));
    }
    if (!matched) {
      addTranscript('system', `I couldn't find a matching post. Try saying the author's name, or say <strong>"cancel"</strong>.`);
      await speak(`I couldn't find a matching post. Please say the author's name, or say cancel.`);
      state.flow = FLOW.AWAITING_REPLY_TARGET;
      resetMicVisuals();
      return;
    }
    setReplyTarget(matched);
    addTranscript(
      'system',
      `Replying to <strong>${escapeHtml(matched.author)}</strong>: <em>${escapeHtml(truncate(matched.text, 120))}</em>.<br>Tap the mic and say <strong>your name and your reply</strong>.`,
    );
    await speak(`Replying to ${matched.author}, who said: ${truncate(matched.text, 120)}. Now tap the mic and say your name and your reply.`);
    state.flow = FLOW.IDLE;
    resetMicVisuals();
  }

  // Parse spoken numerals: "two", "post 2", "number 3", or just "3".
  function parseSpokenNumber(text) {
    const lc = String(text || '').toLowerCase();
    const wordMap = {
      one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
      sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
      first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
      sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
    };
    for (const [word, n] of Object.entries(wordMap)) {
      if (new RegExp(`\\b${word}\\b`).test(lc)) return n;
    }
    const m = lc.match(/\b(\d{1,3})\b/);
    if (m) return parseInt(m[1], 10);
    return null;
  }

  // ─── Mic button — single entry point, dispatches by flow ───
  async function onMicClick() {
    // If the very first user interaction landed on the mic button, the
    // global pointerdown handler has already kicked off auto-read. Don't
    // immediately stop it with this same tap.
    if (state.suppressNextMicClick) {
      state.suppressNextMicClick = false;
      return;
    }

    // If we are recording, stop the recording (regardless of flow)
    if (state.recording) {
      if (state.flow === FLOW.RECORDING_POST) state.flow = FLOW.PROCESSING_POST;
      else if (state.flow === FLOW.RECORDING_CONFIRM) state.flow = FLOW.PROCESSING_CONFIRM;
      else if (state.flow === FLOW.RECORDING_REPLY_PROMPT) state.flow = FLOW.PROCESSING_REPLY_PROMPT;
      else if (state.flow === FLOW.RECORDING_REPLY_TARGET) state.flow = FLOW.PROCESSING_REPLY_TARGET;
      stopRecording();
      return;
    }

    // If TTS is playing (auto-read or any other), stop it first
    if (state.speaking) {
      stopSpeaking();
      // If we were auto-reading, we just stop and go idle (don't auto-record)
      if (state.flow === FLOW.AUTO_READING) {
        state.flow = FLOW.IDLE;
        resetMicVisuals();
        addTranscript('system', 'Reading stopped. Tap the mic again to record a post.');
        return;
      }
      if (state.flow === FLOW.AWAITING_REPLY_PROMPT || state.flow === FLOW.AWAITING_REPLY_TARGET) {
        // User interrupts TTS during a reply prompt — just go straight to recording.
      } else {
        // Fall through to start a new recording in the appropriate mode
      }
    }

    // Start a recording in the right mode based on current flow
    if (state.flow === FLOW.AWAITING_CONFIRM) {
      state.flow = FLOW.RECORDING_CONFIRM;
      await startRecording();
    } else if (state.flow === FLOW.AWAITING_REPLY_PROMPT) {
      state.flow = FLOW.RECORDING_REPLY_PROMPT;
      await startRecording();
    } else if (state.flow === FLOW.AWAITING_REPLY_TARGET) {
      state.flow = FLOW.RECORDING_REPLY_TARGET;
      await startRecording();
    } else {
      state.flow = FLOW.RECORDING_POST;
      await startRecording();
    }
  }

  // ─── Voice Posts (data + rendering) ───
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function formatPostDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
  }

  function loadAuthor() {
    try {
      state.author = (localStorage.getItem(AUTHOR_STORAGE_KEY) || '').trim();
    } catch (_) { state.author = ''; }
    if (authorInput) authorInput.value = state.author;
  }

  function setAuthor(name) {
    const clean = String(name || '').trim().slice(0, 120);
    state.author = clean;
    try { localStorage.setItem(AUTHOR_STORAGE_KEY, clean); } catch (_) {}
  }

  async function fetchPostsAndRender() {
    try {
      const resp = await fetch('/api/voice-posts?limit=200');
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        renderPosts([], err.error || `HTTP ${resp.status}`);
        return [];
      }
      const { posts } = await resp.json();
      renderPosts(posts, null);
      return posts;
    } catch (e) {
      renderPosts([], e.message);
      return [];
    }
  }

  // Walk a tree of posts depth-first, producing a flat list aligned with the
  // numbered order spoken during auto-read. Each entry has a stable "1.2.1"
  // style label so we can address replies by number without confusion.
  function flattenForNumbering(posts) {
    const out = [];
    function walk(p, label) {
      out.push({ ...p, label });
      const replies = Array.isArray(p.replies) ? p.replies : [];
      replies.forEach((child, idx) => walk(child, `${label}.${idx + 1}`));
    }
    posts.forEach((p, idx) => walk(p, String(idx + 1)));
    return out;
  }

  function renderPostNode(post, depth) {
    const div = document.createElement('div');
    div.className = depth > 0 ? 'post-item post-item--reply' : 'post-item';
    const canReply = (post.level || 1) < MAX_LEVEL;
    const numberBadge = post._label ? `<span class="post-item__index">${escapeHtml(post._label)}</span>` : '';
    div.innerHTML = `
      <div class="post-item__header">
        <span>${numberBadge}<span class="post-item__author">${escapeHtml(post.author)}</span></span>
        <span class="post-item__date">${escapeHtml(formatPostDate(post.date))}</span>
      </div>
      <p class="post-item__text">${escapeHtml(post.text)}</p>
      <div class="post-item__footer">
        ${canReply ? `
          <button type="button" class="post-reply-btn" data-reply-to="${post.id}" aria-label="Reply to ${escapeHtml(post.author)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
            </svg>
            Reply
          </button>` : ''}
      </div>
    `;
    if ((post.replies || []).length > 0) {
      const wrap = document.createElement('div');
      wrap.className = 'post-replies';
      post.replies.forEach((child) => wrap.appendChild(renderPostNode(child, depth + 1)));
      div.appendChild(wrap);
    }
    return div;
  }

  function renderPosts(posts, errorMsg) {
    if (!postsList) return;
    if (errorMsg) {
      postsList.innerHTML = `<p class="posts-empty">Posts unavailable: ${escapeHtml(errorMsg)}.</p>`;
      return;
    }
    if (!posts || posts.length === 0) {
      postsList.innerHTML = '<p class="posts-empty">No voice posts yet. Tap the mic to record your first one.</p>';
      return;
    }
    // Stamp display labels (1, 1.1, 2, …) onto a copy of the tree.
    const labeled = JSON.parse(JSON.stringify(posts));
    const flat = flattenForNumbering(labeled);
    state.numberedPosts = flat;
    // Re-attach _label by id since stringify dropped no info but we need lookup.
    const labelById = new Map(flat.map((p) => [p.id, p.label]));
    function applyLabels(node) {
      node._label = labelById.get(node.id);
      (node.replies || []).forEach(applyLabels);
    }
    labeled.forEach(applyLabels);

    postsList.innerHTML = '';
    labeled.forEach((post) => postsList.appendChild(renderPostNode(post, 0)));

    postsList.querySelectorAll('.post-reply-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-reply-to'), 10);
        const target = state.numberedPosts.find((p) => p.id === id);
        if (!target) return;
        // If the user is mid voice-prompt (AWAITING_REPLY_PROMPT/TARGET), short-
        // circuit to IDLE so the next mic tap starts recording the reply.
        if (state.speaking) stopSpeaking();
        if (
          state.flow === FLOW.AWAITING_REPLY_PROMPT ||
          state.flow === FLOW.AWAITING_REPLY_TARGET ||
          state.flow === FLOW.AUTO_READING
        ) {
          state.flow = FLOW.IDLE;
        }
        setReplyTarget(target);
        if (composeInput) composeInput.focus();
      });
    });
  }

  // Build the spoken script for the feed. The speaker only reads the
  // original (top-level / level-1) posts; replies are visible in the UI
  // but not narrated on auto-read.
  function buildAutoReadScript() {
    const parts = [];
    state.numberedPosts
      .filter((p) => (p.level || 1) === 1)
      .forEach((p) => {
        parts.push(`Post ${p.label}, from ${p.author}: ${p.text}.`);
      });
    return parts.join(' ');
  }

  async function autoReadAllPosts(posts) {
    state.numberedPosts = flattenForNumbering(posts || []);
    console.log('[reply-flow] autoReadAllPosts start; postCount =', (posts || []).length);
    if (!Array.isArray(posts) || posts.length === 0) {
      console.log('[reply-flow] no posts → empty-state, skipping reply prompt');
      state.flow = FLOW.AUTO_READING;
      resetMicVisuals();
      await speak('No voice posts yet. Tap the mic and say your name and message to record the first one.');
      if (state.flow === FLOW.AUTO_READING) {
        state.flow = FLOW.IDLE;
        resetMicVisuals();
      }
      return;
    }
    state.flow = FLOW.AUTO_READING;
    resetMicVisuals();
    await speak(buildAutoReadScript());
    console.log('[reply-flow] auto-read finished; flow =', state.flow);
    // Only skip the prompt if the user actively jumped into a recording flow.
    const busy = [
      FLOW.RECORDING_POST, FLOW.PROCESSING_POST,
      FLOW.RECORDING_CONFIRM, FLOW.PROCESSING_CONFIRM, FLOW.AWAITING_CONFIRM,
      FLOW.RECORDING_REPLY_PROMPT, FLOW.PROCESSING_REPLY_PROMPT,
      FLOW.RECORDING_REPLY_TARGET, FLOW.PROCESSING_REPLY_TARGET,
      FLOW.POSTING,
    ];
    if (busy.includes(state.flow)) {
      console.log('[reply-flow] busy flow, skipping prompt:', state.flow);
      return;
    }
    const eligible = state.numberedPosts.filter((p) => (p.level || 1) < MAX_LEVEL);
    console.log('[reply-flow] eligible-for-reply count =', eligible.length);
    if (eligible.length === 0) {
      state.flow = FLOW.IDLE;
      resetMicVisuals();
      return;
    }
    addTranscript(
      'system',
      `Do you want to reply to one of these posts? Tap the mic and say <strong>"yes"</strong> or <strong>"no"</strong>.`,
    );
    state.flow = FLOW.AWAITING_REPLY_PROMPT;
    console.log('[reply-flow] speaking reply prompt now');
    await speak('Do you want to reply to one of these posts? Tap the mic and say yes or no.');
    console.log('[reply-flow] reply prompt spoken; flow =', state.flow);
    resetMicVisuals();
  }

  // ─── Event Listeners ───
  micBtn.addEventListener('click', onMicClick);

  voiceSelect.addEventListener('change', (e) => {
    state.voice = e.target.value;
    addTranscript('system', `Voice changed to <strong>${escapeHtml(e.target.value)}</strong>`);
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      micBtn.click();
    }
  });

  if (authorInput) {
    authorInput.addEventListener('input', (e) => setAuthor(e.target.value));
  }

  if (composeForm) {
    composeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      composeError.style.display = 'none';
      const text = composeInput.value.trim();
      if (!text) return;
      const author = (authorInput?.value || state.author || '').trim();
      if (!author) {
        composeError.textContent = 'Set a display name first.';
        composeError.style.display = 'block';
        return;
      }

      // Stop any ongoing TTS (e.g. auto-read) so the new post is heard cleanly.
      if (state.speaking) stopSpeaking();

      const parentId = state.replyTo ? state.replyTo.id : null;

      composeBtn.disabled = true;
      try {
        const body = { text, author };
        if (parentId) body.parent_id = parentId;
        const resp = await fetch('/api/voice-posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.details || err.error || `HTTP ${resp.status}`);
        }
        let newPost = null;
        try { newPost = (await resp.json()).post; } catch (_) {}

        if (parentId) {
          // Refetch so the reply appears nested under its parent.
          await fetchPostsAndRender();
        } else if (newPost) {
          state.lastFetchedPosts = [{ ...newPost, replies: [] }, ...(state.lastFetchedPosts || [])];
          renderPosts(state.lastFetchedPosts, null);
        } else {
          await fetchPostsAndRender();
        }

        const replyHtml = parentId ? ` (reply to <strong>${escapeHtml(state.replyTo.author)}</strong>)` : '';
        addTranscript('system', `Posted${replyHtml} as <strong>${escapeHtml(author)}</strong>: <em>${escapeHtml(text)}</em>`);
        composeInput.value = '';
        const replySpoken = parentId ? ` as a reply to ${state.replyTo.author}` : '';
        speak(`Posted${replySpoken}. ${author} says: ${text}`);
        clearReplyTarget();
      } catch (err) {
        composeError.textContent = `Failed to post: ${err.message}`;
        composeError.style.display = 'block';
      } finally {
        composeBtn.disabled = false;
      }
    });
  }

  if (replyBannerCancel) {
    replyBannerCancel.addEventListener('click', () => {
      clearReplyTarget();
      addTranscript('system', 'Reply cancelled.');
    });
  }

  if (refreshPostsBtn) {
    refreshPostsBtn.addEventListener('click', () => fetchPostsAndRender());
  }

  // Detect whether the browser will let us play audio without a user gesture.
  // Uses a 1-byte silent WAV (no network round-trip).
  function canAutoplay() {
    return new Promise((resolve) => {
      try {
        const a = new Audio();
        a.muted = false;
        a.volume = 0;
        a.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        const p = a.play();
        if (p === undefined) { resolve(true); return; }
        p.then(() => { try { a.pause(); } catch (_) {} resolve(true); })
         .catch(() => resolve(false));
      } catch (_) { resolve(false); }
    });
  }

  function setupDeferredAutoRead() {
    pageUrl.textContent = 'Tap anywhere to play all posts';
    micHint.textContent = 'Tap anywhere to start';
    document.addEventListener('pointerdown', async function firstTap(ev) {
      if (state.autoReadStarted) return;
      state.autoReadStarted = true;
      if (ev.target && ev.target.closest && ev.target.closest('#mic-button')) {
        state.suppressNextMicClick = true;
      }
      try {
        if (!state.audioContext) state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (state.audioContext.state === 'suspended') await state.audioContext.resume();
      } catch (_) {}
      pageUrl.textContent = 'Tap the mic and say your name and message';
      micHint.textContent = micHintForFlow();
      await autoReadAllPosts(state.lastFetchedPosts);
    }, { capture: true, once: true });
  }

  // ─── Init ───
  async function init() {
    loadAuthor();
    setStatus('Loading posts...');
    const posts = await fetchPostsAndRender();
    setStatus('Ready');
    state.lastFetchedPosts = posts;

    // Try to start TTS right away. If the browser permits autoplay
    // (e.g. the user has interacted with this origin before), we just speak.
    // Otherwise fall back to a one-time "tap anywhere" listener.
    const allowed = await canAutoplay();
    if (allowed) {
      state.autoReadStarted = true;
      await autoReadAllPosts(posts);
    } else {
      setupDeferredAutoRead();
    }
  }

  init();
})();
