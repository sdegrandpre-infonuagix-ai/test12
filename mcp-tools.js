/**
 * mcp-tools.js — Shared MCP tool registration.
 * Called by both server.js (stdio) and mcp-http.js (Streamable HTTP).
 * CommonJS — does NOT import the MCP SDK itself; receives server + z as args.
 */
'use strict';

require('dotenv').config({ override: true });
const fetch = require('node-fetch');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const db = require('./db');
const { broadcastToChannel } = require('./ws-broadcast');

const XAI_API_KEY = process.env.XAI_API_KEY;

// ── xAI chat helper ──
async function grokChat(systemPrompt, userPrompt) {
  const r = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${XAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'grok-3-mini',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) throw new Error(`xAI API error ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return JSON.parse(data.choices[0].message.content);
}

// ── Link extraction ──
function extractLinks(document, baseUrl) {
  const links = [], seen = new Set();
  document.querySelectorAll('a[href]').forEach(a => {
    if (links.length >= 20) return;
    const text = a.textContent?.trim();
    let href = a.getAttribute('href');
    if (!text || text.length < 2 || !href) return;
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
    try { href = new URL(href, baseUrl).href; } catch { return; }
    if (seen.has(href)) return;
    seen.add(href);
    links.push({ index: links.length + 1, text: text.substring(0, 80), url: href });
  });
  return links;
}

// ── Imperative WebMCP tool extraction ──
function extractImperativeTools(jsText, pageUrl) {
  const tools = [];
  let pos = 0;
  while (true) {
    const nameIdx = jsText.indexOf('name:`', pos);
    if (nameIdx === -1) break;
    const before = jsText.substring(Math.max(0, nameIdx - 10), nameIdx);
    if (!before.includes('{')) { pos = nameIdx + 1; continue; }
    const nameStart = nameIdx + 6;
    const nameEnd = jsText.indexOf('`', nameStart);
    if (nameEnd === -1) { pos = nameIdx + 1; continue; }
    const name = jsText.substring(nameStart, nameEnd);
    const descIdx = jsText.indexOf('description:`', nameIdx);
    if (descIdx === -1 || descIdx > nameIdx + 600) { pos = nameIdx + 1; continue; }
    const descStart = descIdx + 13;
    const descEnd = jsText.indexOf('`', descStart);
    const description = jsText.substring(descStart, descEnd);
    const schemaKeyIdx = jsText.indexOf('inputSchema:', nameIdx);
    if (schemaKeyIdx === -1 || schemaKeyIdx > nameIdx + 2000) { pos = nameIdx + 1; continue; }
    const schemaStart = jsText.indexOf('{', schemaKeyIdx);
    let depth = 0, schemaEnd = schemaStart;
    for (let i = schemaStart; i < Math.min(jsText.length, schemaStart + 3000); i++) {
      if (jsText[i] === '{') depth++;
      else if (jsText[i] === '}') { depth--; if (depth === 0) { schemaEnd = i + 1; break; } }
    }
    const schemaStr = jsText.substring(schemaStart, schemaEnd)
      .replace(/`([^`]*)`/g, '"$1"').replace(/([{,])(\s*)(\w+):/g, '$1$2"$3":')
      .replace(/enum:\w+/g, 'enum:[]').replace(/,\s*([}\]])/g, '$1');
    let schema = null;
    try { schema = JSON.parse(schemaStr); } catch (_) {}
    const parameters = [];
    if (schema?.properties) {
      for (const [pname, pdef] of Object.entries(schema.properties)) {
        parameters.push({
          name: pname, description: pdef.description || '', type: pdef.type || 'string',
          required: (schema.required || []).includes(pname),
          ...(pdef.enum ? { options: pdef.enum.map(v => ({ value: v, label: v })) } : {}),
        });
      }
    }
    const executeIdx = jsText.indexOf('execute:', schemaEnd);
    let action = null;
    if (executeIdx !== -1 && executeIdx < schemaEnd + 400) {
      const snip = jsText.substring(executeIdx, executeIdx + 400);
      const urlMatch = snip.match(/['"`](\/[a-zA-Z0-9_/-]+\??[^'"`]{0,60})['"`]/);
      if (urlMatch && urlMatch[1].startsWith('/')) {
        try { action = new URL(urlMatch[1].split('?')[0], pageUrl).href; } catch (_) {}
      }
    }
    if (name) tools.push({ name, description, parameters, tag: 'script', action, method: 'GET', source: 'imperative' });
    pos = nameEnd + 1;
  }
  return tools;
}

