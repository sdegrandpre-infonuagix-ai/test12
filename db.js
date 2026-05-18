'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const path = require('path');

const TABLE = process.env.DDB_DATA_TABLE || 'test12-data';
const MAX_LEVEL = 3;

let doc = null;
let lastError = null;
let useSqlite = false;
let sqliteDb = null;

// ── SQLite backend (auto-activated when DynamoDB is unreachable) ──

function initSqlite() {
  const Database = require('better-sqlite3');
  sqliteDb = new Database(path.join(__dirname, 'local.db'));
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY, text TEXT NOT NULL, author TEXT NOT NULL,
      parent_id TEXT, level INTEGER DEFAULT 1, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY, name TEXT, created_by TEXT,
      max_users INTEGER DEFAULT 2, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS channel_messages (
      id TEXT PRIMARY KEY, channel_id TEXT NOT NULL,
      author TEXT, text TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chanmsg_channel ON channel_messages(channel_id, created_at);
    CREATE TABLE IF NOT EXISTS otps (
      phone TEXT PRIMARY KEY, code TEXT NOT NULL, ttl INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, phone TEXT NOT NULL, ttl INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      phone TEXT PRIMARY KEY, display_name TEXT, pin_hash TEXT,
      plan TEXT DEFAULT 'standard', plus_code TEXT,
      stripe_customer_id TEXT, stripe_subscription_id TEXT,
      deluxe_expires_at TEXT, deluxe_type TEXT,
      last_seen TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS channel_members (
      phone TEXT NOT NULL, channel_id TEXT NOT NULL, joined_at TEXT NOT NULL,
      PRIMARY KEY (phone, channel_id)
    );
    CREATE TABLE IF NOT EXISTS usage_logs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, model TEXT,
      input_tokens INTEGER, output_tokens INTEGER,
      cost_usd REAL, ts TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_logs(user_id, ts);
    CREATE TABLE IF NOT EXISTS active_sessions (
      phone TEXT PRIMARY KEY, type TEXT, expires_at TEXT,
      ttl INTEGER, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS aliases (
      user_id TEXT NOT NULL, username TEXT NOT NULL, alias TEXT NOT NULL,
      updated_at TEXT NOT NULL, PRIMARY KEY (user_id, username)
    );
    CREATE TABLE IF NOT EXISTS addon_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      addon_type TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_secs REAL
    );
    CREATE INDEX IF NOT EXISTS idx_addon_sessions_user ON addon_sessions(user_id, addon_type);
    CREATE TABLE IF NOT EXISTS addon_purchases (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      addon_type TEXT NOT NULL,
      minutes_added INTEGER NOT NULL DEFAULT 180,
      purchased_at TEXT NOT NULL,
      stripe_session_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_addon_purchases_user ON addon_purchases(user_id, addon_type);
  `);
  console.log('SQLite: using local.db (DynamoDB unavailable)');
}

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
    const candidate = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
    // Probe DynamoDB with a real request — if the IAM user lacks permissions, fall back to SQLite
    await candidate.send(new GetCommand({ TableName: TABLE, Key: { pk: '__probe__', sk: '__probe__' } }));
    doc = candidate;
    useSqlite = false;
    lastError = null;
    console.log(`DynamoDB: using table "${TABLE}"`);
    return true;
  } catch (err) {
    // Fall back to local SQLite for development
    doc = null;
    useSqlite = true;
    initSqlite();
    lastError = null;
    return true;
  }
}

function isReady() { return doc !== null || useSqlite; }
function getLastError() { return lastError; }

// No-op — tables created by deploy script
async function initChannelTables() {}

// ══════════════════════════════════════════
//  Voice Posts
// ══════════════════════════════════════════

async function getPostById(id) {
  if (useSqlite) {
    const row = sqliteDb.prepare('SELECT * FROM posts WHERE id = ?').get(String(id));
    if (!row) return null;
    return { id: row.id, text: row.text, author: row.author, parent_id: row.parent_id || null, level: row.level, date: row.created_at };
  }
  if (!doc) throw new Error('Database not connected');
  const r = await doc.send(new GetCommand({
    TableName: TABLE, Key: { pk: 'POST', sk: String(id) },
  }));
  return r.Item ? fmtPost(r.Item) : null;
}

async function insertPost({ text, author, parentId = null }) {
  if (useSqlite) {
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
    sqliteDb.prepare('INSERT INTO posts (id,text,author,parent_id,level,created_at) VALUES (?,?,?,?,?,?)')
      .run(id, text, author, cleanParentId, level, now);
    return { id, text, author, parent_id: cleanParentId, level, date: now };
  }
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
  await doc.send(new PutCommand({ TableName: TABLE, Item: { pk: 'POST', sk: id, ...item } }));
  const listPk = cleanParentId ? `REPLIES#${cleanParentId}` : 'FEED';
  await doc.send(new PutCommand({ TableName: TABLE, Item: { pk: listPk, sk: sk(now, id), ...item } }));
  return fmtPost(item);
}

async function listPosts({ limit = 50 } = {}) {
  if (useSqlite) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const rows = sqliteDb.prepare(
      'SELECT * FROM posts WHERE parent_id IS NULL ORDER BY created_at DESC LIMIT ?'
    ).all(safeLimit);
    const posts = rows.map(r => ({ id: r.id, text: r.text, author: r.author, parent_id: null, level: r.level, date: r.created_at }));
    await Promise.all(posts.map(async p => { p.replies = await fetchReplies(p.id, 2); }));
    return posts;
  }
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
  await Promise.all(posts.map(async p => { p.replies = await fetchReplies(p.id, 2); }));
  return posts;
}

async function fetchReplies(parentId, lvl) {
  if (lvl > MAX_LEVEL) return [];
  if (useSqlite) {
    const rows = sqliteDb.prepare(
      'SELECT * FROM posts WHERE parent_id = ? ORDER BY created_at ASC'
    ).all(String(parentId));
    const replies = rows.map(r => ({ id: r.id, text: r.text, author: r.author, parent_id: r.parent_id, level: r.level, date: r.created_at }));
    if (lvl < MAX_LEVEL) {
      await Promise.all(replies.map(async rep => { rep.replies = await fetchReplies(rep.id, lvl + 1); }));
    } else {
      replies.forEach(rep => { rep.replies = []; });
    }
    return replies;
  }
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
  const now = new Date().toISOString();
  const item = { id, name: name || 'Private Chat', created_by: createdBy, max_users: Math.min(Math.max(maxUsers, 2), 2), created_at: now };
  if (useSqlite) {
    sqliteDb.prepare('INSERT OR REPLACE INTO channels (id,name,created_by,max_users,created_at) VALUES (?,?,?,?,?)')
      .run(item.id, item.name, item.created_by, item.max_users, item.created_at);
    return item;
  }
  if (!doc) throw new Error('Database not connected');
  await doc.send(new PutCommand({ TableName: TABLE, Item: { pk: 'CHANNEL', sk: id, ...item } }));
  await doc.send(new PutCommand({ TableName: TABLE, Item: { pk: 'CHANNELS', sk: sk(now, id), ...item } }));
  return item;
}

async function getChannelById(id) {
  if (useSqlite) {
    const r = sqliteDb.prepare('SELECT * FROM channels WHERE id = ?').get(String(id));
    if (!r) return null;
    return { id: r.id, name: r.name, created_by: r.created_by, max_users: r.max_users, created_at: r.created_at };
  }
  if (!doc) throw new Error('Database not connected');
  const r = await doc.send(new GetCommand({
    TableName: TABLE, Key: { pk: 'CHANNEL', sk: String(id) }, ConsistentRead: true,
  }));
  if (!r.Item) return null;
  const i = r.Item;
  return { id: i.id, name: i.name, created_by: i.created_by, max_users: i.max_users, created_at: i.created_at };
}

async function listChannels({ limit = 50 } = {}) {
  if (useSqlite) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    return sqliteDb.prepare('SELECT * FROM channels ORDER BY created_at DESC LIMIT ?').all(safeLimit)
      .map(r => ({ id: r.id, name: r.name, created_by: r.created_by, max_users: r.max_users, created_at: r.created_at }));
  }
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
  const now = new Date().toISOString();
  const id = sk(now, genId());
  const item = { id, channel_id: channelId, author, text, created_at: now };
  if (useSqlite) {
    sqliteDb.prepare('INSERT INTO channel_messages (id,channel_id,author,text,created_at) VALUES (?,?,?,?,?)')
      .run(id, channelId, author, text, now);
    return item;
  }
  if (!doc) throw new Error('Database not connected');
  await doc.send(new PutCommand({
    TableName: TABLE, Item: { pk: `CHANMSG#${channelId}`, sk: id, ...item },
  }));
  return item;
}

async function listChannelMessages({ channelId, limit = 100, afterId = 0 }) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  if (useSqlite) {
    let rows;
    if (afterId && String(afterId) !== '0') {
      rows = sqliteDb.prepare(
        'SELECT * FROM channel_messages WHERE channel_id = ? AND id > ? ORDER BY created_at ASC LIMIT ?'
      ).all(channelId, String(afterId), safeLimit);
    } else {
      rows = sqliteDb.prepare(
        'SELECT * FROM channel_messages WHERE channel_id = ? ORDER BY created_at ASC LIMIT ?'
      ).all(channelId, safeLimit);
    }
    return rows.map(r => ({ id: r.id, channel_id: r.channel_id, author: r.author, text: r.text, created_at: r.created_at }));
  }
  if (!doc) throw new Error('Database not connected');
  const params = {
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `CHANMSG#${channelId}` },
    ScanIndexForward: true,
    Limit: safeLimit,
  };
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
  const ttl = Math.floor(Date.now() / 1000) + 300;
  if (useSqlite) {
    sqliteDb.prepare('INSERT OR REPLACE INTO otps (phone,code,ttl) VALUES (?,?,?)').run(phone, code, ttl);
    return code;
  }
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: { pk: `OTP#${phone}`, sk: 'OTP', phone, code, ttl },
  }));
  return code;
}

