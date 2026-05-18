'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const TABLE = process.env.DDB_DATA_TABLE || 'test12-data';
const MAX_LEVEL = 3;

let doc = null;
let lastError = null;

// ── Helpers ──

function genId() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).substring(2, 8);
  return `${t}-${r}`;
}

function sk(date, id) {
  return `${date}#${id}`;
}

function fmtPost(i) {
  return {
    id: i.id,
    text: i.text,
    author: i.author,
    parent_id: i.parentId || null,
    level: i.level || 1,
    date: i.createdAt,
  };
}

// ── Init ──

async function init() {
  try {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
    lastError = null;
    console.log(`DynamoDB: using table "${TABLE}"`);
    return true;
  } catch (err) {
    lastError = err;
    doc = null;
    return false;
  }
}

function isReady() { return doc !== null; }
function getLastError() { return lastError; }

// No-op — tables created by deploy script
async function initChannelTables() {}

// ══════════════════════════════════════════
//  Voice Posts
// ══════════════════════════════════════════

async function getPostById(id) {
  if (!doc) throw new Error('Database not connected');
  const r = await doc.send(new GetCommand({
    TableName: TABLE, Key: { pk: 'POST', sk: String(id) },
  }));
  return r.Item ? fmtPost(r.Item) : null;
}

async function insertPost({ text, author, parentId = null }) {
  if (!doc) throw new Error('Database not connected');

  const id = genId();
  const now = new Date().toISOString();
  let level = 1;
  let cleanParentId = null;

  if (parentId != null && parentId !== '') {
    const parent = await getPostById(String(parentId));
    if (!parent) { const e = new Error('Parent post not found'); e.code = 'PARENT_NOT_FOUND'; throw e; }
    if (parent.level >= MAX_LEVEL) { const e = new Error(`Cannot reply: max depth (${MAX_LEVEL}) reached`); e.code = 'MAX_DEPTH'; throw e; }
    cleanParentId = parent.id;
    level = parent.level + 1;
  }

  const item = { id, text, author, level, parentId: cleanParentId, createdAt: now };

  // 1. Detail record
  await doc.send(new PutCommand({ TableName: TABLE, Item: { pk: 'POST', sk: id, ...item } }));

  // 2. Listing record (FEED for top-level, REPLIES#<parentId> for replies)
  const listPk = cleanParentId ? `REPLIES#${cleanParentId}` : 'FEED';
  await doc.send(new PutCommand({ TableName: TABLE, Item: { pk: listPk, sk: sk(now, id), ...item } }));

  return fmtPost(item);
}

async function listPosts({ limit = 50 } = {}) {
  if (!doc) throw new Error('Database not connected');
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

  const r = await doc.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': 'FEED' },
    ScanIndexForward: false,
    Limit: safeLimit,
  }));

  const posts = (r.Items || []).map(fmtPost);

  // Fetch replies in parallel (max depth 3)
  await Promise.all(posts.map(async p => { p.replies = await fetchReplies(p.id, 2); }));
  return posts;
}

async function fetchReplies(parentId, lvl) {
  if (lvl > MAX_LEVEL) return [];
  const r = await doc.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `REPLIES#${parentId}` },
    ScanIndexForward: true,
  }));
  const replies = (r.Items || []).map(fmtPost);
  if (lvl < MAX_LEVEL) {
    await Promise.all(replies.map(async rep => { rep.replies = await fetchReplies(rep.id, lvl + 1); }));
  } else {
    replies.forEach(rep => { rep.replies = []; });
  }
  return replies;
}

// ══════════════════════════════════════════
//  Channels
// ══════════════════════════════════════════

