#!/usr/bin/env node
'use strict';

/**
 * Test12 MCP Server — stdio transport (local use).
 * Run: node server.js
 */

const { registerTools, db } = require('./mcp-tools');

async function main() {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { z } = await import('zod');

  await db.init();

  const server = new McpServer({
    name: 'test12',
    version: '1.0.0',
    description: 'Test12 — voice-first social posting with WebMCP browsing',
  });

  registerTools(server, z);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🎙️  Test12 MCP server running on stdio');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
