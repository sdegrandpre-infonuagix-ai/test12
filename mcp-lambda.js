'use strict';

/**
 * Lambda handler for the Test12 MCP HTTP server.
 * Wraps mcp-http.js (Express) via @vendia/serverless-express.
 */

const serverlessExpress = require('@vendia/serverless-express');
const app = require('./mcp-http');

let handler;

exports.handler = async (event, context) => {
  if (!handler) {
    handler = serverlessExpress({ app });
  }
  return handler(event, context);
};