async function verifyAndConsumeOTP(phone, code) {
  if (useSqlite) {
    const row = sqliteDb.prepare('SELECT * FROM otps WHERE phone = ?').get(phone);
    if (!row || row.code !== String(code)) return false;
    if (row.ttl < Math.floor(Date.now() / 1000)) return false;
    sqliteDb.prepare('DELETE FROM otps WHERE phone = ?').run(phone);
    return true;
  }
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
  const ttl = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  if (useSqlite) {
    sqliteDb.prepare('INSERT INTO sessions (token,phone,ttl) VALUES (?,?,?)').run(token, phone, ttl);
    return token;
  }
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: { pk: `SESSION#${token}`, sk: 'SESSION', phone, token, ttl },
  }));
  return token;
}

async function getSession(token) {
  if (!token) return null;
  if (useSqlite) {
    const row = sqliteDb.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
    if (!row) return null;
    if (row.ttl < Math.floor(Date.now() / 1000)) return null;
    return { phone: row.phone, token: row.token };
  }
  const r = await doc.send(new GetCommand({
    TableName: TABLE, Key: { pk: `SESSION#${token}`, sk: 'SESSION' },
  }));
  if (!r.Item) return null;
  if (r.Item.ttl < Math.floor(Date.now() / 1000)) return null;
  return r.Item;
}