async function createChannel({ id, name, createdBy, maxUsers = 2 }) {
  if (!doc) throw new Error('Database not connected');
  const now = new Date().toISOString();
  const item = {
    id, name: name || 'Private Chat',
    created_by: createdBy,
    max_users: Math.min(Math.max(maxUsers, 2), 2),
    created_at: now,
  };

  // Detail
  await doc.send(new PutCommand({ TableName: TABLE, Item: { pk: 'CHANNEL', sk: id, ...item } }));
  // Listing
  await doc.send(new PutCommand({ TableName: TABLE, Item: { pk: 'CHANNELS', sk: sk(now, id), ...item } }));

  return item;
}

async function getChannelById(id) {
  if (!doc) throw new Error('Database not connected');
  const r = await doc.send(new GetCommand({
    TableName: TABLE, Key: { pk: 'CHANNEL', sk: String(id) },
  }));
  if (!r.Item) return null;
  const i = r.Item;
  return { id: i.id, name: i.name, created_by: i.created_by, max_users: i.max_users, created_at: i.created_at };
}

async function listChannels({ limit = 50 } = {}) {
  if (!doc) throw new Error('Database not connected');
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const r = await doc.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': 'CHANNELS' },
    ScanIndexForward: false,
    Limit: safeLimit,
  }));
  return (r.Items || []).map(i => ({
    id: i.id, name: i.name, created_by: i.created_by, max_users: i.max_users, created_at: i.created_at,
  }));
}

// ══════════════════════════════════════════
//  Channel Messages
// ══════════════════════════════════════════

async function insertChannelMessage({ channelId, author, text }) {
  if (!doc) throw new Error('Database not connected');
  const now = new Date().toISOString();
  const id = sk(now, genId());
  const item = { id, channel_id: channelId, author, text, created_at: now };

  await doc.send(new PutCommand({
    TableName: TABLE, Item: { pk: `CHANMSG#${channelId}`, sk: id, ...item },
  }));
  return item;
}

async function listChannelMessages({ channelId, limit = 100, afterId = 0 }) {
  if (!doc) throw new Error('Database not connected');
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);

  const params = {
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `CHANMSG#${channelId}` },
    ScanIndexForward: true,
    Limit: safeLimit,
  };

  // String afterId = use as cursor (ExclusiveStartKey)
  if (afterId && String(afterId) !== '0') {
    params.ExclusiveStartKey = { pk: `CHANMSG#${channelId}`, sk: String(afterId) };
  }

  const r = await doc.send(new QueryCommand(params));
  return (r.Items || []).map(i => ({
    id: i.id, channel_id: i.channel_id || channelId, author: i.author, text: i.text, created_at: i.created_at,
  }));
}

// ══════════════════════════════════════════
//  Auth: OTP
// ══════════════════════════════════════════

async function createOTP(phone) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const ttl = Math.floor(Date.now() / 1000) + 300; // 5 minutes
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: { pk: `OTP#${phone}`, sk: 'OTP', phone, code, ttl },
  }));
  return code;
}

async function verifyAndConsumeOTP(phone, code) {
  const r = await doc.send(new GetCommand({
    TableName: TABLE, Key: { pk: `OTP#${phone}`, sk: 'OTP' },
  }));
  const item = r.Item;
  if (!item || item.code !== String(code)) return false;
  if (item.ttl < Math.floor(Date.now() / 1000)) return false;
  await doc.send(new DeleteCommand({ TableName: TABLE, Key: { pk: `OTP#${phone}`, sk: 'OTP' } }));
  return true;
}

// ══════════════════════════════════════════
//  Auth: Session
// ══════════════════════════════════════════

async function createSession(phone) {
  const token = crypto.randomBytes(32).toString('hex');
  const ttl = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: { pk: `SESSION#${token}`, sk: 'SESSION', phone, token, ttl },
  }));
  return token;
}

async function getSession(token) {
  if (!token) return null;
  const r = await doc.send(new GetCommand({
    TableName: TABLE, Key: { pk: `SESSION#${token}`, sk: 'SESSION' },
  }));
  if (!r.Item) return null;
  if (r.Item.ttl < Math.floor(Date.now() / 1000)) return null;
  return r.Item;
}