// ── WebMCP detection ──
async function detectWebMCP(doc, html, pageUrl) {
  const tools = [];
  const mcpEls = doc.querySelectorAll('[mcp-tool], [data-mcp-tool]');
  mcpEls.forEach(el => {
    const name = el.getAttribute('mcp-name') || el.getAttribute('data-mcp-name') || el.getAttribute('id') || 'tool';
    const description = el.getAttribute('mcp-description') || el.getAttribute('data-mcp-description') || '';
    const method = (el.getAttribute('method') || 'GET').toUpperCase();
    const action = el.getAttribute('action') || el.getAttribute('href') || null;
    const params = [];
    el.querySelectorAll('input, select, textarea, [mcp-parameter], [data-mcp-parameter]').forEach(p => {
      const ptype = (p.getAttribute('type') || 'text').toLowerCase();
      if (['submit', 'button', 'reset', 'image'].includes(ptype)) return;
      const pname = p.getAttribute('mcp-name') || p.getAttribute('data-mcp-name') || p.getAttribute('name') || p.getAttribute('id') || 'value';
      const pdesc = p.getAttribute('mcp-description') || p.getAttribute('data-mcp-description') || p.getAttribute('placeholder') || p.getAttribute('aria-label') || p.getAttribute('title') || '';
      const required = p.hasAttribute('required') || p.getAttribute('mcp-required') === 'true';
      let options = null;
      if (p.tagName.toLowerCase() === 'select') {
        options = Array.from(p.querySelectorAll('option')).filter(o => o.value).map(o => ({ value: o.value, label: o.textContent.trim() }));
      }
      const labelEl = p.id ? doc.querySelector(`label[for="${p.id}"]`) : null;
      const label = labelEl ? labelEl.textContent.trim() : '';
      params.push({ name: pname, description: pdesc || label, type: ptype, required, ...(options ? { options } : {}) });
    });
    tools.push({ name, description, parameters: params, tag: el.tagName.toLowerCase(), action, method });
  });
  if (tools.length === 0) {
    doc.querySelectorAll('[toolname], [data-toolname]').forEach(el => {
      const name = el.getAttribute('toolname') || el.getAttribute('data-toolname') || el.getAttribute('id') || 'tool';
      const description = el.getAttribute('tooldescription') || el.getAttribute('data-tooldescription') || '';
      const method = (el.getAttribute('method') || 'GET').toUpperCase();
      const action = el.getAttribute('action') || el.getAttribute('href') || null;
      const params = [];
      el.querySelectorAll('input, select, textarea').forEach(p => {
        const ptype = (p.getAttribute('type') || 'text').toLowerCase();
        if (['submit', 'button', 'reset', 'image'].includes(ptype)) return;
        const pname = p.getAttribute('name') || p.getAttribute('id') || 'value';
        const pdesc = p.getAttribute('toolparamdescription') || p.getAttribute('data-toolparamdescription') || p.getAttribute('placeholder') || '';
        const required = p.hasAttribute('required');
        let options = null;
        if (p.tagName.toLowerCase() === 'select') {
          options = Array.from(p.querySelectorAll('option')).filter(o => o.value).map(o => ({ value: o.value, label: o.textContent.trim() }));
        }
        params.push({ name: pname, description: pdesc, type: ptype, required, ...(options ? { options } : {}) });
      });
      tools.push({ name, description, parameters: params, tag: el.tagName.toLowerCase(), action, method });
    });
  }
  const lc = html.toLowerCase();
  const imperative = lc.includes('navigator.modelcontext') || lc.includes('__webmcp') || lc.includes('registertool') || (lc.includes('webmcp') && lc.includes('tool'));
  const meta = !!doc.querySelector('meta[name="webmcp"], meta[name="mcp"]');
  if (tools.length === 0 && imperative && pageUrl) {
    for (const el of Array.from(doc.querySelectorAll('script[src]'))) {
      const src = el.getAttribute('src');
      if (!src) continue;
      try {
        const r = await fetch(new URL(src, pageUrl).href, { timeout: 12000, headers: { 'User-Agent': 'Test12/1.0' } });
        if (!r.ok) continue;
        const extracted = extractImperativeTools(await r.text(), pageUrl);
        if (extracted.length > 0) { tools.push(...extracted); break; }
      } catch (_) {}
    }
  }
  const compliant = mcpEls.length > 0 || doc.querySelectorAll('[toolname]').length > 0 || imperative || meta || tools.length > 0;
  const source = tools.length > 0 && tools[0].source === 'imperative' ? 'imperative'
    : mcpEls.length > 0 || doc.querySelectorAll('[toolname]').length > 0 ? 'declarative'
    : imperative ? 'imperative' : meta ? 'meta' : 'none';
  return { compliant, tools, source };
}