async function deleteSession(token) {
  if (useSqlite) {
    sqliteDb.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return;
  }
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
  for (let i = 0; i < 4; i++) suffix += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return animal + suffix;
}

async function autoRegister(userId, pin, plusCode) {
  const pinHash = crypto.createHash('sha256').update(userId + ':' + pin).digest('hex');
  if (useSqlite) {
    const now = new Date().toISOString();
    const existing = sqliteDb.prepare('SELECT * FROM users WHERE phone = ?').get(userId);
    let isNew = false;
    if (existing) {
      const sets = ['last_seen = ?'];
      const vals = [now];
      if (plusCode && plusCode !== existing.plus_code) { sets.push('plus_code = ?'); vals.push(plusCode); }
      if (!existing.pin_hash) { sets.push('pin_hash = ?'); vals.push(pinHash); }
      vals.push(userId);
      sqliteDb.prepare(`UPDATE users SET ${sets.join(', ')} WHERE phone = ?`).run(...vals);
    } else {
      isNew = true;
      sqliteDb.prepare('INSERT INTO users (phone,display_name,pin_hash,plus_code,created_at) VALUES (?,?,?,?,?)')
        .run(userId, userId, pinHash, plusCode || null, now);
    }
    const user = sqliteDb.prepare('SELECT * FROM users WHERE phone = ?').get(userId);
    const token = await createSession(userId);
    return { token, displayName: user.display_name || userId, isNew };
  }
  const pk = `USER#${userId}`;
  const r = await doc.send(new GetCommand({ TableName: TABLE, Key: { pk, sk: 'PROFILE' } }));
  let user;
  let isNew = false;
  if (r.Item) {
    user = r.Item;
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
    user = { pk, sk: 'PROFILE', phone: userId, displayName: userId, pinHash, plusCode, createdAt: new Date().toISOString() };
    await doc.send(new PutCommand({ TableName: TABLE, Item: user }));
  }
  const token = await createSession(userId);
  return { token, displayName: user.displayName, isNew };
}