async function deleteSession(token) {
  await doc.send(new DeleteCommand({ TableName: TABLE, Key: { pk: `SESSION#${token}`, sk: 'SESSION' } }));
}

// ══════════════════════════════════════════
//  Auth: User Profile
// ══════════════════════════════════════════

// ── Animal username generation ──
const ANIMALS = ['Alligator','Alpaca','Armadillo','Axolotl','Baboon','Badger','Bat','Bear','Beaver','Bison','Bobcat','Buffalo','Camel','Caribou','Cheetah','Chinchilla','Chipmunk','Cobra','Condor','Cougar','Coyote','Crane','Crocodile','Crow','Deer','Dingo','Dolphin','Donkey','Dragon','Eagle','Elephant','Falcon','Ferret','Fox','Gazelle','Gecko','Giraffe','Gorilla','Grizzly','Hamster','Hare','Hawk','Hedgehog','Heron','Hippo','Iguana','Jaguar','Kangaroo','Koala','Lemur','Leopard','Llama','Lynx','Macaw','Mink','Mole','Mongoose','Moose','Narwhal','Newt','Ocelot','Osprey','Otter','Panda','Panther','Parrot','Peacock','Penguin','Puffin','Puma','Python','Quail','Rabbit','Raccoon','Raven','Rhino','Salamander','Seal','Shark','Skunk','Sloth','Sparrow','Squirrel','Stork','Swan','Tiger','Toucan','Turtle','Viper','Walrus','Weasel','Wolf','Wolverine','Wombat','Yak','Zebra'];
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1 to avoid confusion
function generateUsername() {
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return animal + suffix;
}

async function autoRegister(userId, pin, plusCode) {
  const crypto = require('crypto');
  const pinHash = crypto.createHash('sha256').update(userId + ':' + pin).digest('hex');
  const pk = `USER#${userId}`;
  const r = await doc.send(new GetCommand({ TableName: TABLE, Key: { pk, sk: 'PROFILE' } }));
  let user;
  let isNew = false;
  if (r.Item) {
    user = r.Item;
    // Update plusCode and pinHash
    const upd = { ':t': new Date().toISOString() };
    let expr = 'SET lastSeen = :t';
    if (plusCode && plusCode !== user.plusCode) { upd[':p'] = plusCode; expr += ', plusCode = :p'; }
    if (!user.pinHash) { upd[':h'] = pinHash; expr += ', pinHash = :h'; }
    await doc.send(new UpdateCommand({
      TableName: TABLE, Key: { pk, sk: 'PROFILE' },
      UpdateExpression: expr, ExpressionAttributeValues: upd,
    }));
  } else {
    isNew = true;
    user = {
      pk, sk: 'PROFILE',
      phone: userId,
      displayName: userId,
      pinHash, plusCode,
      createdAt: new Date().toISOString(),
    };
    await doc.send(new PutCommand({ TableName: TABLE, Item: user }));
  }
  const token = await createSession(userId);
  return { token, displayName: user.displayName, isNew };
}

async function pinLogin(userId, pin) {
  const crypto = require('crypto');
  const pinHash = crypto.createHash('sha256').update(userId + ':' + pin).digest('hex');
  const pk = `USER#${userId}`;
  const r = await doc.send(new GetCommand({ TableName: TABLE, Key: { pk, sk: 'PROFILE' } }));
  if (!r.Item) throw new Error('Unknown username');
  if (r.Item.pinHash !== pinHash) throw new Error('Incorrect password');
  const token = await createSession(userId);
  return { token, displayName: r.Item.displayName };
}

async function getOrCreateUser(phone) {
  const r = await doc.send(new GetCommand({
    TableName: TABLE, Key: { pk: `USER#${phone}`, sk: 'PROFILE' },
  }));
  if (r.Item) return r.Item;
  const user = {
    pk: `USER#${phone}`, sk: 'PROFILE',
    phone, displayName: generateUsername(), createdAt: new Date().toISOString(),
  };
  await doc.send(new PutCommand({ TableName: TABLE, Item: user }));
  return user;
}

