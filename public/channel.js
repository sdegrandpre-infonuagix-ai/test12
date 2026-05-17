/**
 * channel.js — Private Voice Chat Channel Client
 * Uses API Gateway WebSocket for real-time messaging
 * xAI Voice Agent WebSocket API for voice input
 * TTS for reading incoming messages aloud
 */
'use strict';

// ── DOM Elements ──
const joinOverlay    = document.getElementById('join-overlay');
const joinNameInput  = document.getElementById('join-name-input');
const joinBtn        = document.getElementById('join-btn');
const joinError      = document.getElementById('join-error');
const joinChannelName = document.getElementById('join-channel-name');

const channelNameEl  = document.getElementById('channel-name');
const channelIdEl    = document.getElementById('channel-id-display');
const channelCreatedByEl = document.getElementById('channel-created-by');
const userCountText  = document.getElementById('user-count-text');

const messagesArea   = document.getElementById('messages-area');
const composeInput   = document.getElementById('compose-input');
const voiceBtn       = document.getElementById('voice-btn');
const sendBtn        = document.getElementById('send-btn');
const shareBtn       = document.getElementById('share-btn');
const voiceStatus    = document.getElementById('voice-status');
const voiceStatusText = document.getElementById('voice-status-text');
const toast          = document.getElementById('toast');

// ── State ──
const channelId = window.location.pathname.split('/').pop();
let myName = '';
let lastMessageId = 0;
let channelWs = null;  // API Gateway WebSocket for chat
let wsUrl = null;      // WebSocket URL from server
let reconnectTimer = null;
let isRecording = false;
let mediaStream = null;
let ttsQueue = [];
let isSpeaking = false;
const renderedMsgIds = new Set(); // dedup: track already-rendered message IDs

// ── Init ──
(async function init() {
  // Load channel info
  try {
    const res = await fetch(`/api/channels/${channelId}`);
    if (!res.ok) {
      joinChannelName.textContent = 'Channel not found';
      joinBtn.disabled = true;
      joinError.textContent = 'This channel does not exist or has been deleted.';
      joinError.style.display = 'block';
      return;
    }
    const data = await res.json();
    channelNameEl.textContent = data.channel.name;
    channelIdEl.textContent = channelId;
    channelCreatedByEl.textContent = `by ${data.channel.created_by}`;
    joinChannelName.textContent = data.channel.name;
    document.title = `${data.channel.name} — Test12`;
    userCountText.textContent = `${data.userCount}/2`;
    wsUrl = data.wsUrl; // WebSocket URL from server
  } catch (err) {
    console.error('Failed to load channel:', err);
  }

  // Check saved name
  const saved = sessionStorage.getItem(`channel_name_${channelId}`);
  if (saved) {
    myName = saved;
    joinChannel(myName);
  }

  // Join flow
  joinBtn.addEventListener('click', () => {
    const name = joinNameInput.value.trim();
    if (!name) { joinNameInput.focus(); return; }
    joinChannel(name);
  });

  joinNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); joinBtn.click(); }
  });

  // Compose
  composeInput.addEventListener('input', () => {
    sendBtn.disabled = !composeInput.value.trim();
    autoResize(composeInput);
  });

  composeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  sendBtn.addEventListener('click', sendMessage);

  // Voice
  voiceBtn.addEventListener('click', toggleVoice);

  // Share
  shareBtn.addEventListener('click', () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => showToast('Channel link copied!')).catch(() => showToast('Copy failed'));
  });

  // Cleanup on page leave
  window.addEventListener('beforeunload', leaveChannel);
})();

// ── Join Channel ──
async function joinChannel(name) {
  try {
    joinBtn.disabled = true;
    joinError.style.display = 'none';

    myName = name;
    sessionStorage.setItem(`channel_name_${channelId}`, name);

    // Mic permission will be requested when user taps the mic button

    joinOverlay.classList.add('hidden');

    // Load existing messages
    await loadMessages();

    // Start polling for new messages (reliable push)
    startPolling();

    // Also try WebSocket for faster delivery
    connectWebSocket();

    // Add system message
    addSystemMessage(`You joined as ${name}`);

  } catch (err) {
    joinError.textContent = 'Connection error: ' + err.message;
    joinError.style.display = 'block';
    joinBtn.disabled = false;
  }
}

// ── Leave Channel ──
function leaveChannel() {
  if (channelWs && channelWs.readyState === WebSocket.OPEN) {
    channelWs.close();
  }
  cleanupMedia();
}

// ── Load Messages ──
async function loadMessages() {
  try {
    const res = await fetch(`/api/channels/${channelId}/messages`);
    const data = await res.json();
    if (data.messages?.length) {
      messagesArea.innerHTML = '';
      data.messages.forEach(msg => {
        renderedMsgIds.add(msg.id);
        renderMessage(msg, false);
      });
      lastMessageId = data.messages[data.messages.length - 1].id;
      scrollToBottom();
    }
  } catch (err) {
    console.error('Failed to load messages:', err);
  }
}