async function pinLogin(userId, pin) {
  const pinHash = crypto.createHash('sha256').update(userId + ':' + pin).digest('hex');
  if (useSqlite) {
    const row = sqliteDb.prepare('SELECT * FROM users WHERE phone = ?').get(userId);
    if (!row) throw new Error('Unknown username');
    if (row.pin_hash !== pinHash) throw new Error('Incorrect password');
    const token = await createSession(userId);
    return { token, displayName: row.display_name || userId };
  }
  const pk = `USER#${userId}`;
  const r = await doc.send(new GetCommand({ TableName: TABLE, Key: { pk, sk: 'PROFILE' } }));
  if (!r.Item) throw new Error('Unknown username');
  if (r.Item.pinHash !== pinHash) throw new Error('Incorrect password');
  const token = await createSession(userId);
  return { token, displayName: r.Item.displayName };
}

async function getOrCreateUser(phone) {
  if (useSqlite) {
    const existing = sqliteDb.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (existing) return { phone: existing.phone, displayName: existing.display_name, plan: existing.plan || 'standard' };
    const now = new Date().toISOString();
    const displayName = generateUsername();
    sqliteDb.prepare('INSERT INTO users (phone,display_name,plan,created_at) VALUES (?,?,?,?)').run(phone, displayName, 'standard', now);
    return { phone, displayName, plan: 'standard', createdAt: now };
  }
  const r = await doc.send(new GetCommand({
    TableName: TABLE, Key: { pk: `USER#${phone}`, sk: 'PROFILE' },
  }));
  if (r.Item) return r.Item;
  const user = { pk: `USER#${phone}`, sk: 'PROFILE', phone, displayName: generateUsername(), createdAt: new Date().toISOString() };
  await doc.send(new PutCommand({ TableName: TABLE, Item: user }));
  return user;
}

async function updateUserProfile(phone, { displayName }) {
  if (useSqlite) {
    sqliteDb.prepare('UPDATE users SET display_name = ? WHERE phone = ?')
      .run(String(displayName).substring(0, 60), phone);
    return;
  }
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
  if (useSqlite) {
    sqliteDb.prepare('INSERT OR REPLACE INTO channel_members (phone,channel_id,joined_at) VALUES (?,?,?)')
      .run(phone, channelId, new Date().toISOString());
    return;
  }
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: { pk: `MEMBER#${phone}`, sk: channelId, channelId, phone, joinedAt: new Date().toISOString() },
  }));
}

async function getUserChannelIds(phone) {
  if (useSqlite) {
    return sqliteDb.prepare('SELECT channel_id FROM channel_members WHERE phone = ?').all(phone)
      .map(r => r.channel_id);
  }
  const r = await doc.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `MEMBER#${phone}` },
    ProjectionExpression: 'channelId',
  }));
  return (r.Items || []).map(i => i.channelId);
}

