// lib/store.js —— 极简 JSON 文件存储（无原生依赖）
// 数据文件落在 data/ 目录下。生产环境请换 PostgreSQL / MongoDB / Redis。
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readJSON(name, fallback) {
  ensureDir();
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) {
    console.error(`[store] read ${name} failed, use fallback`, e.message);
    return fallback;
  }
}

function writeJSON(name, data) {
  ensureDir();
  const fp = filePath(name);
  // 原子写：先写临时文件再 rename，避免并发写坏
  const tmp = fp + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, fp);
}

// 简单内存表 + 持久化
const tables = {};

function table(name) {
  if (!tables[name]) {
    const data = readJSON(name, name === 'users' ? {} : []);
    tables[name] = { data, dirty: false };
  }
  return tables[name];
}

function persist(name) {
  const t = table(name);
  if (t.dirty) {
    writeJSON(name, t.data);
    t.dirty = false;
  }
}

// 定时刷盘，防止崩溃丢数据
setInterval(() => {
  for (const k of Object.keys(tables)) persist(k);
}, 3000);

process.on('exit', () => {
  for (const k of Object.keys(tables)) persist(k);
});

// === Users ===
const users = {
  list() {
    return Object.values(table('users').data);
  },
  get(id) {
    return table('users').data[id] || null;
  },
  getByUsername(username) {
    return this.list().find((u) => u.username === username) || null;
  },
  upsert(user) {
    const t = table('users');
    t.data[user.id] = user;
    t.dirty = true;
    persist('users');
    return user;
  },
  remove(id) {
    const t = table('users');
    delete t.data[id];
    t.dirty = true;
    persist('users');
  },
};

// === Conversations（一次"搭讪"是一个会话） ===
const conversations = {
  list() {
    return table('conversations').data;
  },
  get(id) {
    return this.list().find((c) => c.id === id) || null;
  },
  // 找两个用户之间的会话（若已存在）
  findBetween(uidA, uidB) {
    return this.list().find(
      (c) =>
        (c.from === uidA && c.to === uidB) ||
        (c.from === uidB && c.to === uidA)
    );
  },
  upsert(conv) {
    const t = table('conversations');
    const idx = t.data.findIndex((c) => c.id === conv.id);
    if (idx >= 0) t.data[idx] = conv;
    else t.data.push(conv);
    t.dirty = true;
    persist('conversations');
    return conv;
  },
  remove(id) {
    const t = table('conversations');
    t.data = t.data.filter((c) => c.id !== id);
    t.dirty = true;
    persist('conversations');
  },
};

// === Messages ===
const messages = {
  list() {
    return table('messages').data;
  },
  byConversation(convId) {
    return this.list()
      .filter((m) => m.convId === convId)
      .sort((a, b) => a.ts - b.ts);
  },
  add(msg) {
    const t = table('messages');
    t.data.push(msg);
    t.dirty = true;
    persist('messages');
    return msg;
  },
  // 统计未确认会话下"主动方"已发送的消息数
  countFromSender(convId, senderId) {
    return this.byConversation(convId).filter((m) => m.from === senderId).length;
  },
};

// === Sensitive words（敏感词库，支持热更新） ===
const sensitive = {
  list() {
    return table('sensitive').data;
  },
  setList(words) {
    const t = table('sensitive');
    t.data = words;
    t.dirty = true;
    persist('sensitive');
  },
};

module.exports = { users, conversations, messages, sensitive, persist };