async function updateUserProfile(phone, { displayName }) {
  await doc.send(new UpdateCommand({
    TableName: TABLE,
    Key: { pk: `USER#${phone}`, sk: 'PROFILE' },
    UpdateExpression: 'SET displayName = :n',
    ExpressionAttributeValues: { ':n': String(displayName).substring(0, 60) },
  }));
}

// ══════════════════════════════════════════
//  Auth: Channel Membership
// ══════════════════════════════════════════

async function addChannelMember(phone, channelId) {
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: { pk: `MEMBER#${phone}`, sk: channelId, channelId, phone, joinedAt: new Date().toISOString() },
  }));
}

async function getUserChannelIds(phone) {
  const r = await doc.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `MEMBER#${phone}` },
    ProjectionExpression: 'channelId',
  }));
  return (r.Items || []).map(i => i.channelId);
}

async function isChannelMember(phone, channelId) {
  const r = await doc.send(new GetCommand({
    TableName: TABLE, Key: { pk: `MEMBER#${phone}`, sk: channelId },
  }));
  return !!r.Item;
}

// ══════════════════════════════════════════
//  User helpers (non-auth-flow)
// ══════════════════════════════════════════

async function getUserById(phone) {
  if (!doc) return null;
  const r = await doc.send(new GetCommand({
    TableName: TABLE, Key: { pk: `USER#${phone}`, sk: 'PROFILE' },
  }));
  return r.Item || null;
}

// ══════════════════════════════════════════
//  Plan & Stripe
// ══════════════════════════════════════════

async function setUserPlan(phone, plan, stripeSubscriptionId, deluxeExpiresAt) {
  if (!doc) return;
  const upd = { ':p': plan, ':t': new Date().toISOString() };
  let expr = 'SET #plan = :p, updatedAt = :t';
  // Store expiry for one-time Deluxe passes
  if (deluxeExpiresAt) {
    upd[':e'] = deluxeExpiresAt;
    expr += ', deluxeExpiresAt = :e';
  } else if (plan === 'standard') {
    // Clear expiry on downgrade
    expr += ' REMOVE deluxeExpiresAt';
  }
  if (stripeSubscriptionId !== undefined) {
    if (stripeSubscriptionId) { upd[':s'] = stripeSubscriptionId; expr += ', stripeSubscriptionId = :s'; }
    else { expr += ' REMOVE stripeSubscriptionId'; }
  }
  await doc.send(new UpdateCommand({
    TableName: TABLE,
    Key: { pk: `USER#${phone}`, sk: 'PROFILE' },
    UpdateExpression: expr,
    ExpressionAttributeNames: { '#plan': 'plan' },
    ExpressionAttributeValues: upd,
  }));
}

async function setStripeCustomerId(phone, customerId) {
  if (!doc) return;
  await doc.send(new UpdateCommand({
    TableName: TABLE,
    Key: { pk: `USER#${phone}`, sk: 'PROFILE' },
    UpdateExpression: 'SET stripeCustomerId = :c',
    ExpressionAttributeValues: { ':c': customerId },
  }));
}

// ══════════════════════════════════════════
//  Usage Logging (for Claude billing)
// ══════════════════════════════════════════

async function logUsage({ userId, model, inputTokens, outputTokens, costUsd }) {
  if (!doc) return;
  const now = new Date().toISOString();
  const id  = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: {
      pk: `USAGE#${userId}`,
      sk: `${now}#${id}`,
      userId, model, inputTokens, outputTokens,
      costUsd: Math.round(costUsd * 1e8) / 1e8, // 8 decimal places
      ts: now,
    },
  }));
}

