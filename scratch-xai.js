const WebSocket = require('ws');
const https = require('https');

async function test() {
  const req = https.request('https://mvuymbllae.execute-api.us-east-1.amazonaws.com/api/session', { method: 'POST' }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      const data = JSON.parse(body);
      const token = data.value;
      const ws = new WebSocket('wss://api.x.ai/v1/realtime?model=grok-voice-latest', ['xai-client-secret.' + token]);
      
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            voice: 'ara',
            modalities: ['text', 'audio'],
            output_audio_format: 'pcm16'
          }
        }));
        ws.send(JSON.stringify({
          type: 'conversation.item.create',
          item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Say hello!' }] }
        }));
        ws.send(JSON.stringify({ type: 'response.create', response: { modalities: ['text', 'audio'] } }));
      });
      
      let gotAudio = false;
      ws.on('message', (msg) => {
        const ev = JSON.parse(msg);
        if (ev.type === 'response.output_audio.delta') {
          gotAudio = true;
          console.log('Got audio delta!', ev.delta.substring(0, 20) + '...');
        } else if (ev.type.includes('done')) {
          console.log('DONE:', ev.type);
        }
        if (ev.type === 'response.done') {
          console.log('Finished. Audio received?', gotAudio);
          process.exit(0);
        }
      });
    });
  });
  req.end();
}
test();
