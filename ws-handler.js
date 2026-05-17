'use strict';

/**
 * ws-handler.js — Lambda handler for API Gateway WebSocket API
 *
 * Routes:
 *   $connect     — Store connection in DynamoDB, enforce max 2 users per channel
 *   $disconnect  — Remove connection from DynamoDB
 *   sendmessage  — Receive a message, store in MySQL, broadcast to channel
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { broadcastToChannel } = require('./ws-broadcast');
const db = require('./db');

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.WS_TABLE || 'test12-ws-connections';

const ddbClient = new DynamoDBClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    dbInitialized = true;
    const ok = await db.init();
    console.log(ok ? 'WS Lambda DB: connected' : `WS Lambda DB: FAILED — ${db.getLastError()?.message}`);
  }
}

function getEndpoint(event) {
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  return `https://${domain}/${stage}`;
}

exports.handler = async (event) => {
  const { routeKey, connectionId } = event.requestContext;
  const endpoint = getEndpoint(event);

  console.log(`[ws] route=${routeKey} conn=${connectionId}`);

  try {
    switch (routeKey) {
      case '$connect':
        return await handleConnect(event, connectionId);

      case '$disconnect':
        return await handleDisconnect(event, connectionId);

      case 'sendmessage':
        return await handleSendMessage(event, connectionId, endpoint);

      default:
        return { statusCode: 400, body: JSON.stringify({ error: `Unknown route: ${routeKey}` }) };
    }
  } catch (err) {
    console.error(`[ws] Error in ${routeKey}:`, err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

// ── $connect ──
async function handleConnect(event, connectionId) {
  const qs = event.queryStringParameters || {};
  const channelId = qs.channelId;
  const author = qs.author;

  if (!channelId || !author) {
    return { statusCode: 400, body: 'channelId and author query params required' };
  }

  // 'public' is a special broadcast channel — no DB validation, no user limit
  if (channelId === 'public') {
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { channelId, connectionId, author, connectedAt: new Date().toISOString() },
    }));
    console.log(`[ws] ${author} subscribed to public channel`);
    return { statusCode: 200, body: 'Connected to public' };
  }

  // Validate channel exists in DB
  await ensureDb();
  const channel = await db.getChannelById(channelId);
  if (!channel) {
    return { statusCode: 404, body: 'Channel not found' };
  }

  // Enforce max 2 unique users
  const existing = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'channelId = :cid',
    ExpressionAttributeValues: { ':cid': channelId },
    ProjectionExpression: 'author',
  }));

  const currentAuthors = new Set((existing.Items || []).map(i => i.author));
  if (currentAuthors.size >= 2 && !currentAuthors.has(author)) {
    return { statusCode: 403, body: 'Channel full (max 2 users)' };
  }

  // Store connection
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      channelId,
      connectionId,
      author,
      connectedAt: new Date().toISOString(),
    },
  }));

  console.log(`[ws] ${author} connected to channel ${channelId}`);

  // Broadcast user_joined
  const updatedAuthors = new Set([...currentAuthors, author]);
  const endpoint = getEndpoint(event);
  await broadcastToChannel(channelId, 'user_joined', {
    author,
    userCount: updatedAuthors.size,
    users: [...updatedAuthors],
  }, endpoint);

  return { statusCode: 200, body: 'Connected' };
}

// ── $disconnect ──
async function handleDisconnect(event, connectionId) {
  // Find and remove this connection
  // We need to scan for this connectionId since we only know the connectionId, not channelId
  // But DynamoDB requires the partition key for delete — so we search first
  // Alternative: store connectionId → channelId in a GSI, but for simplicity we'll
  // check the connection item we stored

  // We'll use a GSI or scan. For now, let's store a secondary record keyed by connectionId.
  // Actually, let's handle this by scanning with a filter (fine for small scale).
  
  const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
  const result = await ddb.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'connectionId = :cid',
    ExpressionAttributeValues: { ':cid': connectionId },
  }));

  const items = result.Items || [];
  if (items.length === 0) {
    return { statusCode: 200, body: 'OK' };
  }

  const { channelId, author } = items[0];

  // Delete the connection
  await ddb.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { channelId, connectionId },
  }));

  // Get remaining users
  const remaining = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'channelId = :cid',
    ExpressionAttributeValues: { ':cid': channelId },
    ProjectionExpression: 'author',
  }));
  const remainingAuthors = new Set((remaining.Items || []).map(i => i.author));

  const endpoint = getEndpoint(event);
  await broadcastToChannel(channelId, 'user_left', {
    author,
    userCount: remainingAuthors.size,
    users: [...remainingAuthors],
  }, endpoint);

  console.log(`[ws] ${author} disconnected from channel ${channelId}`);
  return { statusCode: 200, body: 'Disconnected' };
}

// ── sendmessage ──
async function handleSendMessage(event, connectionId, endpoint) {
  const body = JSON.parse(event.body || '{}');
  const { channelId, author, text } = body;

  if (!channelId || !author || !text) {
    return { statusCode: 400, body: JSON.stringify({ error: 'channelId, author, text required' }) };
  }

  if (text.length > 2000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'text too long (max 2000)' }) };
  }

  await ensureDb();

  // Store message in MySQL
  const msg = await db.insertChannelMessage({ channelId, author, text });

  // Broadcast to all connections in channel
  await broadcastToChannel(channelId, 'message', msg, endpoint);

  return { statusCode: 200, body: JSON.stringify({ message: msg }) };
}