// ── WebSocket (real-time via API Gateway) ──
function connectWebSocket() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (channelWs) { channelWs.close(); channelWs = null; }

  if (!wsUrl) {
    console.warn('No WebSocket URL available, falling back to polling');
    startPolling();
    return;
  }

  const url = `${wsUrl}?channelId=${encodeURIComponent(channelId)}&author=${encodeURIComponent(myName)}`;
  console.log('[ws] Connecting to', url);
  channelWs = new WebSocket(url);

  channelWs.onopen = () => {
    console.log('[ws] Connected');
    showToast('Connected');
  };

  channelWs.onmessage = (e) => {
    try {
      const { event, data } = JSON.parse(e.data);

      switch (event) {
        case 'message':
          if (data.id > lastMessageId) lastMessageId = data.id;
          // Only render if not already shown (avoids WS + REST race duplication)
          if (!renderedMsgIds.has(data.id)) {
            renderedMsgIds.add(data.id);
            renderMessage(data, true);
            scrollToBottom();
            if (data.author !== myName) speakMessage(data);
          }
          break;

        case 'user_joined':
          userCountText.textContent = `${data.userCount}/2`;
          if (data.author !== myName) {
            addSystemMessage(`${data.author} joined the channel`);
          }
          break;

        case 'user_left':
          userCountText.textContent = `${data.userCount}/2`;
          if (data.author !== myName) {
            addSystemMessage(`${data.author} left the channel`);
          }
          break;
      }
    } catch (err) {
      console.error('[ws] Parse error:', err);
    }
  };

  channelWs.onclose = (e) => {
    console.log('[ws] Disconnected, code:', e.code);
    if (myName) {
      reconnectTimer = setTimeout(connectWebSocket, 3000);
    }
  };

  channelWs.onerror = (e) => {
    console.error('[ws] Error:', e);
  };
}

// ── Polling for new messages (always-on, reliable push) ──
let pollInterval = null;

function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/channels/${channelId}/messages?after_id=${lastMessageId}`);
      const data = await res.json();
      if (data.messages?.length) {
        data.messages.forEach(msg => {
          if (msg.id > lastMessageId) lastMessageId = msg.id;
          // Only render if not already shown
          if (!renderedMsgIds.has(msg.id) && msg.author !== myName) {
            renderedMsgIds.add(msg.id);
            renderMessage(msg, true);
            scrollToBottom();
            speakMessage(msg);
          }
        });
      }
    } catch (_) {}
  }, 2000);
}

// ── Send Message ──
async function sendMessage() {
  const text = composeInput.value.trim();
  if (!text || !myName) return;

  composeInput.value = '';
  sendBtn.disabled = true;
  autoResize(composeInput);

  // Always send via REST API (reliable DB access)
  // WebSocket is used for RECEIVING messages from the other user
  try {
    const res = await fetch(`/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: myName, text }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast('Send failed: ' + (err.error || res.status));
      composeInput.value = text;
      sendBtn.disabled = false;
      return;
    }
    const data = await res.json();
    // Render the message immediately from the API response
    if (data.message) {
      lastMessageId = data.message.id;
      renderedMsgIds.add(data.message.id);
      renderMessage(data.message, true);
      scrollToBottom();
    }
  } catch (err) {
    showToast('Failed to send message');
    composeInput.value = text;
    sendBtn.disabled = false;
  }
}

// ── Render Message ──
function renderMessage(msg, animate) {
  const empty = messagesArea.querySelector('.msg-empty');
  if (empty) empty.remove();

  const isSelf = msg.author === myName;
  const div = document.createElement('div');
  div.className = `msg-item msg-item--${isSelf ? 'self' : 'other'}`;
  if (!animate) div.style.animation = 'none';

  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  div.innerHTML = `
    <div class="msg-header">
      <span class="msg-author">${escapeHtml(msg.author)}</span>
      <span class="msg-time">${time}</span>
    </div>
    <div class="msg-text">${escapeHtml(msg.text)}</div>
  `;

  messagesArea.appendChild(div);
}

