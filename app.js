require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const fetch = require('node-fetch');
const path = require('path');
const db = require('./db');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const XAI_API_KEY = process.env.XAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

if (!XAI_API_KEY) {
  console.warn('WARNING: XAI_API_KEY not set — Deluxe voice features disabled');
}
if (!ANTHROPIC_API_KEY) {
  console.warn('WARNING: ANTHROPIC_API_KEY not set — Claude LLM features disabled');
}

const ALLOWED_ORIGINS = process.env.BASE_URL
  ? [process.env.BASE_URL, 'http://localhost:3000']
  : true; // allow all in local dev when BASE_URL unset
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────
//  Plan Middleware: requireDeluxe
//  Gates xAI STT / TTS / Realtime to Deluxe subscribers
// ──────────────────────────────────────────────
async function requireDeluxe(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (token) {
    try {
      const session = await db.getSession(token);
      if (session) {
        const user = await db.getUserById(session.phone).catch(() => null);
        if (user?.plan === 'deluxe') {
          if (!user.deluxeExpiresAt || new Date(user.deluxeExpiresAt) > new Date()) {
            req.user = session;
            req.deluxeType = user.deluxeType || 'xai';
            return next();
          }
          await db.setUserPlan(session.phone, 'standard', null).catch(() => {});
        }
      }
    } catch (_) {}
  }
  return res.status(402).json({
    error: 'Deluxe access required',
    upgrade_url: '/upgrade',
    message: 'Purchase a 3-hour Deluxe pass at test12.net/upgrade.',
  });
}


// ──────────────────────────────────────────────
//  STT Proxy — POST /api/stt
//  Accepts audio blob, forwards to xAI /v1/stt
// ──────────────────────────────────────────────
app.post('/api/stt', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const formData = new (require('form-data'))();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname || 'audio.webm',
      contentType: req.file.mimetype || 'audio/webm',
    });
    formData.append('model', 'grok-stt');

    const response = await fetch('https://api.x.ai/v1/stt', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_API_KEY}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('xAI STT error:', response.status, errText);
      return res.status(response.status).json({ error: `STT API error: ${response.status}`, details: errText });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('STT proxy error:', err);
    res.status(500).json({ error: 'STT processing failed', details: err.message });
  }
});

// ──────────────────────────────────────────────
//  TTS Proxy — POST /api/tts
//  Accepts { text, voice_id }, returns MP3 audio
// ──────────────────────────────────────────────
app.post('/api/tts', requireDeluxe, async (req, res) => {
  try {
    const { text, voice_id = 'eve', language = 'en' } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'No text provided' });
    }

    const response = await fetch('https://api.x.ai/v1/tts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, voice_id, language }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('xAI TTS error:', response.status, errText);
      return res.status(response.status).json({ error: `TTS API error: ${response.status}`, details: errText });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length
    });

    res.send(buffer);
  } catch (err) {
    console.error('TTS proxy error:', err);
    res.status(500).json({ error: 'TTS processing failed', details: err.message });
  }
});