async function isChannelMember(phone, channelId) {
  if (useSqlite) {
    const row = sqliteDb.prepare('SELECT 1 FROM channel_members WHERE phone = ? AND channel_id = ?').get(phone, channelId);
    return !!row;
  }
  const r = await doc.send(new GetCommand({
    TableName: TABLE, Key: { pk: `MEMBER#${phone}`, sk: channelId },
  }));
  return !!r.Item;
}

// ══════════════════════════════════════════
//  User helpers (non-auth-flow)
// ══════════════════════════════════════════

async function getUserById(phone) {
  if (useSqlite) {
    const row = sqliteDb.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!row) return null;
    return {
      phone: row.phone, displayName: row.display_name, plan: row.plan || 'standard',
      pinHash: row.pin_hash, deluxeExpiresAt: row.deluxe_expires_at, deluxeType: row.deluxe_type,
      stripeCustomerId: row.stripe_customer_id, stripeSubscriptionId: row.stripe_subscription_id,
    };
  }
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
  if (useSqlite) {
    const sets = ['plan = ?'];
    const vals = [plan];
    if (deluxeExpiresAt !== undefined) { sets.push('deluxe_expires_at = ?'); vals.push(deluxeExpiresAt || null); }
    if (stripeSubscriptionId !== undefined) { sets.push('stripe_subscription_id = ?'); vals.push(stripeSubscriptionId || null); }
    vals.push(phone);
    sqliteDb.prepare(`UPDATE users SET ${sets.join(', ')} WHERE phone = ?`).run(...vals);
    return;
  }
  if (!doc) return;
  const upd = { ':p': plan, ':t': new Date().toISOString() };
  let expr = 'SET #plan = :p, updatedAt = :t';
  if (deluxeExpiresAt) { upd[':e'] = deluxeExpiresAt; expr += ', deluxeExpiresAt = :e'; }
  else if (plan === 'standard') { expr += ' REMOVE deluxeExpiresAt'; }
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
  if (useSqlite) {
    sqliteDb.prepare('UPDATE users SET stripe_customer_id = ? WHERE phone = ?').run(customerId, phone);
    return;
  }
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
  if (useSqlite) {
    const now = new Date().toISOString();
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    sqliteDb.prepare('INSERT INTO usage_logs (id,user_id,model,input_tokens,output_tokens,cost_usd,ts) VALUES (?,?,?,?,?,?,?)')
      .run(id, userId, model, inputTokens, outputTokens, Math.round((costUsd || 0) * 1e8) / 1e8, now);
    return;
  }
  if (!doc) return;
  const now = new Date().toISOString();
  const id  = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: {
      pk: `USAGE#${userId}`,
      sk: `${now}#${id}`,
      userId, model, inputTokens, outputTokens,
      costUsd: Math.round(costUsd * 1e8) / 1e8,
      ts: now,
    },
  }));
}

async function getUsageSummary({ userId, from, to } = {}) {
  if (useSqlite) {
    let query = 'SELECT * FROM usage_logs WHERE user_id = ?';
    const args = [userId];
    if (from) { query += ' AND ts >= ?'; args.push(from); }
    if (to)   { query += ' AND ts <= ?'; args.push(to + '~'); }
    const items = sqliteDb.prepare(query).all(...args);
    return {
      userId,
      requestCount: items.length,
      totalInputTokens:  items.reduce((s, i) => s + (i.input_tokens  || 0), 0),
      totalOutputTokens: items.reduce((s, i) => s + (i.output_tokens || 0), 0),
      totalCostUsd:      Math.round(items.reduce((s, i) => s + (i.cost_usd || 0), 0) * 1e6) / 1e6,
      from: from || null, to: to || null,
    };
  }
  if (!doc) return { totalInputTokens: 0, totalOutputTokens: 0, totalCostUsd: 0, requestCount: 0 };
  const params = {
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `USAGE#${userId}` },
    ScanIndexForward: false,
  };
  if (from) { params.KeyConditionExpression += ' AND sk >= :from'; params.ExpressionAttributeValues[':from'] = from; }
  if (to)   { params.KeyConditionExpression += ' AND sk <= :to';   params.ExpressionAttributeValues[':to'] = to + '~'; }
  const r = await doc.send(new QueryCommand(params));
  const items = r.Items || [];
  return {
    userId,
    requestCount: items.length,
    totalInputTokens:  items.reduce((s, i) => s + (i.inputTokens  || 0), 0),
    totalOutputTokens: items.reduce((s, i) => s + (i.outputTokens || 0), 0),
    totalCostUsd:      Math.round(items.reduce((s, i) => s + (i.costUsd || 0), 0) * 1e6) / 1e6,
    from: from || null, to: to || null,
  };
}

