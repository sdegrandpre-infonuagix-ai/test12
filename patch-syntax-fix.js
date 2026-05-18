/**
 * patch-syntax-fix.js
 * Removes the orphaned legacy if/else deluxe block that causes a SyntaxError,
 * and updates handleClientTool to use the async aliasSet/aliasRemove functions.
 * Run with: node patch-syntax-fix.js
 */
const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, 'public/index.html');
let text = fs.readFileSync(file, 'utf8');
let changes = 0;

function replace(from, to, label) {
  if (!text.includes(from)) {
    console.error(`✗ Could not find: ${label}`);
    return false;
  }
  text = text.replace(from, to);
  changes++;
  console.log(`✓ Applied: ${label}`);
  return true;
}

// 1. Remove the entire legacy deluxe if/else block.
//    It starts with the duplicate playPcm16Chunk function (after the new { } block closes)
//    and ends with the closing `}` of the old else branch.
replace(
`
  function playPcm16Chunk(b64) {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const pcm = base64ToInt16Array(b64);
    const f32 = new Float32Array(pcm.length);
    for (let i=0;i<pcm.length;i++) f32[i]=pcm[i]/(pcm[i]<0?0x8000:0x7FFF);
    const buf = audioCtx.createBuffer(1, f32.length, 24000);
    buf.getChannelData(0).set(f32);
    const src = audioCtx.createBufferSource(); src.buffer=buf; src.connect(audioCtx.destination);
    const now = audioCtx.currentTime, startAt = Math.max(now, nextPlayTime);
    src.start(startAt); nextPlayTime = startAt + buf.duration;
  }

  async function startMicrophone() {
    if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)({sampleRate:24000});
    await audioCtx.resume();
    // sampleRate constraint omitted: Safari throws OverconstrainedError if unsupported
    micStream = await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
    const src = audioCtx.createMediaStreamSource(micStream);
    micProcessor = audioCtx.createScriptProcessor(4096,1,1);
    micProcessor.onaudioprocess = (e) => {
      if (!ws||ws.readyState!==WebSocket.OPEN) return;
      const b64 = arrayBufferToBase64(float32ToPcm16(e.inputBuffer.getChannelData(0)).buffer);
      ws.send(JSON.stringify({type:'input_audio_buffer.append',audio:b64}));
    };
    src.connect(micProcessor); micProcessor.connect(audioCtx.destination);
    setOrb('listening'); setStatus('Listening\u2026 speak naturally');
    log('audio','Microphone streaming at <b>24 kHz PCM16</b>');
  }

  function stopMicrophone() {
    if (micProcessor){micProcessor.disconnect();micProcessor=null;}
    if (micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null;}
    if (audioCtx){audioCtx.close().catch(()=>{});audioCtx=null;}
  }

  function deluxeCleanup() {
    isConnected=false; isSpeaking=false; transcriptBuffer='';
    stopMicrophone(); setOrb(''); setStatus('Disconnected');
    connectBtn.disabled=false; disconnectBtn.disabled=true; ws=null;
  }

  function handleDeluxeEvent(ev) {
    const msg = JSON.parse(ev.data);
    switch (msg.type) {
      case 'session.created': log('ws','Session created \u2014 model: <b>'+(msg.session?.model||'grok')+'</b>'); break;
      case 'mcp_list_tools.completed': log('ws','MCP tools loaded \u2713'); greetDeluxe(); break;
      case 'input_audio_buffer.speech_started': setOrb('listening'); setStatus('Listening\u2026'); nextPlayTime=0; isSpeaking=false; break;
      case 'input_audio_buffer.speech_stopped': setStatus('Thinking\u2026'); setOrb('connecting'); break;
      case 'conversation.item.input_audio_transcription.completed': if(msg.transcript) log('text','You: <b>'+msg.transcript+'</b>'); break;
      case 'response.output_audio_transcript.delta': transcriptBuffer+=(msg.delta||''); break;
      case 'response.output_audio_transcript.done': if(transcriptBuffer){log('agent','Agent: <b>'+transcriptBuffer+'</b>');transcriptBuffer='';} break;
      case 'response.output_audio.delta':
        if (!isSpeaking){isSpeaking=true;setOrb('speaking');setStatus('Agent speaking\u2026');}
        playPcm16Chunk(msg.delta); break;
      case 'response.output_audio.done': {
        const rem=Math.max(0,nextPlayTime-(audioCtx?.currentTime||0));
        setTimeout(()=>{isSpeaking=false;setOrb('listening');setStatus('Listening\u2026');},rem*1000+200); break;
      }
      case 'response.output_item.done':
        if (msg.item?.type==='function_call') {
          const {name,call_id,arguments:rawArgs}=msg.item;
          let args={}; try{args=JSON.parse(rawArgs||'{}');}catch(_){}
          log('tool',\`Called: <b>\${name}</b>\`);
          if (['pick_contact','send_invite','set_alias','remove_alias'].includes(name)) handleClientTool(name,args,call_id);
        } break;
      case 'response.mcp_call.completed': {
        const tn=msg.mcp_call?.name||'';
        const out=(()=>{try{return JSON.parse(msg.mcp_call?.output||'{}');}catch(_){return{};}})();
        if (tn==='list_posts'||tn==='create_post'){setActiveChannel('public');loadPublicPosts();}
        if (['read_channel_messages','send_channel_message','join_private_channel','create_private_channel'].includes(tn)){
          const cid=out.channel?.id||out.channel_id||out.id||(()=>{try{return JSON.parse(msg.mcp_call?.arguments||'{}').channelId;}catch(_){}})();
          if(cid){addMyChannelId(cid);setActiveChannel(cid);}
          loadPrivateChannels();
        } break;
      }
      case 'error': log('error',msg.error?.message||JSON.stringify(msg.error)); break;
    }
  }

  function greetDeluxe() {
    if (!ws||ws.readyState!==WebSocket.OPEN) return;
    const promptText = isAutoJoin
      ? \`The user "\${autoUsername}" wants to join private channel "\${autoChannelId}". Call join_private_channel then greet them and read recent messages aloud.\`
      : \`You are now connected with full MCP access. Briefly greet the user and summarise what you can help with in one sentence.\`;
    ws.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:promptText}]}}));
    ws.send(JSON.stringify({type:'response.create',response:{modalities:['text','audio']}}));
    setOrb('speaking'); setStatus(isAutoJoin?'Joining channel\u2026':'Agent introducing tools\u2026');
  }

  connectBtn.textContent = '\uD83C\uDF1F Connect (Deluxe)';
  connectBtn.addEventListener('click', async () => {
    if (isConnected) return;
    connectBtn.disabled = true; setOrb('connecting'); setStatus('Obtaining session token\u2026');
    log('ws','Requesting ephemeral token from <b>/api/session</b>\u2026');`,
``,
  'Remove legacy duplicate deluxe block (part 1)'
);