function addSystemMessage(text) {
  const empty = messagesArea.querySelector('.msg-empty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = 'msg-item msg-item--system';
  div.textContent = text;
  messagesArea.appendChild(div);
  scrollToBottom();
}

// ── TTS — Read incoming messages aloud ──
async function speakMessage(msg) {
  ttsQueue.push(msg);
  if (!isSpeaking) processNextTTS();
}

async function processNextTTS() {
  if (ttsQueue.length === 0) { isSpeaking = false; return; }
  isSpeaking = true;
  const msg = ttsQueue.shift();

  try {
    const ttsText = `${msg.author} says: ${msg.text}`;
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ttsText, voice_id: 'eve' }),
    });

    if (!res.ok) { processNextTTS(); return; }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => { URL.revokeObjectURL(url); processNextTTS(); };
    audio.onerror = () => { URL.revokeObjectURL(url); processNextTTS(); };
    audio.play().catch(() => processNextTTS());
  } catch (err) {
    console.error('TTS error:', err);
    processNextTTS();
  }
}

// ── Voice Input (STT-based: record → transcribe → send) ──
async function toggleVoice() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

async function startRecording() {
  voiceBtn.classList.add('connecting');
  setVoiceStatus('Accessing mic…', 'transcribing');

  // Step 1: Check if mic permission was previously denied
  try {
    if (navigator.permissions) {
      const perm = await navigator.permissions.query({ name: 'microphone' });
      if (perm.state === 'denied') {
        voiceBtn.classList.remove('connecting');
        showToast('Mic blocked — tap the lock icon in your browser address bar to allow');
        setVoiceStatus('', '');
        return;
      }
    }
  } catch (_) { /* permissions API not available, continue */ }

  // Step 2: Get microphone stream
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.error('getUserMedia error:', err.name, err.message);
    voiceBtn.classList.remove('connecting');
    if (err.name === 'NotAllowedError') {
      showToast('Mic permission denied — allow it in browser settings');
    } else if (err.name === 'NotFoundError') {
      showToast('No microphone found on this device');
    } else {
      showToast('Mic error: ' + err.message);
    }
    setVoiceStatus('', '');
    return;
  }

  // Step 3: Create recorder and start
  try {
    const mimeType = getSupportedMimeType();
    const recorder = mimeType
      ? new MediaRecorder(mediaStream, { mimeType })
      : new MediaRecorder(mediaStream);
    const chunks = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    recorder.onstop = async () => {
      const actualType = recorder.mimeType || mimeType || 'audio/mp4';
      const blob = new Blob(chunks, { type: actualType });
      setVoiceStatus('Transcribing…', 'transcribing');

      const ext = actualType.includes('mp4') ? 'mp4'
        : actualType.includes('aac') ? 'aac'
        : actualType.includes('wav') ? 'wav'
        : 'webm';
      const formData = new FormData();
      formData.append('file', blob, `recording.${ext}`);

      try {
        const res = await fetch('/api/stt', { method: 'POST', body: formData });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          showToast('STT failed: ' + (errData.error || res.status));
          setVoiceStatus('', '');
          cleanupMedia();
          return;
        }
        const data = await res.json();
        if (data.text?.trim()) {
          composeInput.value = data.text.trim();
          sendBtn.disabled = false;
          autoResize(composeInput);
          sendMessage();
          showToast('Message sent');
        } else {
          showToast('No speech detected — try again');
        }
      } catch (err) {
        console.error('STT error:', err);
        showToast('Transcription failed');
      }

      setVoiceStatus('', '');
      cleanupMedia();
    };

    window._sttRecorder = recorder;
    recorder.start(1000);
    isRecording = true;
    voiceBtn.classList.remove('connecting');
    voiceBtn.classList.add('recording');
    voiceBtn.querySelector('.mic-icon').style.display = 'none';
    voiceBtn.querySelector('.stop-icon').style.display = 'block';
    setVoiceStatus('Recording… tap to send', 'recording');

  } catch (err) {
    console.error('MediaRecorder error:', err.name, err.message);
    voiceBtn.classList.remove('connecting');
    showToast('Recording failed: ' + err.message);
    setVoiceStatus('', '');
    cleanupMedia();
  }
}

function getSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/wav',
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return null; // let the browser pick its default
}

function stopRecording() {
  isRecording = false;
  voiceBtn.classList.remove('recording', 'connecting');
  voiceBtn.querySelector('.mic-icon').style.display = 'block';
  voiceBtn.querySelector('.stop-icon').style.display = 'none';

  if (window._sttRecorder && window._sttRecorder.state === 'recording') {
    window._sttRecorder.stop(); // triggers onstop → transcribe → send
    window._sttRecorder = null;
  } else {
    setVoiceStatus('', '');
    cleanupMedia();
  }
}

function cleanupMedia() {
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
}

// ── Helpers ──
function setVoiceStatus(text, mode) {
  if (text) {
    voiceStatus.className = `voice-status visible ${mode || ''}`;
    voiceStatusText.textContent = text;
  } else {
    voiceStatus.className = 'voice-status';
  }
}

function scrollToBottom() {
  requestAnimationFrame(() => { messagesArea.scrollTop = messagesArea.scrollHeight; });
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