// ══════════════════════════════════════════
//  Add-on Session Tracking
//  Records start / end of each voice session per add-on type so we can
//  compute total minutes consumed from each 3-hour block.
// ══════════════════════════════════════════

function _addonId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}

// Record one 3-hour block purchase (called from Stripe webhook)
async function recordAddonPurchase(userId, addonType, stripeSessionId = null) {
  const id  = _addonId();
  const now = new Date().toISOString();
  if (useSqlite) {
    sqliteDb.prepare(
      'INSERT INTO addon_purchases (id,user_id,addon_type,minutes_added,purchased_at,stripe_session_id) VALUES (?,?,?,?,?,?)'
    ).run(id, userId, addonType, ADDON_BLOCK_MINS, now, stripeSessionId || null);
    return;
  }
  if (!doc) return;
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: { pk: `ADDON_PURCHASE#${userId}`, sk: `${now}#${id}`, id, userId, addonType, minutesAdded: ADDON_BLOCK_MINS, purchasedAt: now, stripeSessionId },
  }));
}

// Total minutes purchased (sum of all blocks bought) — 0 if none bought yet
async function getAddonPurchasedMins(userId, addonType) {
  if (useSqlite) {
    const row = sqliteDb.prepare(
      'SELECT COALESCE(SUM(minutes_added), 0) AS total FROM addon_purchases WHERE user_id = ? AND addon_type = ?'
    ).get(userId, addonType);
    return row?.total || 0;
  }
  if (!doc) return 0;
  const r = await doc.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `ADDON_PURCHASE#${userId}` },
  }));
  return (r.Items || [])
    .filter(i => i.addonType === addonType)
    .reduce((s, i) => s + (i.minutesAdded || ADDON_BLOCK_MINS), 0);
}

async function startAddonSession(userId, addonType) {
  const id  = _addonId();
  const now = new Date().toISOString();
  if (useSqlite) {
    sqliteDb.prepare(
      'INSERT INTO addon_sessions (id,user_id,addon_type,started_at) VALUES (?,?,?,?)'
    ).run(id, userId, addonType, now);
    return id;
  }
  if (!doc) return id;
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: { pk: `ADDON_SESSION#${userId}`, sk: `${now}#${id}`, id, userId, addonType, startedAt: now },
  }));
  return id;
}

async function endAddonSession(sessionId, userId) {
  const now = new Date().toISOString();
  if (useSqlite) {
    const row = sqliteDb.prepare('SELECT * FROM addon_sessions WHERE id = ?').get(sessionId);
    if (!row || row.ended_at) return;
    const durationSecs = (Date.now() - new Date(row.started_at).getTime()) / 1000;
    sqliteDb.prepare(
      'UPDATE addon_sessions SET ended_at = ?, duration_secs = ? WHERE id = ?'
    ).run(now, durationSecs, sessionId);
    return;
  }
  if (!doc) return;
  // Fetch the item to compute duration (scan by GSI not available, store sessionId in a lookup key)
  // Store a secondary lookup record for fast close
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: { pk: `ADDON_SESSION_END#${sessionId}`, sk: 'end', sessionId, userId, endedAt: now },
  }));
}

const ADDON_BLOCK_MINS = 180; // one 3-hour block