async function getUsageSummary({ userId, from, to } = {}) {
  if (!doc) return { totalInputTokens: 0, totalOutputTokens: 0, totalCostUsd: 0, requestCount: 0 };
  const params = {
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `USAGE#${userId}` },
    ScanIndexForward: false,
  };
  if (from) {
    params.KeyConditionExpression += ' AND sk >= :from';
    params.ExpressionAttributeValues[':from'] = from;
  }
  if (to) {
    params.KeyConditionExpression += ' AND sk <= :to';
    params.ExpressionAttributeValues[':to'] = to + '~'; // inclusive
  }
  const r = await doc.send(new QueryCommand(params));
  const items = r.Items || [];
  return {
    userId,
    requestCount: items.length,
    totalInputTokens:  items.reduce((s, i) => s + (i.inputTokens  || 0), 0),
    totalOutputTokens: items.reduce((s, i) => s + (i.outputTokens || 0), 0),
    totalCostUsd:      Math.round(items.reduce((s, i) => s + (i.costUsd || 0), 0) * 1e6) / 1e6,
    from: from || null,
    to:   to   || null,
  };
}

// ══════════════════════════════════════════
//  Active Realtime Session Guard
//  One concurrent realtime session per user.
//  DynamoDB TTL auto-deletes the record when the token expires.
// ══════════════════════════════════════════

async function setActiveSession(phone, type, durationSeconds) {
  if (!doc) return;
  const now = Date.now();
  const expiresAt = new Date(now + durationSeconds * 1000).toISOString();
  const ttl = Math.floor(now / 1000) + durationSeconds + 120; // DynamoDB auto-deletes after TTL
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: { pk: `USER#${phone}`, sk: 'ACTIVE_SESSION', type, expiresAt, ttl, createdAt: new Date(now).toISOString() },
  }));
  return expiresAt;
}

async function getActiveSession(phone) {
  if (!doc) return null;
  const r = await doc.send(new GetCommand({
    TableName: TABLE, Key: { pk: `USER#${phone}`, sk: 'ACTIVE_SESSION' },
  }));
  if (!r.Item) return null;
  if (new Date(r.Item.expiresAt) <= new Date()) return null; // expired but TTL not yet fired
  return r.Item;
}

async function clearActiveSession(phone) {
  if (!doc) return;
  await doc.send(new DeleteCommand({
    TableName: TABLE, Key: { pk: `USER#${phone}`, sk: 'ACTIVE_SESSION' },
  }));
}

// ══════════════════════════════════════════

// ════════════════════════════════════════════
//  Aliases  (per authenticated user, stored in DynamoDB)
//  pk: ALIAS#<userId>   sk: <target-username>
// ════════════════════════════════════════════

async function getAliases(userId) {
  if (!doc) throw new Error('Database not connected');
  const r = await doc.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `ALIAS#${userId}` },
  }));
  // Return as plain object { username: alias } for easy consumption
  const map = {};
  for (const item of (r.Items || [])) map[item.sk] = item.alias;
  return map;
}

async function setAlias(userId, username, alias) {
  if (!doc) throw new Error('Database not connected');
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: { pk: `ALIAS#${userId}`, sk: username, alias, updatedAt: new Date().toISOString() },
  }));
}

async function removeAlias(userId, username) {
  if (!doc) throw new Error('Database not connected');
  await doc.send(new DeleteCommand({
    TableName: TABLE, Key: { pk: `ALIAS#${userId}`, sk: username },
  }));
}

module.exports = {
  init, isReady, getLastError, MAX_LEVEL,
  insertPost, listPosts, getPostById,
  initChannelTables, createChannel, getChannelById, listChannels,
  insertChannelMessage, listChannelMessages,
  // Auth
  createOTP, verifyAndConsumeOTP,
  createSession, getSession, deleteSession,
  getOrCreateUser, getUserById, updateUserProfile, autoRegister, pinLogin,
  addChannelMember, getUserChannelIds, isChannelMember,
  // Plan & Billing
  setUserPlan, setStripeCustomerId,
  logUsage, getUsageSummary,
  // Realtime session guard
  setActiveSession, getActiveSession, clearActiveSession,
  // Aliases
  getAliases, setAlias, removeAlias,
};