// ──────────────────────────────────────────────
//  Page Fetcher — POST /api/fetch-page
//  Accepts { url }, returns readable text
// ──────────────────────────────────────────────
app.post('/api/fetch-page', async (req, res) => {
  try {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'No URL provided' });

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Test12/1.0 VocalPosts',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 15000,
      follow: 5,
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch page: HTTP ${response.status}` });
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    const webmcp = await detectWebMCP(dom.window.document, html, url);

    if (!article) {
      const bodyText = dom.window.document.body?.textContent?.trim() || '';
      const title = dom.window.document.title || url;
      return res.json({
        title,
        text: bodyText.substring(0, 5000),
        excerpt: bodyText.substring(0, 200),
        links: extractLinks(dom.window.document, url),
        webmcp,
      });
    }

    const cleanText = article.textContent
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    res.json({
      title: article.title || dom.window.document.title || url,
      text: cleanText.substring(0, 8000),
      excerpt: article.excerpt || cleanText.substring(0, 200),
      links: extractLinks(dom.window.document, url),
      webmcp,
    });
  } catch (err) {
    console.error('Fetch page error:', err);
    res.status(500).json({ error: 'Failed to fetch page', details: err.message });
  }
});

// ──────────────────────────────────────────────
//  Imperative WebMCP Tool Extractor
// ──────────────────────────────────────────────
function extractImperativeTools(jsText, pageUrl) {
  const tools = [];
  let pos = 0;

  while (true) {
    const nameIdx = jsText.indexOf('name:`', pos);
    if (nameIdx === -1) break;

    const before = jsText.substring(Math.max(0, nameIdx - 10), nameIdx);
    if (!before.includes('{')) { pos = nameIdx + 1; continue; }

    const nameStart = nameIdx + 6;
    const nameEnd   = jsText.indexOf('`', nameStart);
    if (nameEnd === -1) { pos = nameIdx + 1; continue; }
    const name = jsText.substring(nameStart, nameEnd);

    const descIdx = jsText.indexOf('description:`', nameIdx);
    if (descIdx === -1 || descIdx > nameIdx + 600) { pos = nameIdx + 1; continue; }
    const descStart = descIdx + 13;
    const descEnd   = jsText.indexOf('`', descStart);
    const description = jsText.substring(descStart, descEnd);

    const schemaKeyIdx = jsText.indexOf('inputSchema:', nameIdx);
    if (schemaKeyIdx === -1 || schemaKeyIdx > nameIdx + 2000) { pos = nameIdx + 1; continue; }
    const schemaStart = jsText.indexOf('{', schemaKeyIdx);
    let depth = 0, schemaEnd = schemaStart;
    for (let i = schemaStart; i < Math.min(jsText.length, schemaStart + 3000); i++) {
      if      (jsText[i] === '{') depth++;
      else if (jsText[i] === '}') { depth--; if (depth === 0) { schemaEnd = i + 1; break; } }
    }
    const schemaStr = jsText.substring(schemaStart, schemaEnd)
      .replace(/`([^`]*)`/g, '"$1"')
      .replace(/([{,])(\s*)(\w+):/g, '$1$2"$3":')
      .replace(/enum:\w+/g, 'enum:[]')
      .replace(/,\s*([}\]])/g, '$1');

    let schema = null;
    try { schema = JSON.parse(schemaStr); } catch (_) {}

    const parameters = [];
    if (schema?.properties) {
      for (const [pname, pdef] of Object.entries(schema.properties)) {
        parameters.push({
          name:        pname,
          description: pdef.description || '',
          type:        pdef.type        || 'string',
          required:    (schema.required || []).includes(pname),
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

    if (name) {
      tools.push({ name, description, parameters, tag: 'script', action, method: 'GET', source: 'imperative' });
    }
    pos = nameEnd + 1;
  }
  return tools;
}

// ──────────────────────────────────────────────
//  WebMCP Detection
// ──────────────────────────────────────────────
async function detectWebMCP(doc, html, pageUrl) {
  const tools = [];

  const mcpEls = doc.querySelectorAll('[mcp-tool], [data-mcp-tool]');
  mcpEls.forEach((el) => {
    const name        = el.getAttribute('mcp-name')        || el.getAttribute('data-mcp-name')        || el.getAttribute('id') || 'tool';
    const description = el.getAttribute('mcp-description') || el.getAttribute('data-mcp-description') || '';
    const method      = (el.getAttribute('method') || 'GET').toUpperCase();
    const action      = el.getAttribute('action') || el.getAttribute('href') || null;

    const params = [];
    el.querySelectorAll('input, select, textarea, [mcp-parameter], [data-mcp-parameter]').forEach((p) => {
      const ptype = (p.getAttribute('type') || 'text').toLowerCase();
      if (['submit', 'button', 'reset', 'image'].includes(ptype)) return;

      const pname    = p.getAttribute('mcp-name') || p.getAttribute('data-mcp-name') || p.getAttribute('name') || p.getAttribute('id') || 'value';
      const pdesc    = p.getAttribute('mcp-description') || p.getAttribute('data-mcp-description')
                       || p.getAttribute('placeholder') || p.getAttribute('aria-label')
                       || p.getAttribute('title') || '';
      const required = p.hasAttribute('required') || p.getAttribute('mcp-required') === 'true';
      const min      = p.getAttribute('min')       || p.getAttribute('minlength')  || null;
      const max      = p.getAttribute('max')       || p.getAttribute('maxlength')  || null;
      const pattern  = p.getAttribute('pattern')   || null;

      let options = null;
      if (p.tagName.toLowerCase() === 'select') {
        options = Array.from(p.querySelectorAll('option'))
          .filter(o => o.value)
          .map(o => ({ value: o.value, label: o.textContent.trim() }));
      }

      let label = '';
      const labelEl = p.id ? doc.querySelector(`label[for="${p.id}"]`) : null;
      if (labelEl) label = labelEl.textContent.trim();

      params.push({
        name: pname,
        description: pdesc || label,
        type: ptype,
        required,
        ...(options  ? { options }  : {}),
        ...(min      ? { min }      : {}),
        ...(max      ? { max }      : {}),
        ...(pattern  ? { pattern }  : {}),
      });
    });

    tools.push({ name, description, parameters: params, tag: el.tagName.toLowerCase(), action, method });
  });

  if (tools.length === 0) {
    doc.querySelectorAll('[toolname], [data-toolname]').forEach((el) => {
      const name        = el.getAttribute('toolname')        || el.getAttribute('data-toolname')        || el.getAttribute('id') || 'tool';
      const description = el.getAttribute('tooldescription') || el.getAttribute('data-tooldescription') || '';
      const method      = (el.getAttribute('method') || 'GET').toUpperCase();
      const action      = el.getAttribute('action') || el.getAttribute('href') || null;

      const params = [];
      el.querySelectorAll('input, select, textarea').forEach((p) => {
        const ptype = (p.getAttribute('type') || 'text').toLowerCase();
        if (['submit', 'button', 'reset', 'image'].includes(ptype)) return;

        const pname    = p.getAttribute('name') || p.getAttribute('id') || 'value';
        const pdesc    = p.getAttribute('toolparamdescription') || p.getAttribute('data-toolparamdescription')
                         || p.getAttribute('placeholder') || p.getAttribute('aria-label') || p.getAttribute('title') || '';
        const required = p.hasAttribute('required');
        const min      = p.getAttribute('min') || p.getAttribute('minlength') || null;
        const max      = p.getAttribute('max') || p.getAttribute('maxlength') || null;

        let options = null;
        if (p.tagName.toLowerCase() === 'select') {
          options = Array.from(p.querySelectorAll('option'))
            .filter(o => o.value)
            .map(o => ({ value: o.value, label: o.textContent.trim() }));
        }

        const labelEl = p.id ? doc.querySelector(`label[for="${p.id}"]`) : null;
        const label   = labelEl ? labelEl.textContent.trim() : '';

        params.push({
          name: pname,
          description: pdesc || label,
          type: ptype,
          required,
          ...(options ? { options } : {}),
          ...(min     ? { min }     : {}),
          ...(max     ? { max }     : {}),
        });
      });

      tools.push({ name, description, parameters: params, tag: el.tagName.toLowerCase(), action, method });
    });
  }

  const lc = html.toLowerCase();
  const imperative =
    lc.includes('navigator.modelcontext') ||
    lc.includes('__webmcp') ||
    lc.includes('registertool') ||
    (lc.includes('webmcp') && lc.includes('tool'));

  const meta = !!doc.querySelector('meta[name="webmcp"], meta[name="mcp"]');

  if (tools.length === 0 && imperative && pageUrl) {
    const scriptEls = Array.from(doc.querySelectorAll('script[src]'));
    for (const el of scriptEls) {
      const src = el.getAttribute('src');
      if (!src) continue;
      try {
        const scriptUrl = new URL(src, pageUrl).href;
        const r = await fetch(scriptUrl, { timeout: 12000, headers: { 'User-Agent': 'BuzzVoice/1.0' } });
        if (!r.ok) continue;
        const jsText = await r.text();
        const extracted = extractImperativeTools(jsText, pageUrl);
        if (extracted.length > 0) {
          tools.push(...extracted);
          break;
        }
      } catch (_) { /* skip unreadable scripts */ }
    }
  }

  const compliant = mcpEls.length > 0 || (doc.querySelectorAll('[toolname]').length > 0) || imperative || meta || tools.length > 0;
  const source    = tools.length > 0 && tools[0].source === 'imperative' ? 'imperative'
                  : mcpEls.length > 0 || doc.querySelectorAll('[toolname]').length > 0 ? 'declarative'
                  : imperative ? 'imperative' : meta ? 'meta' : 'none';

  return { compliant, tools, source };
}

// ──────────────────────────────────────────────
//  Grok Tool-Call — POST /api/grok-tool-call
// ──────────────────────────────────────────────
app.post('/api/grok-tool-call', async (req, res) => {
  try {
    const { text, tools, pageUrl, pageTitle } = req.body;
    if (!text || !tools?.length) return res.status(400).json({ error: 'text and tools required' });

    const toolSchemas = tools.map(t => ({
      name: t.name,
      description: t.description,
      method: t.method || 'GET',
      action: t.action,
      parameters: t.parameters.map(p => ({
        name: p.name,
        description: p.description,
        type: p.type,
        required: p.required,
        ...(p.options  ? { options: p.options }   : {}),
        ...(p.min      ? { min: p.min }            : {}),
        ...(p.max      ? { max: p.max }            : {}),
        ...(p.pattern  ? { pattern: p.pattern }    : {}),
      }))
    }));

    const today = new Date().toISOString().slice(0, 10);

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${XAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a voice browser assistant that fills web forms from spoken user input. '
              + 'The user has spoken a command and you must identify the best matching WebMCP tool and provide a value for EVERY parameter it defines. '
              + 'Rules:\n'
              + '- You MUST return a value for every parameter, even if you must infer a reasonable default.\n'
              + '- For "select" parameters, choose a value from the provided options list.\n'
              + '- For date parameters, use ISO 8601 format (YYYY-MM-DD). Today is ' + today + '.\n'
              + '- For time parameters, use HH:MM (24h) format.\n'
              + '- For number parameters, return a plain integer or decimal.\n'
              + '- If the user did not specify a value for a field, infer the most reasonable value from context or use a sensible default.\n'
              + '- After selecting the tool and filling all params, SIMULATE the tool execution and produce a realistic post-execution reply as if the tool ran successfully.\n'
              + '- If the tool is a reservation or booking tool, generate a realistic confirmation number (e.g. LPB-000001 for a bistro, RES-10042 for a hotel, etc.) and include it in the reply.\n'
              + '- The "reply" field MUST be the FINAL spoken confirmation the user hears AFTER the tool executes — it should include the confirmation number, date, time, name, and any other key booking details.\n'
              + 'Respond ONLY with a valid JSON object in this exact shape: '
              + '{ "tool": "<tool_name>", "method": "GET|POST", "params": { "<field_name>": "<value>", ... }, "reply": "<complete post-execution spoken confirmation including confirmation number>" }. '
              + 'If no tool matches, set "tool" to null.',
          },
          {
            role: 'user',
            content:
              `Page: ${pageTitle} (${pageUrl})\n`
              + `User said: "${text}"\n\n`
              + `Available WebMCP tools:\n${JSON.stringify(toolSchemas, null, 2)}`,
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const content = JSON.parse(data.choices[0].message.content);
    res.json(content);
  } catch (e) {
    console.error('grok-tool-call error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
//  Grok Chat Proxy — POST /api/grok-chat
//  Thin proxy to xAI chat completions (keeps API key server-side).
//  Body: OpenAI-compatible { model, messages, tools?, tool_choice?, max_tokens? }
// ──────────────────────────────────────────────
app.post('/api/grok-chat', async (req, res) => {
  try {
    const body = req.body;
    if (!body?.messages?.length) return res.status(400).json({ error: 'messages required' });
    // Default to cheapest model with function calling
    if (!body.model) body.model = 'grok-3-mini';
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${XAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) {
    console.error('/api/grok-chat error:', err);
    res.status(500).json({ error: err.message });
  }
});


function extractLinks(document, baseUrl) {
  const links = [];
  const anchors = document.querySelectorAll('a[href]');
  const seen = new Set();


  anchors.forEach((a) => {
    if (links.length >= 20) return;
    const text = a.textContent?.trim();
    let href = a.getAttribute('href');
    if (!text || text.length < 2 || !href) return;
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;

    try {
      href = new URL(href, baseUrl).href;
    } catch { return; }

    if (seen.has(href)) return;
    seen.add(href);

    links.push({ index: links.length + 1, text: text.substring(0, 80), url: href });
  });

  return links;
}

// ──────────────────────────────────────────────
//  Parse Post — POST /api/parse-post
// ──────────────────────────────────────────────
app.post('/api/parse-post', async (req, res) => {
  try {
    const text = (req.body?.text || '').toString().trim();
    const defaultAuthor = (req.body?.defaultAuthor || '').toString().trim();
    if (!text) return res.status(400).json({ error: 'text is required' });

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${XAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [
          {
            role: 'system',
            content:
              'You extract a person\'s display name and the message they want to post from a spoken sentence. '
              + 'Return ONLY a strict JSON object of the form: {"name": "<string>", "message": "<string>"}. '
              + 'Rules:\n'
              + '- If the user introduces themselves ("my name is X", "I am X", "this is X"), set "name" to that. Otherwise return an empty string for name.\n'
              + '- Set "message" to the actual content the user wants posted, faithful to their words.\n'
              + '- Strip framing/filler such as "I would like to do a post", "the post is", "post it please", "and then post it" from the message — keep only the post body itself.\n'
              + '- Do not add or invent content; do not translate; preserve the original language of the message.\n'
              + '- Capitalize and lightly punctuate the message naturally if it was clearly dictated without punctuation.',
          },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    let parsed = { name: '', message: '' };
    try { parsed = JSON.parse(data.choices[0].message.content); } catch (_) {}
    res.json({
      name: (parsed.name || '').toString().trim() || defaultAuthor,
      message: (parsed.message || '').toString().trim(),
    });
  } catch (e) {
    console.error('parse-post error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
//  Voice Posts — POST /api/voice-posts
// ──────────────────────────────────────────────
app.post('/api/voice-posts', async (req, res) => {
  if (!db.isReady()) {
    return res.status(503).json({ error: 'Database not connected', details: String(db.getLastError() || 'unknown') });
  }
  const text = (req.body?.text || req.body?.message || '').toString().trim();
  const author = (req.body?.author || req.body?.name || '').toString().trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  if (!author) return res.status(400).json({ error: 'author is required' });
  if (text.length > 2000) return res.status(400).json({ error: 'text too long (max 2000 chars)' });
  if (author.length > 120) return res.status(400).json({ error: 'author too long (max 120 chars)' });
  const parentId = req.body?.parent_id ?? null;
  try {
    const post = await db.insertPost({ text, author, parentId });
    res.json({ post });
  } catch (err) {
    console.error('voice-posts insert error:', err);
    if (err.code === 'PARENT_NOT_FOUND') {
      return res.status(400).json({ error: 'parent_id refers to a post that does not exist' });
    }
    if (err.code === 'MAX_DEPTH') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to save voice post', details: err.message });
  }
});

// ──────────────────────────────────────────────
//  Voice Posts — GET /api/voice-posts
// ──────────────────────────────────────────────



app.get('/api/voice-posts', async (req, res) => {
  if (!db.isReady()) {
    return res.status(503).json({ error: 'Database not connected', details: String(db.getLastError() || 'unknown') });
  }
  try {
    const posts = await db.listPosts({ limit: req.query.limit });
    res.json({ posts });
  } catch (err) {
    console.error('voice-posts list error:', err);
    res.status(500).json({ error: 'Failed to load voice posts', details: err.message });
  }
});

// ──────────────────────────────────────────────
//  MCP Streamable HTTP — POST/GET/DELETE /mcp
//  Exposes all tools via the MCP protocol
// ──────────────────────────────────────────────
const { randomUUID } = require('crypto');
const { registerTools } = require('./mcp-tools');

// Eager-load MCP SDK at startup (runs in parallel with db.init below)
const mcpReady = (async () => {
  const mcpMod = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const httpMod = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
  const zodMod = await import('zod');
  return { McpServer: mcpMod.McpServer, StreamableHTTPServerTransport: httpMod.StreamableHTTPServerTransport, z: zodMod.z };
})();

function createMcpServer(McpServer, z) {
  const srv = new McpServer({
    name: 'test12',
    version: '1.0.0',
    description: 'Test12 — voice-first social posting with WebMCP browsing',
  });
  registerTools(srv, z);
  return srv;
}

// Stateless: every POST creates a fresh server+transport (Lambda-safe).
// sessionIdGenerator = undefined → stateless mode, no session tracking.
app.post('/mcp', async (req, res) => {
  try {
    const { McpServer, StreamableHTTPServerTransport, z } = await mcpReady;
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    const server = createMcpServer(McpServer, z);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP POST error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// GET/DELETE not supported in stateless mode
app.get('/mcp', (req, res) => {
  res.status(405).json({ error: 'SSE not supported in stateless mode. Use POST.' });
});

app.delete('/mcp', (req, res) => {
  res.status(405).json({ error: 'Session deletion not supported in stateless mode.' });
});

// ──────────────────────────────────────────────
//  Private Chat Channels — API
// ──────────────────────────────────────────────

// WebSocket broadcast (uses API Gateway Management API + DynamoDB)
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const sns = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const ses = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });
const SES_FROM = process.env.SES_FROM || 'noreply@test12.net';
const wsBroadcast = require('./ws-broadcast');

// ── Identifier helpers ──
function isEmail(str) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str); }
function normalizeId(raw) {
  raw = (raw || '').trim();
  if (isEmail(raw)) return raw.toLowerCase();
  const digits = raw.replace(/\D/g, '');
  return digits; // store as digit string for phones
}

// ──────────────────────────────────────────────
//  Auth Middleware
// ──────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const session = await db.getSession(token);
    if (!session) return res.status(401).json({ error: 'Invalid or expired session' });
    req.user = session;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Auth check failed', details: err.message });
  }
}

// ──────────────────────────────────────────────
//  Auth Routes
// ──────────────────────────────────────────────

// GET /api/config/client — public config for frontend (no secrets)
app.get('/api/config/client', (_req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID || null,
    appleServiceId: process.env.APPLE_SERVICE_ID || null,
  });
});

// POST /api/auth/auto-register  — passwordless, USERID + GPS Plus Code
app.post('/api/auth/auto-register', async (req, res) => {
  if (!db.isReady()) return res.status(503).json({ error: 'Database not connected' });
  const { userId, pin, plusCode } = req.body || {};
  if (!userId || typeof userId !== 'string' || userId.length < 5)
    return res.status(400).json({ error: 'Invalid userId' });
  try {
    const { token, displayName, isNew } = await db.autoRegister(userId.trim(), String(pin || '00'), plusCode || '');
    res.json({ token, displayName, isNew });
  } catch (err) {
    console.error('auto-register error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/pin-login
app.post('/api/auth/pin-login', async (req, res) => {
  if (!db.isReady()) return res.status(503).json({ error: 'Database not connected' });
  const { userId, pin } = req.body || {};
  if (!userId || !pin) return res.status(400).json({ error: 'userId and pin are required' });
  try {
    const { token, displayName } = await db.pinLogin(userId.trim().toUpperCase(), String(pin).trim());
    res.json({ token, displayName });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// POST /api/auth/send-otp
app.post('/api/auth/send-otp', async (req, res) => {
  if (!db.isReady()) return res.status(503).json({ error: 'Database not connected' });
  const raw = (req.body?.identifier || req.body?.phone || '').trim();
  const id = normalizeId(raw);
  if (!id || (!isEmail(id) && id.length < 10))
    return res.status(400).json({ error: 'Enter a valid phone number or email address.' });
  try {
    const code = await db.createOTP(id);
    const isLocal = !process.env.BASE_URL || process.env.BASE_URL.includes('localhost');
    if (isLocal) {
      // Dev mode — print code to console instead of sending SMS/email
      console.log(`\n  🔑  OTP for ${id}: ${code}\n`);
      return res.json({ sent: true, via: 'console (dev mode)' });
    }
    if (isEmail(id)) {
      await ses.send(new SendEmailCommand({
        Source: SES_FROM,
        Destination: { ToAddresses: [id] },
        Message: {
          Subject: { Data: 'Your Test One Two verification code' },
          Body: { Text: { Data: `Your Test One Two code: ${code}\n\nThis code expires in 5 minutes.` } },
        },
      }));
    } else {
      const e164 = id.length === 10 ? `+1${id}` : `+${id}`;
      await sns.send(new PublishCommand({
        PhoneNumber: e164,
        Message: `Your Test One Two code: ${code}\n\n@test12.net #${code}`,
      }));
    }
    res.json({ sent: true, via: isEmail(id) ? 'email' : 'sms' });
  } catch (err) {
    console.error('send-otp error:', err);
    res.status(500).json({ error: 'Failed to send code', details: err.message });
  }
});