// Returns total minutes consumed for one add-on type, including any open (in-progress) session
async function getAddonUsedMins(userId, addonType) {
  if (useSqlite) {
    const row = sqliteDb.prepare(`
      SELECT COALESCE(SUM(
        CASE WHEN ended_at IS NOT NULL THEN duration_secs
             ELSE (strftime('%s','now') - strftime('%s', started_at))
        END
      ), 0) AS total_secs
      FROM addon_sessions
      WHERE user_id = ? AND addon_type = ?
    `).get(userId, addonType);
    return (row?.total_secs || 0) / 60;
  }
  if (!doc) return 0;
  // DynamoDB: sum completed sessions (open sessions tracked client-side)
  const r = await doc.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `ADDON_SESSION#${userId}` },
  }));
  const items = (r.Items || []).filter(i => i.addonType === addonType);
  const secs = items.reduce((s, i) => s + (i.durationSecs || 0), 0);
  return secs / 60;
}

async function getAddonUsage(userId) {
  const ADDONS = ['claude-sonnet', 'xai', 'openai'];
  if (useSqlite) {
    const sessionRows = sqliteDb.prepare(
      `SELECT addon_type,
              COUNT(*) AS session_count,
              COALESCE(SUM(duration_secs), 0) AS total_secs,
              MAX(started_at) AS last_used
       FROM addon_sessions WHERE user_id = ? GROUP BY addon_type`
    ).all(userId);
    const purchaseRows = sqliteDb.prepare(
      `SELECT addon_type, COALESCE(SUM(minutes_added), 0) AS purchased_mins
       FROM addon_purchases WHERE user_id = ? GROUP BY addon_type`
    ).all(userId);
    const purchasedMap = {};
    purchaseRows.forEach(r => { purchasedMap[r.addon_type] = r.purchased_mins; });
    const result = {};
    ADDONS.forEach(t => { result[t] = { sessionCount: 0, totalMins: 0, purchasedMins: purchasedMap[t] || 0, lastUsed: null }; });
    sessionRows.forEach(r => {
      result[r.addon_type] = {
        sessionCount: r.session_count,
        totalMins: Math.round(r.total_secs / 60 * 10) / 10,
        purchasedMins: purchasedMap[r.addon_type] || 0,
        lastUsed: r.last_used,
      };
    });
    return result;
  }
  if (!doc) return Object.fromEntries(ADDONS.map(t => [t, { sessionCount: 0, totalMins: 0, purchasedMins: 0, lastUsed: null }]));
  const [sessR, purchR] = await Promise.all([
    doc.send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': `ADDON_SESSION#${userId}` } })),
    doc.send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': `ADDON_PURCHASE#${userId}` } })),
  ]);
  const purchasedMap = {};
  (purchR.Items || []).forEach(i => {
    purchasedMap[i.addonType] = (purchasedMap[i.addonType] || 0) + (i.minutesAdded || ADDON_BLOCK_MINS);
  });
  const result = {};
  ADDONS.forEach(t => { result[t] = { sessionCount: 0, totalMins: 0, purchasedMins: purchasedMap[t] || 0, lastUsed: null }; });
  (sessR.Items || []).forEach(item => {
    const t = item.addonType;
    if (!result[t]) return;
    result[t].sessionCount++;
    if (item.durationSecs) result[t].totalMins = Math.round((result[t].totalMins * 6 + item.durationSecs / 10) / 6 * 10) / 10;
    if (!result[t].lastUsed || item.startedAt > result[t].lastUsed) result[t].lastUsed = item.startedAt;
    result[t].purchasedMins = purchasedMap[t] || 0;
  });
  return result;
}

// ══════════════════════════════════════════
//  Active Realtime Session Guard
//  One concurrent realtime session per user.
//  DynamoDB TTL auto-deletes the record when the token expires.
// ══════════════════════════════════════════

async function setActiveSession(phone, type, durationSeconds) {
  const now = Date.now();
  const expiresAt = new Date(now + durationSeconds * 1000).toISOString();
  const ttl = Math.floor(now / 1000) + durationSeconds + 120;
  if (useSqlite) {
    sqliteDb.prepare('INSERT OR REPLACE INTO active_sessions (phone,type,expires_at,ttl,created_at) VALUES (?,?,?,?,?)')
      .run(phone, type, expiresAt, ttl, new Date(now).toISOString());
    return expiresAt;
  }
  if (!doc) return;
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: { pk: `USER#${phone}`, sk: 'ACTIVE_SESSION', type, expiresAt, ttl, createdAt: new Date(now).toISOString() },
  }));
  return expiresAt;
}