// 2. Also remove the rest of that legacy block: the try/catch connect, disconnectBtn listener,
//    setStatus, log line, and the dangling } else { ... } block.
replace(
`    try {
      const res = await fetch('/api/session', {method:'POST', headers: authHeaders()});
      if (!res.ok) {
        if (res.status === 402) {
          log('error', '\u23F1\uFE0F Deluxe pass expired. <a href="/upgrade">Buy another 3-hour pass \u2192</a>');
          setStatus('Pass expired'); connectBtn.disabled=false; return;
        }
        const err = await res.json().catch(()=>({}));
        throw new Error(err.message || \`Session token failed: \${res.status}\`);
      }
      const data = await res.json();
      const token = data.client_secret?.value || data.value || data.secret || data.token;
      if (!token) throw new Error('No token in response');

      ws = new WebSocket(
        'wss://api.x.ai/v1/realtime?model=grok-voice-latest',
        [\`xai-client-secret.\${token}\`]
      );
      ws.onopen = () => {
        isConnected=true; log('ws','<b>WebSocket connected</b>'); setStatus('Configuring session\u2026');
        connectBtn.disabled=true; disconnectBtn.disabled=false;
        ws.send(JSON.stringify({type:'session.update',session:{
          voice:'ara', model:'grok-3',
          instructions: 'You are a helpful voice assistant for Test12, a voice-first social platform. Be concise and action-oriented. Use MCP tools for posts and channels. Current user: '+(currentUser?.displayName||'unknown')+'. Speak in the user\\'s language.',
          turn_detection:{type:'server_vad'},
          modalities:['text','audio'],
          input_audio_transcription:{model:'grok-2-latest'},
          input_audio_format:'pcm16', output_audio_format:'pcm16',
          tools:[
            {type:'mcp',server_label:'Test12',server_url:MCP_URL,require_approval:'never'},
            {type:'function',name:'pick_contact',description:'Open phone contact picker.',parameters:{type:'object',properties:{},required:[]}},
            {type:'function',name:'send_invite',description:'Send a private channel invite.',parameters:{type:'object',properties:{phone:{type:'string'},email:{type:'string'},use_whatsapp:{type:'boolean'},channel_id:{type:'string'},contact_name:{type:'string'},sender_name:{type:'string'}},required:['channel_id']}},
            {type:'function',name:'set_alias',description:'Remember a nickname for a username.',parameters:{type:'object',properties:{username:{type:'string'},alias:{type:'string'}},required:['username','alias']}},
            {type:'function',name:'remove_alias',description:'Remove a personal alias.',parameters:{type:'object',properties:{username:{type:'string'}},required:['username']}}
          ],
          tool_choice:'auto'
        }}));
        log('agent','Session configured \u2192 '+MCP_URL);
        startMicrophone();
      };
      ws.onmessage = handleDeluxeEvent;
      ws.onerror = () => { log('error','WebSocket error'); };
      ws.onclose = (ev) => {
        log('ws',\`WebSocket closed (\${ev.code})\`);
        const unexpected = isConnected && ev.code!==1000;
        deluxeCleanup();
        if (unexpected && (ev.code===1005||ev.code===1006)) {
          log('ws','Session timed out \u2014 reconnecting in 2s\u2026'); setStatus('Reconnecting\u2026');
          connectBtn.disabled=true; setTimeout(()=>{ if(!isConnected) connectBtn.click(); },2000);
        }
      };
    } catch (err) { log('error',err.message); setStatus('Connection failed'); setOrb(''); connectBtn.disabled=false; }
  });

  disconnectBtn.addEventListener('click', () => { if(ws) ws.close(); deluxeCleanup(); });
  disconnectBtn.disabled = true;
  setStatus('Click Connect to start');
  log('ws','<b>Deluxe mode</b> \u2014 xAI Realtime Voice Agent with MCP tools');

} else {
  // \u2500\u2500 Plan 1 (free) & Plan 2 (cheap/llm) \u2014 Push-to-talk \u2500\u2500
  connectBtn.textContent = VA_MODE === 'llm' ? '\uD83E\uDD16 Tap to Speak (AI)' : '\uD83C\uDF99\uFE0F Tap to Speak';
  connectBtn.addEventListener('click', () => {
    if (ptListening) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      ptSpeak('Speech recognition is not supported. Please use Chrome.');
      log('error','SpeechRecognition not supported.'); return;
    }
    ptRecognizer = new SR();
    ptRecognizer.lang = navigator.language || 'en-US';
    ptRecognizer.interimResults = false; ptRecognizer.maxAlternatives = 1;
    ptRecognizer.onstart = () => {
      ptListening=true; setOrb('listening'); setStatus('Listening\u2026');
      connectBtn.textContent='\uD83D\uDD34 Listening\u2026'; connectBtn.disabled=true;
      log('audio','Listening\u2026');
    };
    ptRecognizer.onresult = (e) => { const t=e.results[0][0].transcript.trim(); if(t) dispatchIntent(t); };
    ptRecognizer.onerror = (e) => { log('error','STT error: '+e.error); setStatus('Tap to speak'); };
    ptRecognizer.onend = () => {
      ptListening=false; setOrb(''); setStatus('Tap to speak');
      connectBtn.textContent = VA_MODE==='llm'?'\uD83E\uDD16 Tap to Speak (AI)':'\uD83C\uDF99\uFE0F Tap to Speak';
      connectBtn.disabled=false;
    };
    ptRecognizer.start();
  });
  disconnectBtn.style.display = 'none';
  setStatus('Tap to speak');
  if (VA_MODE === 'llm') log('ws','<b>AI mode</b> \u2014 Grok mini + Browser STT/TTS');
  else log('ws','<b>Free mode</b> \u2014 Browser STT + Rule-based + Browser TTS');
}`,
  ``,
  'Remove legacy duplicate deluxe block (part 2 — if/else)'
);

