'use strict';

/**
 * Test12 MCP Server — Streamable HTTP transport (for AWS Lambda).
 * Mounts on /mcp endpoint via Express.
 */

require('dotenv').config({ override: true });
const express = require('express');
const { randomUUID } = require('crypto');
const { registerTools, db } = require('./mcp-tools');

const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'test12-mcp' }));

let booted = false;
let McpServer, StreamableHTTPServerTransport, z;

// In-memory transport/session store (ephemeral per Lambda instance)
const sessions = {};

async function boot() {
  if (booted) return;
  const mcpMod = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const httpMod = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
  const zodMod = await import('zod');
  McpServer = mcpMod.McpServer;
  StreamableHTTPServerTransport = httpMod.StreamableHTTPServerTransport;
  z = zodMod.z;
  await db.init();
  booted = true;
}

// Create a fresh MCP server instance with all tools
function createServer() {
  const server = new McpServer({
    name: 'test12',
    version: '1.0.0',
    description: 'Test12 — voice-first social posting with WebMCP browsing',
  });
  registerTools(server, z);
  return server;
}

// POST /mcp — handle JSON-RPC requests (initialize, tool calls, etc.)
app.post('/mcp', async (req, res) => {
  try {
    await boot();

    const sessionId = req.headers['mcp-session-id'];

    if (sessionId && sessions[sessionId]) {
      // Existing session
      await sessions[sessionId].transport.handleRequest(req, res, req.body);
    } else {
      // New session — create server + transport
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });
      const server = createServer();
      await server.connect(transport);

      // Store session after connect (transport now has a sessionId)
      const newId = transport.sessionId;
      sessions[newId] = { server, transport };

      // Clean up on close
      server.onclose = () => { delete sessions[newId]; };

      await transport.handleRequest(req, res, req.body);
    }
  } catch (err) {
    console.error('MCP POST error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// GET /mcp — SSE stream for server-initiated messages
app.get('/mcp', async (req, res) => {
  try {
    await boot();
    const sessionId = req.headers['mcp-session-id'];
    if (sessionId && sessions[sessionId]) {
      await sessions[sessionId].transport.handleRequest(req, res);
    } else {
      res.status(400).json({ error: 'Missing or invalid mcp-session-id header' });
    }
  } catch (err) {
    console.error('MCP GET error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// DELETE /mcp — close session
app.delete('/mcp', async (req, res) => {
  try {
    await boot();
    const sessionId = req.headers['mcp-session-id'];
    if (sessionId && sessions[sessionId]) {
      await sessions[sessionId].transport.handleRequest(req, res);
    } else {
      res.status(400).json({ error: 'Missing or invalid mcp-session-id header' });
    }
  } catch (err) {
    console.error('MCP DELETE error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = app;