async function getActiveSession(phone) {
  if (useSqlite) {
    const row = sqliteDb.prepare('SELECT * FROM active_sessions WHERE phone = ?').get(phone);
    if (!row) return null;
    if (new Date(row.expires_at) <= new Date()) return null;
    return { phone: row.phone, type: row.type, expiresAt: row.expires_at };
  }
  if (!doc) return null;
  const r = await doc.send(new GetCommand({
    TableName: TABLE, Key: { pk: `USER#${phone}`, sk: 'ACTIVE_SESSION' },
  }));
  if (!r.Item) return null;
  if (new Date(r.Item.expiresAt) <= new Date()) return null;
  return r.Item;
}

async function clearActiveSession(phone) {
  if (useSqlite) {
    sqliteDb.prepare('DELETE FROM active_sessions WHERE phone = ?').run(phone);
    return;
  }
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
  if (useSqlite) {
    const rows = sqliteDb.prepare('SELECT username, alias FROM aliases WHERE user_id = ?').all(userId);
    const map = {};
    for (const row of rows) map[row.username] = row.alias;
    return map;
  }
  if (!doc) throw new Error('Database not connected');
  const r = await doc.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `ALIAS#${userId}` },
  }));
  const map = {};
  for (const item of (r.Items || [])) map[item.sk] = item.alias;
  return map;
}

async function setAlias(userId, username, alias) {
  if (useSqlite) {
    sqliteDb.prepare('INSERT OR REPLACE INTO aliases (user_id,username,alias,updated_at) VALUES (?,?,?,?)')
      .run(userId, username, alias, new Date().toISOString());
    return;
  }
  if (!doc) throw new Error('Database not connected');
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: { pk: `ALIAS#${userId}`, sk: username, alias, updatedAt: new Date().toISOString() },
  }));
}

async function removeAlias(userId, username) {
  if (useSqlite) {
    sqliteDb.prepare('DELETE FROM aliases WHERE user_id = ? AND username = ?').run(userId, username);
    return;
  }
  if (!doc) throw new Error('Database not connected');
  await doc.send(new DeleteCommand({
    TableName: TABLE, Key: { pk: `ALIAS#${userId}`, sk: username },
  }));
}

async function listUsers() {
  if (useSqlite) {
    return sqliteDb.prepare('SELECT phone, display_name, plan, created_at FROM users ORDER BY created_at DESC').all()
      .map(r => ({ id: r.phone, displayName: r.display_name, plan: r.plan, createdAt: r.created_at }));
  }
  const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
  let items = [], lastKey;
  do {
    const r = await doc.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'sk = :sk',
      ExpressionAttributeValues: { ':sk': 'PROFILE' },
      ExclusiveStartKey: lastKey,
    }));
    items = items.concat(r.Items || []);
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);
  return items.map(u => {
    const id = u.phone || u.pk?.replace('USER#', '') || '';
    const type = id.includes('@') ? 'email' : /^\+?\d{7,}$/.test(id) ? 'phone' : 'apple';
    return { id, type, displayName: u.displayName || '', plan: u.plan || 'standard', createdAt: u.createdAt || '' };
  });
}

module.exports = {
  init, isReady, getLastError, MAX_LEVEL,
  insertPost, listPosts, getPostById,
  initChannelTables, createChannel, getChannelById, listChannels,
  insertChannelMessage, listChannelMessages,
  // Auth
  createOTP, verifyAndConsumeOTP,
  createSession, getSession, deleteSession,
  _rawDoc: () => doc,
  getOrCreateUser, getUserById, listUsers, updateUserProfile, autoRegister, pinLogin,
  addChannelMember, getUserChannelIds, isChannelMember,
  // Plan & Billing
  setUserPlan, setStripeCustomerId,
  logUsage, getUsageSummary,
  startAddonSession, endAddonSession, getAddonUsage, getAddonUsedMins,
  recordAddonPurchase, getAddonPurchasedMins, ADDON_BLOCK_MINS,
  // Realtime session guard
  setActiveSession, getActiveSession, clearActiveSession,
  // Aliases
  getAliases, setAlias, removeAlias,
};