// 3. Update handleClientTool to use async aliasSet/aliasRemove (server-side)
//    and use rtWs instead of the old ws variable.
replace(
  `  } else if (name === 'set_alias') {
    const { username, alias } = args;
    if (!username || !alias) { result = { error: 'username and alias are required' }; }
    else { setAlias(username, alias); renderAliasPanel(); result = { ok: true, message: \`\${username} will now appear as "\${alias}" to you.\` }; }
  } else if (name === 'remove_alias') {
    const { username } = args;
    if (!username) { result = { error: 'username is required' }; }
    else { removeAlias(username); renderAliasPanel(); result = { ok: true, message: \`Alias for \${username} removed.\` }; }`,
  `  } else if (name === 'set_alias') {
    const { username, alias } = args;
    if (!username || !alias) { result = { error: 'username and alias are required' }; }
    else { await aliasSet(username, alias); renderAliasPanel(); result = { ok: true, message: \`\${username} will now appear as "\${alias}" to you.\` }; }
  } else if (name === 'remove_alias') {
    const { username } = args;
    if (!username) { result = { error: 'username is required' }; }
    else { await aliasRemove(username); renderAliasPanel(); result = { ok: true, message: \`Alias for \${username} removed.\` }; }`,
  'Update handleClientTool to use async aliasSet/aliasRemove'
);

if (changes >= 2) {
  fs.writeFileSync(file, text, 'utf8');
  console.log(`\n✓ ${changes} changes applied and saved.`);
} else {
  console.error(`\n✗ Only ${changes} changes applied — file NOT saved.`);
  process.exit(1);
}