// POST /api/auth/verify-otp
app.post('/api/auth/verify-otp', async (req, res) => {
  if (!db.isReady()) return res.status(503).json({ error: 'Database not connected' });
  const raw = (req.body?.identifier || req.body?.phone || '').trim();
  const id = normalizeId(raw);
  const code = String(req.body?.code || '').trim();
  if (!id || !code) return res.status(400).json({ error: 'identifier and code required' });
  try {
    const valid = await db.verifyAndConsumeOTP(id, code);
    if (!valid) return res.status(400).json({ error: 'Invalid or expired code' });
    const user = await db.getOrCreateUser(id);
    const token = await db.createSession(id);
    res.json({ token, identifier: id, displayName: user.displayName || '' });
  } catch (err) {
    console.error('verify-otp error:', err);
    res.status(500).json({ error: 'Verification failed', details: err.message });
  }
});

// POST /api/auth/google  — verify Google credential (ID token OR auth code)
app.post('/api/auth/google', async (req, res) => {
  if (!googleClient) return res.status(503).json({ error: 'Google login not configured' });
  const { credential, code } = req.body || {};
  try {
    let email, name;
    if (credential) {
      // ID token path (One Tap legacy)
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      const p = ticket.getPayload();
      email = p.email; name = p.name;
    } else if (code) {
      // Authorization code path (initCodeClient popup)
      // For GIS popup mode, redirect_uri must be 'postmessage'
      const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 'postmessage');
      const { tokens } = await oauthClient.getToken(code);

      const ticket = await oauthClient.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE_CLIENT_ID });
      const p = ticket.getPayload();
      email = p.email; name = p.name;
    } else {
      return res.status(400).json({ error: 'credential or code required' });
    }
    if (!email) return res.status(400).json({ error: 'No email from Google' });
    const user = await db.getOrCreateUser(email);
    const token = await db.createSession(email);
    res.json({ token, identifier: email, displayName: user.displayName || name || '' });
  } catch (err) {
    console.error('google-auth error:', err);
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

// POST /api/auth/apple  — verify Apple identity token, return session
app.post('/api/auth/apple', async (req, res) => {
  const { id_token, user: appleUser } = req.body || {};
  if (!id_token) return res.status(400).json({ error: 'id_token required' });
  try {
    // Fetch Apple’s public keys
    const keysRes = await fetch('https://appleid.apple.com/auth/keys');
    const { keys } = await keysRes.json();
    // Decode header to find the right key
    const [headerB64] = id_token.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    const jwk = keys.find(k => k.kid === header.kid);
    if (!jwk) return res.status(401).json({ error: 'Apple key not found' });
    // Build PEM from JWK
    const { createPublicKey } = require('crypto');
    const pubKey = createPublicKey({ key: jwk, format: 'jwk' });
    const pem = pubKey.export({ type: 'spki', format: 'pem' });
    // Verify JWT
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(id_token, pem, { algorithms: ['RS256'] });
    const email = decoded.email || (appleUser && appleUser.email);
    if (!email) return res.status(400).json({ error: 'No email from Apple' });
    const user = await db.getOrCreateUser(email);
    const token = await db.createSession(email);
    const displayName = (appleUser?.name)
      ? `${appleUser.name.firstName || ''} ${appleUser.name.lastName || ''}`.trim()
      : (user.displayName || '');
    res.json({ token, identifier: email, displayName });
  } catch (err) {
    console.error('apple-auth error:', err);
    res.status(401).json({ error: 'Apple token verification failed' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.phone);
    const isActiveDeluxe = user?.plan === 'deluxe' &&
      (!user.deluxeExpiresAt || new Date(user.deluxeExpiresAt) > new Date());
    res.json({
      phone: user?.phone || req.user.phone,
      displayName: user?.displayName || '',
      plan: isActiveDeluxe ? 'deluxe' : 'standard',
      deluxeType: isActiveDeluxe ? (user.deluxeType || 'xai') : null,
      deluxeExpiresAt: isActiveDeluxe ? user.deluxeExpiresAt : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/profile — update display name
app.post('/api/auth/profile', requireAuth, async (req, res) => {
  const displayName = (req.body?.displayName || '').trim();
  if (!displayName) return res.status(400).json({ error: 'displayName required' });
  try {
    await db.updateUserProfile(req.user.phone, { displayName });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    await db.deleteSession(token);
    res.json({ ok: true });
  } catch (_) {
    res.json({ ok: true }); // always succeed
  }
});

// GET /api/channels — list channels the authenticated user is a member of
app.get('/api/channels', requireAuth, async (req, res) => {
  if (!db.isReady()) return res.status(503).json({ error: 'Database not connected' });
  try {
    const channelIds = await db.getUserChannelIds(req.user.phone);
    if (!channelIds.length) return res.json({ channels: [] });
    const channels = (await Promise.all(channelIds.map(id => db.getChannelById(id).catch(() => null)))).filter(Boolean);
    // Sort newest first
    channels.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ channels });
  } catch (err) {
    console.error('list-channels error:', err);
    res.status(500).json({ error: 'Failed to list channels', details: err.message });
  }
});

// POST /api/channels — create a new private channel
app.post('/api/channels', requireAuth, async (req, res) => {
  if (!db.isReady()) return res.status(503).json({ error: 'Database not connected' });
  const name = (req.body?.name || '').toString().trim() || 'Private Chat';
  const createdBy = req.user.phone;
  if (name.length > 200) return res.status(400).json({ error: 'name too long (max 200)' });
  try {
    const id = randomUUID().replace(/-/g, '').substring(0, 12);
    const channel = await db.createChannel({ id, name, createdBy });
    await db.addChannelMember(createdBy, channel.id); // auto-member
    res.json({ channel, url: `/private/${id}` });
  } catch (err) {
    console.error('create-channel error:', err);
    res.status(500).json({ error: 'Failed to create channel', details: err.message });
  }
});

// POST /api/channels/:id/join — register as a member of an existing channel
app.post('/api/channels/:id/join', requireAuth, async (req, res) => {
  if (!db.isReady()) return res.status(503).json({ error: 'Database not connected' });
  try {
    const channel = await db.getChannelById(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    await db.addChannelMember(req.user.phone, req.params.id);
    res.json({ ok: true, channel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/channels/:id — get channel info + messages + WebSocket URL
app.get('/api/channels/:id', async (req, res) => {
  if (!db.isReady()) return res.status(503).json({ error: 'Database not connected' });
  try {
    const channel = await db.getChannelById(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const messages = await db.listChannelMessages({ channelId: req.params.id, limit: 200 });

    // Get live user count from DynamoDB (if WS_ENDPOINT is configured)
    let userCount = 0;
    try {
      const info = await wsBroadcast.getChannelUserCount(req.params.id);
      userCount = info.count;
    } catch (_) { /* DynamoDB may not be available locally */ }

    res.json({
      channel,
      messages,
      userCount,
      wsUrl: process.env.WS_URL || null, // WebSocket URL for clients
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/channels/:id/messages — send a message + broadcast via WebSocket
app.post('/api/channels/:id/messages', async (req, res) => {
  if (!db.isReady()) return res.status(503).json({ error: 'Database not connected' });
  const channelId = req.params.id;
  const text = (req.body?.text || req.body?.message || '').toString().trim();
  const author = (req.body?.author || req.body?.name || '').toString().trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  if (!author) return res.status(400).json({ error: 'author is required' });
  if (text.length > 2000) return res.status(400).json({ error: 'text too long (max 2000)' });
  try {
    const channel = await db.getChannelById(channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const msg = await db.insertChannelMessage({ channelId, author, text });
    // Broadcast via WebSocket API Gateway
    try { await wsBroadcast.broadcastToChannel(channelId, 'message', msg); } catch (_) {}
    res.json({ message: msg });
  } catch (err) {
    console.error('channel-message error:', err);
    res.status(500).json({ error: 'Failed to send message', details: err.message });
  }
});

// GET /api/channels/:id/messages — list messages (with optional afterId for polling)
app.get('/api/channels/:id/messages', async (req, res) => {
  if (!db.isReady()) return res.status(503).json({ error: 'Database not connected' });
  try {
    const messages = await db.listChannelMessages({
      channelId: req.params.id,
      limit: req.query.limit,
      afterId: req.query.after_id,
    });
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/session — xAI ephemeral token (Deluxe xAI only)
// ── Addon limit guard: 402 if user has consumed all purchased minutes ──
async function checkAddonLimit(userId, addonType) {
  const [usedMins, purchasedMins] = await Promise.all([
    db.getAddonUsedMins(userId, addonType),
    db.getAddonPurchasedMins(userId, addonType),
  ]);
  // If nothing purchased yet, fall back to one block so demos still work
  const limitMins = purchasedMins > 0 ? purchasedMins : db.ADDON_BLOCK_MINS;
  const remaining = limitMins - usedMins;
  return { usedMins, remaining, limitMins, purchasedMins, exceeded: remaining <= 0 };
}

// GET /api/addon/remaining?addonType=xai — remaining minutes for current user
app.get('/api/addon/remaining', requireAuth, async (req, res) => {
  const { addonType } = req.query;
  const VALID = ['claude-sonnet', 'xai', 'openai'];
  if (!VALID.includes(addonType)) return res.status(400).json({ error: 'Invalid addonType' });
  try {
    const info = await checkAddonLimit(req.user.phone, addonType);
    res.json(info); // { usedMins, remaining, limitMins, purchasedMins, exceeded }
  } catch (err) {
    console.error('addon/remaining error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/session', requireDeluxe, async (req, res) => {
  if (req.deluxeType && req.deluxeType !== 'xai') {
    return res.status(403).json({ error: 'This endpoint is for xAI Deluxe only.' });
  }
  const limit = await checkAddonLimit(req.user.phone, 'xai').catch(() => null);
  if (limit?.exceeded) {
    return res.status(402).json({ error: 'xAI Voice block exhausted (3-hour limit reached).', usedMins: limit.usedMins, limitMins: limit.limitMins });
  }
  try {
    const r = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json(data);
  } catch (err) {
    console.error('session token error:', err);
    res.status(500).json({ error: 'Failed to get session token', details: err.message });
  }
});
// POST /api/openai-session — OpenAI realtime ephemeral token (Deluxe OpenAI only)
app.post('/api/openai-session', requireDeluxe, async (req, res) => {
  if (req.deluxeType && req.deluxeType !== 'openai') {
    return res.status(403).json({ error: 'This endpoint is for OpenAI Deluxe only.' });
  }
  const limit = await checkAddonLimit(req.user.phone, 'openai').catch(() => null);
  if (limit?.exceeded) {
    return res.status(402).json({ error: 'OpenAI Realtime block exhausted (3-hour limit reached).', usedMins: limit.usedMins, limitMins: limit.limitMins });
  }
  if (!OPENAI_API_KEY) return res.status(503).json({ error: 'OpenAI API not configured' });
  try {
    const r = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'gpt-realtime-2', voice: 'alloy' }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json(data);
  } catch (err) {
    console.error('OpenAI session token error:', err);
    res.status(500).json({ error: 'Failed to get OpenAI session token', details: err.message });
  }
});


app.get('/private', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'private.html'));
});

// Serve channel page for /private/:id
app.get('/private/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'channel.html'));
});

// ──────────────────────────────────────────────
//  Claude Chat — POST /api/claude-chat
//  Standard plan: Claude Haiku with MCP tool dispatch + token usage logging.
//  Body: { transcript, systemPrompt?, tools? }
// ──────────────────────────────────────────────
const CLAUDE_MODEL = 'claude-haiku-4-5';
const CLAUDE_INPUT_COST_PER_M  = 0.80;  // USD per 1M input tokens
const CLAUDE_OUTPUT_COST_PER_M = 4.00;  // USD per 1M output tokens

const TEST12_SYSTEM_PROMPT =
  'You are a concise voice assistant for Test12, a social voice-posting platform. '
  + 'Keep all replies under 30 words — they will be spoken aloud by text-to-speech. '
  + 'Never use markdown, bullet points, or code blocks. '
  + 'Always respond in the same language the user spoke in. '
  + 'Use the provided tools to fulfill requests. After a tool call, confirm briefly what was done. '
  + 'IMPORTANT: You do NOT have a contacts directory. You cannot look up users by display name or alias. '
  + 'To invite someone to a channel you need their phone number or email. '
  + 'If the user mentions a name you do not have contact info for, say exactly: "I don\'t have contact information for [name]. Please provide their phone number or email." '
  + 'Never pretend to search for or add a contact you were not explicitly given.';

app.post('/api/claude-chat', requireAuth, async (req, res) => {
  if (!ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Claude API not configured' });
  const { transcript, systemPrompt, tools = [] } = req.body || {};
  if (!transcript) return res.status(400).json({ error: 'transcript required' });
  const userId = req.user.phone;

  // Select model: Sonnet for active deluxe-claude users, Haiku for everyone else
  const user = await db.getUserById(userId).catch(() => null);
  const isDeluxeClaude = user?.plan === 'deluxe' &&
    user?.deluxeType === 'claude-sonnet' &&
    (!user.deluxeExpiresAt || new Date(user.deluxeExpiresAt) > new Date());
  const model = isDeluxeClaude ? 'claude-sonnet-4-5' : CLAUDE_MODEL;
  if (isDeluxeClaude) console.log(`Claude-chat: using Sonnet for deluxe user ${userId}`);
  // Build Anthropic tools array from MCP schema
  const anthropicTools = tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object',
      properties: t.parameters?.properties || {},
      required: t.parameters?.required || [],
    },
  }));

  const messages = [{ role: 'user', content: transcript }];

  // First API call — may return tool_use
  let claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system: systemPrompt || TEST12_SYSTEM_PROMPT,
      tools: anthropicTools.length ? anthropicTools : undefined,
      messages,
    }),
  });

  if (!claudeResp.ok) {
    const err = await claudeResp.text();
    console.error('Claude API error:', claudeResp.status, err);
    return res.status(claudeResp.status).json({ error: `Claude error: ${claudeResp.status}` });
  }

  let claudeData = await claudeResp.json();
  let totalInput  = claudeData.usage?.input_tokens  || 0;
  let totalOutput = claudeData.usage?.output_tokens || 0;
  const toolCalls = [];
  let finalText = '';

  // Handle tool_use block
  if (claudeData.stop_reason === 'tool_use') {
    const toolUseBlocks = claudeData.content.filter(b => b.type === 'tool_use');
    for (const tu of toolUseBlocks) {
      toolCalls.push({ name: tu.name, input: tu.input });
    }
    // Get follow-up reply after tool call
    const assistantMsg = { role: 'assistant', content: claudeData.content };
    // Build tool results — execute channel-list tools server-side so Claude sees real data
    const toolResults = await Promise.all(toolUseBlocks.map(async tu => {
      let content = JSON.stringify({ ok: true, note: 'Tool executed on client.' });
      const isCreatedTool = tu.name === 'list_private_channels_I_created';
      const isJoinedTool  = tu.name === 'list_the_private_channels_I_joined';
      if (isCreatedTool || isJoinedTool) {
        try {
          const userProfile = await db.getUserByPhone(req.user.phone).catch(() => null);
          const displayName = userProfile?.displayName || '';
          const ids = await db.getUserChannelIds(req.user.phone);
          const all = (await Promise.all(ids.map(id => db.getChannelById(id).catch(() => null)))).filter(Boolean);
          const isCreator = ch => ch.created_by === req.user.phone || ch.created_by === displayName;
          const chs = isCreatedTool ? all.filter(isCreator) : all.filter(ch => !isCreator(ch));
          content = JSON.stringify({
            channels: chs.map(ch => ({ id: ch.id, name: ch.name, created_by: ch.created_by }))
          });
        } catch (e) { content = JSON.stringify({ error: e.message }); }
      }
      return { type: 'tool_result', tool_use_id: tu.id, content };
    }));
    messages.push(assistantMsg, { role: 'user', content: toolResults });

    const followResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 256,
        system: systemPrompt || TEST12_SYSTEM_PROMPT,
        messages,
      }),
    });
    if (followResp.ok) {
      const followData = await followResp.json();
      totalInput  += followData.usage?.input_tokens  || 0;
      totalOutput += followData.usage?.output_tokens || 0;
      finalText = followData.content?.find(b => b.type === 'text')?.text || 'Done.';
    } else {
      finalText = 'Done.';
    }
  } else {
    finalText = claudeData.content?.find(b => b.type === 'text')?.text || '';
  }

  // Log token usage for billing (non-fatal)
  const costUsd = (totalInput / 1_000_000) * CLAUDE_INPUT_COST_PER_M
                + (totalOutput / 1_000_000) * CLAUDE_OUTPUT_COST_PER_M;
  db.logUsage({ userId, model: CLAUDE_MODEL, inputTokens: totalInput, outputTokens: totalOutput, costUsd })
    .catch(err => console.warn('Usage log failed:', err.message));

  res.json({ text: finalText, toolCalls, usage: { inputTokens: totalInput, outputTokens: totalOutput, costUsd } });
});

// ──────────────────────────────────────────────
//  Billing — GET /api/billing/status
//  Returns the authenticated user's Stripe subscription status and usage summary
// ──────────────────────────────────────────────
app.get('/api/billing/status', requireAuth, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.phone);
    const usage = await db.getUsageSummary({ userId: req.user.phone });
    res.json({
      plan: user?.plan || 'standard',
      stripeCustomerId: user?.stripeCustomerId || null,
      stripeSubscriptionId: user?.stripeSubscriptionId || null,
      usage,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  Billing — POST /api/billing/create-checkout
//  Creates a Stripe Checkout Session for a one-time 3-hour Deluxe pass
// ──────────────────────────────────────────────
const DELUXE_DURATION_HOURS = 3;
const MONTHLY_PRICE_ID = process.env.STRIPE_MONTHLY_SUBSCRIPTION_PRICE_ID;

// ──────────────────────────────────────────────
//  Billing — POST /api/billing/create-subscription
//  Creates a Stripe Checkout Session for the Standard monthly plan
// ──────────────────────────────────────────────
app.post('/api/billing/create-subscription', requireAuth, async (req, res) => {
  if (!STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Stripe not configured' });
  if (!MONTHLY_PRICE_ID) return res.status(503).json({ error: 'Monthly plan not configured' });
  try {
    const stripe = require('stripe')(STRIPE_SECRET_KEY);
    const user = await db.getUserById(req.user.phone);
    const baseUrl = process.env.BASE_URL || 'https://test12.net';
    let customerId = user?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { userId: req.user.phone, displayName: user?.displayName || '' },
      });
      customerId = customer.id;
      await db.setStripeCustomerId(req.user.phone, customerId);
    }
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: MONTHLY_PRICE_ID, quantity: 1 }],
      success_url: `${baseUrl}/?subscribed=1`,
      cancel_url:  `${baseUrl}/upgrade`,
      metadata: { userId: req.user.phone },
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe subscription checkout error:', err);
    res.status(500).json({ error: err.message });
  }
});

const DELUXE_PRICE_IDS = {
  'xai':          process.env.STRIPE_DELUXE_XAI_PRICE_ID,
  'claude-sonnet': process.env.STRIPE_DELUXE_CLAUDE_PRICE_ID,
  'openai':       process.env.STRIPE_DELUXE_OPENAI_PRICE_ID,
};

app.post('/api/billing/create-checkout', requireAuth, async (req, res) => {
  if (!STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Stripe not configured' });
  const { type = 'xai' } = req.body || {};
  if (!DELUXE_PRICE_IDS[type]) return res.status(400).json({ error: `Unknown deluxe type: ${type}` });
  try {
    const stripe = require('stripe')(STRIPE_SECRET_KEY);
    const user = await db.getUserById(req.user.phone);
    const baseUrl = process.env.BASE_URL || 'https://test12.net';
    let customerId = user?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { userId: req.user.phone, displayName: user?.displayName || '' },
      });
      customerId = customer.id;
      await db.setStripeCustomerId(req.user.phone, customerId);
    }
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: DELUXE_PRICE_IDS[type], quantity: 1 }],
      success_url: `${baseUrl}/?upgraded=1&type=${type}`,
      cancel_url:  `${baseUrl}/upgrade`,
      metadata: { userId: req.user.phone, deluxeType: type },
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  Billing — POST /api/billing/create-checkout-multi
//  Creates a Stripe Checkout Session with the monthly subscription
//  plus any selected 3-hour blocks as additional line items
// ──────────────────────────────────────────────
app.post('/api/billing/create-checkout-multi', requireAuth, async (req, res) => {
  if (!STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Stripe not configured' });
  if (!MONTHLY_PRICE_ID)  return res.status(503).json({ error: 'Monthly plan not configured' });
  const { blocks = [] } = req.body || {};
  // Validate block types
  const validBlocks = blocks.filter(b => DELUXE_PRICE_IDS[b]);
  try {
    const stripe = require('stripe')(STRIPE_SECRET_KEY);
    const user = await db.getUserById(req.user.phone);
    const baseUrl = process.env.BASE_URL || 'https://test12.net';
    let customerId = user?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { userId: req.user.phone, displayName: user?.displayName || '' },
      });
      customerId = customer.id;
      await db.setStripeCustomerId(req.user.phone, customerId);
    }
    // Monthly subscription line item (recurring)
    // One-time block charges are added to the first invoice via add_invoice_items
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: MONTHLY_PRICE_ID, quantity: 1 }],
      subscription_data: {
        // One-time charges billed on the first invoice alongside the subscription
        add_invoice_items: validBlocks.map(b => ({ price: DELUXE_PRICE_IDS[b], quantity: 1 })),
        metadata: { userId: req.user.phone, blocks: validBlocks.join(',') },
      },
      success_url: `${baseUrl}/?subscribed=1&blocks=${validBlocks.join(',')}`,
      cancel_url:  `${baseUrl}/`,
      metadata: { userId: req.user.phone, blocks: validBlocks.join(',') },
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Multi checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  Add-on session tracking
//  POST /api/addon/session/start  → { sessionId }
//  POST /api/addon/session/end    → 204
//  GET  /api/addon/usage          → { usage: { 'claude-sonnet': { sessionCount, totalMins, lastUsed }, … } }
// ──────────────────────────────────────────────
app.post('/api/addon/session/start', requireAuth, async (req, res) => {
  const { addonType } = req.body || {};
  const VALID = ['claude-sonnet', 'xai', 'openai'];
  if (!VALID.includes(addonType)) return res.status(400).json({ error: 'Invalid addonType' });
  const limit = await checkAddonLimit(req.user.phone, addonType).catch(() => null);
  if (limit?.exceeded) {
    return res.status(402).json({ error: `${addonType} block exhausted (3-hour limit reached).`, usedMins: limit.usedMins, limitMins: limit.limitMins });
  }
  try {
    const sessionId = await db.startAddonSession(req.user.phone, addonType);
    res.json({ sessionId, remainingMins: limit ? Math.max(0, limit.remaining) : db.ADDON_BLOCK_MINS, purchasedMins: limit?.limitMins ?? db.ADDON_BLOCK_MINS });
  } catch (err) {
    console.error('addon/session/start error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/addon/session/end', requireAuth, async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  try {
    await db.endAddonSession(sessionId, req.user.phone);
    res.sendStatus(204);
  } catch (err) {
    console.error('addon/session/end error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/addon/usage', requireAuth, async (req, res) => {
  try {
    const usage = await db.getAddonUsage(req.user.phone);
    res.json({ usage });
  } catch (err) {
    console.error('addon/usage error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  Billing — GET /api/billing/prices
//  Returns live price amounts from Stripe for each plan
// ──────────────────────────────────────────────
app.get('/api/billing/prices', async (req, res) => {
  if (!STRIPE_SECRET_KEY) return res.json({ prices: {} });
  try {
    const stripe = require('stripe')(STRIPE_SECRET_KEY);
    const ids = {
      monthly:       MONTHLY_PRICE_ID,
      'claude-sonnet': DELUXE_PRICE_IDS['claude-sonnet'],
      xai:           DELUXE_PRICE_IDS['xai'],
      openai:        DELUXE_PRICE_IDS['openai'],
    };
    const entries = await Promise.all(
      Object.entries(ids).filter(([, id]) => id).map(async ([key, id]) => {
        const price = await stripe.prices.retrieve(id, { expand: ['product'] });
        const amount = price.unit_amount / 100;
        const currency = price.currency.toUpperCase();
        const label = price.recurring
          ? `${currency} ${amount.toFixed(2)}/${price.recurring.interval}`
          : `${currency} ${amount.toFixed(2)}`;
        const name = price.product?.name || null;
        return [key, { amount, currency, label, name, recurring: !!price.recurring }];
      })
    );
    res.json({ prices: Object.fromEntries(entries) });
  } catch (err) {
    console.error('Stripe prices error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  Billing — POST /api/billing/webhook
//  Stripe webhook: on successful one-time payment → grant 3-hour Deluxe access
// ──────────────────────────────────────────────
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }
  const stripe = require('stripe')(STRIPE_SECRET_KEY);
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      // Monthly subscription + optional add-on blocks (create-checkout-multi)
      if (session.mode === 'subscription' && session.subscription) {
        const userId = session.metadata?.userId;
        if (userId) {
          await db.setUserPlan(userId, 'standard', session.subscription);
          console.log(`Stripe: user ${userId} → Standard subscription ${session.subscription}`);
          // Record any add-on block purchases included in this checkout
          const blocks = (session.metadata?.blocks || '').split(',').filter(Boolean);
          for (const addonType of blocks) {
            if (['claude-sonnet', 'xai', 'openai'].includes(addonType)) {
              await db.recordAddonPurchase(userId, addonType, session.id);
              console.log(`Stripe: user ${userId} → addon block purchased: ${addonType} (+${db.ADDON_BLOCK_MINS} min)`);
            }
          }
        }
      }
      // Legacy one-time Deluxe pass (old checkout endpoint)
      if (session.payment_status === 'paid' && session.mode === 'payment' && session.metadata?.deluxeType) {
        const userId = session.metadata?.userId;
        const deluxeType = session.metadata.deluxeType;
        if (userId && ['claude-sonnet', 'xai', 'openai'].includes(deluxeType)) {
          await db.recordAddonPurchase(userId, deluxeType, session.id);
          console.log(`Stripe: user ${userId} → legacy one-time addon: ${deluxeType}`);
        }
      }
    }
    // Subscription cancelled / payment failed → downgrade to free
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      // Find user by stripeCustomerId
      const userId = sub.metadata?.userId || null;
      if (userId) {
        await db.setUserPlan(userId, 'standard', null);
        console.log(`Stripe: subscription ${sub.id} cancelled — user ${userId} downgraded`);
      }
    }
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
  }
  res.json({ received: true });
});

// ──────────────────────────────────────────────
//  Aliases — GET/POST/DELETE /api/aliases
//  Scoped to the authenticated user; stored in DynamoDB.
// ──────────────────────────────────────────────
app.get('/api/aliases', requireAuth, async (req, res) => {
  try {
    const aliases = await db.getAliases(req.user.phone);
    res.json({ aliases });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/aliases', requireAuth, async (req, res) => {
  const { username, alias } = req.body || {};
  if (!username || !alias) return res.status(400).json({ error: 'username and alias required' });
  if (username.length > 120 || alias.length > 120) return res.status(400).json({ error: 'username and alias must be ≤ 120 chars' });
  try {
    await db.setAlias(req.user.phone, username.trim(), alias.trim());
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/aliases/:username', requireAuth, async (req, res) => {
  try {
    await db.removeAlias(req.user.phone, req.params.username);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  Admin — GET /api/admin/usage
//  Returns usage summary for a specific user (admin only via secret header)
// ──────────────────────────────────────────────
app.get('/api/admin/usage', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { userId, from, to } = req.query;
  try {
    const summary = await db.getUsageSummary({ userId, from, to });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Upgrade landing page ──
app.get('/upgrade', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upgrade.html'));
});

// ── /config.js — expose public OAuth IDs to the browser ──
app.get('/config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(
    `window.GOOGLE_CLIENT_ID = ${JSON.stringify(process.env.GOOGLE_CLIENT_ID || '')};\n` +
    `window.APPLE_SERVICE_ID = ${JSON.stringify(process.env.APPLE_SERVICE_ID || '')};\n`
  );
});

// ──────────────────────────────────────────────
//  Fallback — serve index.html (voice agent landing page)
// ──────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Init DB (non-blocking — Lambda cold starts benefit from this being async)
db.init().then(ok => {
  if (ok) {
    console.log('DynamoDB: connected');
  } else {
    console.warn('DynamoDB: NOT CONNECTED —', db.getLastError()?.message || 'unknown error');
  }
});

module.exports = app;

