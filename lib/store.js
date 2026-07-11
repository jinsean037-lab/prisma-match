// lib/store.js —— MongoDB 存储（async）
// 用法：设置环境变量 MONGODB_URI（如 mongodb+srv://user:pass@cluster0.xxxx.mongodb.net）
//       可选 MONGODB_DB（默认 prisma-match）
// 本地无 MONGODB_URI 时尝试 mongodb://localhost:27017

const { MongoClient } = require('mongodb');

let client = null;
let db = null;
let ready = false;
let connecting = null; // 单飞

function getConfig() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB || 'prisma-match';
  return { uri, dbName };
}

async function init() {
  if (ready) return db;
  if (connecting) return connecting;
  const { uri, dbName } = getConfig();
  connecting = (async () => {
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });
    await client.connect();
    db = client.db(dbName);
    // 索引（idempotent）
    await db.collection('users').createIndex({ id: 1 }, { unique: true });
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('conversations').createIndex({ id: 1 }, { unique: true });
    await db.collection('conversations').createIndex({ from: 1, to: 1 });
    await db.collection('messages').createIndex({ convId: 1, ts: 1 });
    await db.collection('messages').createIndex({ from: 1 });
    await db.collection('tokens').createIndex({ token: 1 }, { unique: true });
    await db.collection('tokens').createIndex({ exp: 1 }, { expireAfterSeconds: 0 });
    await db.collection('sensitive').createIndex({ _id: 1 });
    ready = true;
    const masked = uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
    console.log(`[store] MongoDB 已连接: ${dbName} @ ${masked}`);
    return db;
  })().catch((e) => {
    connecting = null;
    console.error('[store] MongoDB 连接失败：', e.message);
    throw e;
  });
  return connecting;
}

// 显式等待 ready（启动时调用）
async function ready$() { return init(); }

// === users ===
const users = {
  async list() {
    await init();
    return db.collection('users').find({}).toArray();
  },
  async get(id) {
    await init();
    return db.collection('users').findOne({ id });
  },
  async getByUsername(username) {
    await init();
    return db.collection('users').findOne({ username });
  },
  async upsert(user) {
    await init();
    await db.collection('users').replaceOne({ id: user.id }, user, { upsert: true });
    return user;
  },
  async remove(id) {
    await init();
    await db.collection('users').deleteOne({ id });
  },
};

// === conversations ===
const conversations = {
  async list() {
    await init();
    return db.collection('conversations').find({}).sort({ lastActiveAt: -1 }).toArray();
  },
  async get(id) {
    await init();
    return db.collection('conversations').findOne({ id });
  },
  async findBetween(uidA, uidB) {
    await init();
    return db.collection('conversations').findOne({
      $or: [
        { from: uidA, to: uidB },
        { from: uidB, to: uidA },
      ],
    });
  },
  async upsert(conv) {
    await init();
    await db.collection('conversations').replaceOne({ id: conv.id }, conv, { upsert: true });
    return conv;
  },
  async remove(id) {
    await init();
    await db.collection('conversations').deleteOne({ id });
  },
};

// === messages ===
const messages = {
  async list() {
    await init();
    return db.collection('messages').find({}).toArray();
  },
  async byConversation(convId) {
    await init();
    return db.collection('messages').find({ convId }).sort({ ts: 1 }).toArray();
  },
  async add(msg) {
    await init();
    await db.collection('messages').insertOne(msg);
    return msg;
  },
  async countFromSender(convId, senderId) {
    await init();
    return db.collection('messages').countDocuments({ convId, from: senderId });
  },
};

// === sensitive words ===
const sensitive = {
  async list() {
    await init();
    const doc = await db.collection('sensitive').findOne({ _id: 'main' });
    return doc ? doc.words : [];
  },
  async setList(words) {
    await init();
    await db.collection('sensitive').replaceOne({ _id: 'main' }, { _id: 'main', words, updatedAt: Date.now() }, { upsert: true });
  },
};

// === tokens（用于 auth，TTL 索引自动清理过期 token） ===
const tokens = {
  async put(token, userId, ttlMs) {
    await init();
    await db.collection('tokens').replaceOne(
      { token },
      { token, userId, exp: new Date(Date.now() + ttlMs) },
      { upsert: true }
    );
  },
  async get(token) {
    await init();
    const doc = await db.collection('tokens').findOne({ token });
    if (!doc) return null;
    if (doc.exp < new Date()) {
      await db.collection('tokens').deleteOne({ token });
      return null;
    }
    return { userId: doc.userId, exp: doc.exp };
  },
  async revoke(token) {
    await init();
    await db.collection('tokens').deleteOne({ token });
  },
};

// 优雅关闭
async function close() {
  if (client) {
    try { await client.close(); } catch (e) {}
    client = null; db = null; ready = false; connecting = null;
  }
}

module.exports = { users, conversations, messages, sensitive, tokens, ready$, close };
