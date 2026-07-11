// server.js —— Prisma 交友匹配平台入口
// 存储：MongoDB（MONGODB_URI 环境变量；本地可空 → mongodb://localhost:27017）

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const { sensitive, messages, conversations, users, ready$, close: closeStore } = require('./lib/store');
const { verify, issue, revoke } = require('./lib/auth');
const { guard: filterGuard } = require('./lib/filter');
const filter = require('./lib/filter');
const { decorate } = require('./routes/chat');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const matchRoutes = require('./routes/match');
const chatRoutes = require('./routes/chat');
const { FREE_LIMIT } = chatRoutes;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.set('io', io);
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - t;
    console.log(`[req] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/match', matchRoutes);
app.use('/api/chat', chatRoutes);

app.get('/api/admin/sensitive', async (req, res) => {
  res.json({ words: await sensitive.list() });
});
app.put('/api/admin/sensitive', async (req, res) => {
  const { words } = req.body || {};
  if (!Array.isArray(words)) return res.status(400).json({ error: 'words 必填为数组' });
  await sensitive.setList(words);
  filter.load(words);
  res.json({ ok: true, count: words.length });
});

app.get('/api/health', async (req, res) => {
  try {
    const [u, c, m] = await Promise.all([users.list(), conversations.list(), messages.list()]);
    res.json({ ok: true, users: u.length, conversations: c.length, messages: m.length });
  } catch (e) {
    res.status(503).json({ ok: false, error: 'MongoDB 未就绪：' + e.message });
  }
});

// === Socket.io 实时层 ===
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const userId = await verify(token);
    if (!userId) return next(new Error('未授权'));
    socket.userId = userId;
    next();
  } catch (e) {
    next(new Error('鉴权失败'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.userId}`);
  console.log(`[io] user ${socket.userId} connected`);

  socket.on('chat:send', async (payload, ack) => {
    try {
      const { convId, text } = payload || {};
      if (!convId || !text) return ack && ack({ error: '参数不完整' });
      const conv = await conversations.get(convId);
      if (!conv) return ack && ack({ error: '会话不存在' });
      if (conv.from !== socket.userId && conv.to !== socket.userId) {
        return ack && ack({ error: '无权访问此会话' });
      }
      if (conv.blocked) return ack && ack({ error: '会话已被屏蔽' });

      const r = filterGuard(text);
      if (r.block || r.hit) {
        return ack && ack({ error: '消息包含违规内容，已被拦截', detail: r });
      }

      if (!conv.confirmed) {
        const isInitiator = socket.userId === conv.from;
        if (isInitiator) {
          const sent = await messages.countFromSender(conv.id, socket.userId);
          if (sent >= FREE_LIMIT) {
            return ack && ack({ error: `对方尚未确认，你最多只能发 ${FREE_LIMIT} 条消息`, limit: FREE_LIMIT, sent });
          }
        }
      }

      const msg = {
        id: Math.random().toString(36).slice(2, 10),
        convId: conv.id,
        from: socket.userId,
        to: conv.from === socket.userId ? conv.to : conv.from,
        text: String(text).slice(0, 1000),
        ts: Date.now(),
        filtered: r,
      };
      await messages.add(msg);
      conv.lastActiveAt = Date.now();
      await conversations.upsert(conv);

      io.to(`user:${msg.to}`).emit('chat:message', { message: msg });
      io.to(`user:${msg.from}`).emit('chat:message', { message: msg });
      ack && ack({ ok: true, message: msg });
    } catch (e) {
      console.error('[io chat:send]', e);
      ack && ack({ error: e.message });
    }
  });

  socket.on('chat:confirm', async (payload, ack) => {
    try {
      const { convId, accept } = payload || {};
      const conv = await conversations.get(convId);
      if (!conv || (conv.from !== socket.userId && conv.to !== socket.userId)) {
        return ack && ack({ error: '无权操作' });
      }
      if (accept) {
        conv.confirmed = true;
        conv.confirmedBy = socket.userId;
        conv.confirmedAt = Date.now();
      } else {
        conv.blocked = true;
        conv.blockedBy = socket.userId;
      }
      await conversations.upsert(conv);
      const a = await decorate(conv, conv.from);
      const b = await decorate(conv, conv.to);
      io.to(`user:${conv.from}`).emit('chat:status', a);
      io.to(`user:${conv.to}`).emit('chat:status', b);
      ack && ack({ ok: true, conv });
    } catch (e) {
      ack && ack({ error: e.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[io] user ${socket.userId} disconnected`);
  });
});

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await ready$();        // 等 MongoDB 就绪（启动时阻塞，失败则退出）
    const words = await sensitive.list();
    filter.load(words);
    console.log(`[boot] 敏感词 ${words.length} 条已加载`);

    server.listen(PORT, () => {
      console.log(`\n  Prisma 交友匹配平台已启动`);
      console.log(`  → http://localhost:${PORT}\n`);
    });
  } catch (e) {
    console.error('\n[boot] 启动失败：', e.message);
    console.error('  请确认 MONGODB_URI 已正确设置（生产环境推荐 MongoDB Atlas 免费 M0）\n');
    process.exit(1);
  }
})();

process.on('SIGINT', async () => {
  await closeStore();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await closeStore();
  process.exit(0);
});