// ══════════════════════════════════════════════
//  Register all Test12 tools on an McpServer
// ══════════════════════════════════════════════
function registerTools(server, z) {
  server.tool(
    'speech_to_text',
    'Transcribe audio to text via xAI Grok STT. Provide audio as base64-encoded string.',
    { audio_base64: z.string().describe('Base64-encoded audio data'),
      filename: z.string().optional().describe('Original filename'),
      content_type: z.string().optional().describe('MIME type') },
    async ({ audio_base64, filename, content_type }) => {
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('file', Buffer.from(audio_base64, 'base64'), { filename: filename || 'audio.webm', contentType: content_type || 'audio/webm' });
      formData.append('model', 'grok-stt');
      const r = await fetch('https://api.x.ai/v1/stt', { method: 'POST', headers: { 'Authorization': `Bearer ${XAI_API_KEY}`, ...formData.getHeaders() }, body: formData });
      if (!r.ok) throw new Error(`STT error ${r.status}: ${await r.text()}`);
      const data = await r.json();
      const resultText = data.text ? String(data.text).toUpperCase() : JSON.stringify(data);
      return { content: [{ type: 'text', text: resultText }] };
    }
  );

  server.tool(
    'text_to_speech',
    'Convert text to speech audio via xAI Grok TTS. Returns base64-encoded MP3.',
    { text: z.string().describe('Text to speak'),
      voice_id: z.string().optional().describe('Voice ID (default: eve)'),
      language: z.string().optional().describe('Language code (default: en)') },
    async ({ text, voice_id, language }) => {
      const r = await fetch('https://api.x.ai/v1/tts', { method: 'POST', headers: { 'Authorization': `Bearer ${XAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice_id: voice_id || 'eve', language: language || 'en' }) });
      if (!r.ok) throw new Error(`TTS error ${r.status}: ${await r.text()}`);
      return { content: [{ type: 'text', text: (await r.buffer()).toString('base64') }] };
    }
  );

  server.tool(
    'fetch_page',
    'Fetch a web page, extract readable text, links, and detect WebMCP tools.',
    { url: z.string().describe('URL to fetch') },
    async ({ url }) => {
      if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Test12/1.0', 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.5' }, timeout: 15000, follow: 5 });
      if (!r.ok) throw new Error(`Fetch failed: HTTP ${r.status}`);
      const html = await r.text();
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      const webmcp = await detectWebMCP(dom.window.document, html, url);
      const title = article?.title || dom.window.document.title || url;
      const cleanText = article ? article.textContent.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').trim().substring(0, 8000)
        : (dom.window.document.body?.textContent?.trim() || '').substring(0, 5000);
      return { content: [{ type: 'text', text: JSON.stringify({ title, text: cleanText, excerpt: article?.excerpt || cleanText.substring(0, 200), links: extractLinks(dom.window.document, url), webmcp }, null, 2) }] };
    }
  );

  server.tool(
    'grok_tool_call',
    'Map user voice text to a WebMCP tool invocation with filled parameters.',
    { text: z.string().describe('User spoken text'), tools: z.array(z.any()).describe('Available WebMCP tools'), pageUrl: z.string().optional(), pageTitle: z.string().optional() },
    async ({ text, tools: mcpTools, pageUrl, pageTitle }) => {
      if (!mcpTools?.length) throw new Error('tools array required');
      const schemas = mcpTools.map(t => ({ name: t.name, description: t.description, method: t.method || 'GET', action: t.action, parameters: (t.parameters || []).map(p => ({ name: p.name, description: p.description, type: p.type, required: p.required, ...(p.options ? { options: p.options } : {}) })) }));
      const today = new Date().toISOString().slice(0, 10);
      const result = await grokChat(
        'You are a voice browser assistant that fills web forms. Return JSON: {"tool":"<name>","method":"GET|POST","params":{...},"reply":"<confirmation>"}. Rules: fill every param, use ISO dates (today=' + today + '), simulate execution. If no match, tool=null.',
        `Page: ${pageTitle || ''} (${pageUrl || ''})\nUser said: "${text}"\n\nWebMCP tools:\n${JSON.stringify(schemas, null, 2)}`
      );
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'parse_post',
    'Extract a display name and message from a spoken sentence for posting.',
    { text: z.string().describe('Spoken text'), defaultAuthor: z.string().optional().describe('Fallback author') },
    async ({ text, defaultAuthor }) => {
      const parsed = await grokChat(
        'Extract name and message from spoken sentence. Return JSON: {"name":"","message":""}. If user introduces themselves, set name. Strip filler. Preserve language.',
        text
      );
      return { content: [{ type: 'text', text: JSON.stringify({ name: (parsed.name || '').trim() || (defaultAuthor || ''), message: (parsed.message || '').trim() }) }] };
    }
  );

  server.tool(
    'match_reply_target',
    'Match a spoken description to a candidate post for replying.',
    { text: z.string().describe('Spoken description'), candidates: z.array(z.any()).describe('Candidate posts') },
    async ({ text, candidates }) => {
      if (!candidates?.length) throw new Error('candidates required');
      const compact = candidates.map(c => ({ id: c.id, author: c.author, level: c.level, preview: String(c.text || '').slice(0, 200) }));
      const result = await grokChat(
        'Match spoken description to a post. Return JSON: {"id":<number_or_null>,"confidence":<0-1>,"reason":"<short>"}. Match by author first, then content.',
        `User said: "${text}"\nCandidates:\n${JSON.stringify(compact, null, 2)}`
      );
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'create_post',
    'Create a voice post in the database.',
    { text: z.string().max(2000).describe('Post content'), author: z.string().max(120).describe('Author name'), parent_id: z.number().int().positive().optional().describe('Parent post ID for replies') },
    async ({ text, author, parent_id }) => {
      if (!db.isReady()) throw new Error('Database not connected');
      try {
        const post = await db.insertPost({ text, author, parentId: parent_id || null });
        // Broadcast to all public WS subscribers
        broadcastToChannel('public', 'new_post', post).catch(() => {});
        return { content: [{ type: 'text', text: JSON.stringify({ post }) }] };
      } catch (err) {
        if (err.code === 'PARENT_NOT_FOUND') throw new Error('Parent post not found');
        if (err.code === 'MAX_DEPTH') throw new Error(`Max depth (${db.MAX_LEVEL}) reached`);
        throw err;
      }
    }
  );

  server.tool(
    'list_posts',
    'Fetch the latest voice posts from the database.',
    { limit: z.number().int().min(1).max(200).optional().describe('Max posts (default 50)') },
    async ({ limit }) => {
      if (!db.isReady()) throw new Error('Database not connected');
      const posts = await db.listPosts({ limit: limit || 50 });
      return { content: [{ type: 'text', text: JSON.stringify({ posts }, null, 2) }] };
    }
  );

  // ── Private Channel Tools ──

  server.tool(
    'create_private_channel',
    'Create a new private voice-chat channel. Max 2 users. Returns channel info and a shareable URL that the other person can use to join.',
    { name: z.string().max(200).optional().describe('Channel name (default "Private Chat")'),
      author: z.string().max(120).describe('Your display name') },
    async ({ name, author }) => {
      if (!db.isReady()) throw new Error('Database not connected');
      const { randomUUID } = require('crypto');
      const id = randomUUID().replace(/-/g, '').substring(0, 6).toUpperCase();
      const channel = await db.createChannel({ id, name: name || 'Private Chat', createdBy: author });
      return { content: [{ type: 'text', text: JSON.stringify({
        channel,
        url: `/private/${id}`,
        shareableUrl: `${process.env.BASE_URL || 'https://test12.net'}/private/${id}`,
        wsUrl: process.env.WS_URL || null,
      }) }] };
    }
  );

  server.tool(
    'join_private_channel',
    'Join an existing private channel by its ID. Returns channel info, connected users, and recent message history so you can start participating.',
    { channel_id: z.string().describe('Channel ID to join'),
      author: z.string().max(120).describe('Your display name'),
      limit: z.number().int().min(1).max(500).optional().describe('Max recent messages to fetch (default 100)') },
    async ({ channel_id, author, limit }) => {
      if (!db.isReady()) throw new Error('Database not connected');
      const channel = await db.getChannelById(channel_id);
      if (!channel) throw new Error('Channel not found');

      // Fetch recent messages
      const messages = await db.listChannelMessages({ channelId: channel_id, limit: limit || 100, afterId: 0 });

      // Try to get live user count from DynamoDB (non-fatal if unavailable)
      let userCount = 0;
      let users = [];
      try {
        const wsBroadcast = require('./ws-broadcast');
        const info = await wsBroadcast.getChannelUserCount(channel_id);
        userCount = info.count;
        users = info.authors;
      } catch (_) { /* DynamoDB may not be available locally */ }

      return { content: [{ type: 'text', text: JSON.stringify({
        channel: { id: channel.id, name: channel.name, created_by: channel.created_by, created_at: channel.created_at },
        joined_as: author,
        userCount,
        users,
        messages,
        wsUrl: process.env.WS_URL || null,
      }, null, 2) }] };
    }
  );

  server.tool(
    'send_channel_message',
    'Send a text message to a private chat channel. The message is stored and broadcast to all connected users in real time.',
    { channel_id: z.string().describe('Channel ID'),
      author: z.string().max(120).describe('Your display name'),
      text: z.string().max(2000).describe('Message text') },
    async ({ channel_id, author, text }) => {
      if (!db.isReady()) throw new Error('Database not connected');
      const channel = await db.getChannelById(channel_id);
      if (!channel) throw new Error('Channel not found');
      const msg = await db.insertChannelMessage({ channelId: channel_id, author, text });

      // Broadcast via WebSocket API Gateway (non-fatal if unavailable)
      try {
        const wsBroadcast = require('./ws-broadcast');
        await wsBroadcast.broadcastToChannel(channel_id, 'message', msg);
      } catch (_) { /* WS_ENDPOINT may not be configured */ }

      return { content: [{ type: 'text', text: JSON.stringify({ message: msg, channel: { id: channel.id, name: channel.name } }) }] };
    }
  );

  server.tool(
    'read_channel_messages',
    'Read messages from a private chat channel. Returns messages in chronological order.',
    { channel_id: z.string().describe('Channel ID'),
      limit: z.number().int().min(1).max(500).optional().describe('Max messages (default 100)'),
      after_id: z.number().int().optional().describe('Only return messages with ID greater than this') },
    async ({ channel_id, limit, after_id }) => {
      if (!db.isReady()) throw new Error('Database not connected');
      const channel = await db.getChannelById(channel_id);
      if (!channel) throw new Error('Channel not found');
      const messages = await db.listChannelMessages({ channelId: channel_id, limit: limit || 100, afterId: after_id || 0 });
      return { content: [{ type: 'text', text: JSON.stringify({ channel: { id: channel.id, name: channel.name }, messages }, null, 2) }] };
    }
  );

  // ── Public Channel ──

  server.tool(
    'join_public_channel',
    'Switch the view back to the public channel feed to read or post public messages.',
    {},
    async () => {
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, channel: 'public' }) }] };
    }
  );

  // ── My Private Channels ──

  server.tool(
    'list_private_channels_I_created',
    'List private channels the current user created. Returns each channel\'s id (short alphanumeric code) and name. Use the id for send_channel_message or read_channel_messages.',
    {},
    async () => {
      return { content: [{ type: 'text', text: JSON.stringify({ channels: [], note: 'Executed server-side.' }) }] };
    }
  );

  server.tool(
    'list_the_private_channels_I_joined',
    'List private channels the current user joined but did not create. Returns each channel\'s id (short alphanumeric code) and name.',
    {},
    async () => {
      return { content: [{ type: 'text', text: JSON.stringify({ channels: [], note: 'Executed server-side.' }) }] };
    }
  );

  // ── Alias Tools ──

  server.tool(
    'list_aliases',
    'List all nickname aliases saved for a user (maps raw usernames to friendly display names).',
    { userId: z.string().describe('The authenticated user ID (phone or email)') },
    async ({ userId }) => {
      if (!db.isReady()) throw new Error('Database not connected');
      const aliases = await db.getAliases(userId);
      const entries = Object.entries(aliases).map(([username, alias]) => ({ username, alias }));
      return { content: [{ type: 'text', text: JSON.stringify({ aliases: entries, count: entries.length }) }] };
    }
  );

  server.tool(
    'set_alias',
    'Save a nickname alias so a username is displayed with a friendlier name.',
    { userId: z.string().describe('The authenticated user ID'),
      username: z.string().max(120).describe('The raw username to alias (e.g. WOLF.PX7K3A)'),
      alias: z.string().max(120).describe('The friendly nickname to display instead') },
    async ({ userId, username, alias }) => {
      if (!db.isReady()) throw new Error('Database not connected');
      await db.setAlias(userId, username.trim(), alias.trim());
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, username, alias }) }] };
    }
  );

  server.tool(
    'remove_alias',
    'Remove a saved nickname alias by username.',
    { userId: z.string().describe('The authenticated user ID'),
      username: z.string().describe('The username whose alias should be removed') },
    async ({ userId, username }) => {
      if (!db.isReady()) throw new Error('Database not connected');
      await db.removeAlias(userId, username.trim());
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, username }) }] };
    }
  );
}

module.exports = { registerTools, db };
