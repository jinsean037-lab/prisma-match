// server.js —— Prisma 交友匹配平台入口
// 技术栈：Node.js + Express + Socket.io + 纯 JSON 存储
// 用法：npm install && npm start  →  浏览器打开 http://localhost:3000

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const { sensitive, messages, conversations, users, persist } = require('./lib/store');
const { verify } = require('./lib/auth');
const { guard: filterGuard } = require('./lib/filter');

const filter = require('./lib/filter');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const matchRoutes = require('./routes/match');
const chatRoutes = require('./routes/chat');
const { FREE_LIMIT } = require('./routes/chat');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.set('io', io);
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 简易请求日志
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - t;
    console.log(`[req] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// 启动时加载敏感词库
filter.load(sensitive.list());

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/match', matchRoutes);
app.use('/api/chat', chatRoutes);

// 管理接口：替换/查看敏感词库（生产请鉴权）
app.get('/api/admin/sensitive', (req, res) => {
  res.json({ words: sensitive.list() });
});
app.put('/api/admin/sensitive', (req, res) => {
  const { words } = req.body || {};
  if (!Array.isArray(words)) return res.status(400).json({ error: 'words 必填为数组' });
  sensitive.setList(words);
  filter.load(words);
  res.json({ ok: true, count: words.length });
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, users: users.list().length, conversations: conversations.list().length, messages: messages.list().length });
});

// === Socket.io 实时层 ===
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const userId = verify(token);
  if (!userId) return next(new Error('未授权'));
  socket.userId = userId;
  next();
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.userId}`);
  console.log(`[io] user ${socket.userId} connected`);

  // 实时发消息（走相同 guard）
  socket.on('chat:send', (payload, ack) => {
    try {
      const { convId, text } = payload || {};
      if (!convId || !text) return ack && ack({ error: '参数不完整' });

      const conv = conversations.get(convId);
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
          const sent = messages.countFromSender(conv.id, socket.userId);
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
      messages.add(msg);
      conv.lastActiveAt = Date.now();
      conversations.upsert(conv);

      io.to(`user:${msg.to}`).emit('chat:message', { message: msg });
      io.to(`user:${msg.from}`).emit('chat:message', { message: msg });
      ack && ack({ ok: true, message: msg });
    } catch (e) {
      console.error('[io chat:send]', e);
      ack && ack({ error: e.message });
    }
  });

  // 实时确认/拒绝
  socket.on('chat:confirm', (payload, ack) => {
    const { convId, accept } = payload || {};
    const conv = conversations.get(convId);
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
    conversations.upsert(conv);
    io.to(`user:${conv.from}`).emit('chat:status', conv);
    io.to(`user:${conv.to}`).emit('chat:status', conv);
    ack && ack({ ok: true, conv });
  });

  socket.on('disconnect', () => {
    console.log(`[io] user ${socket.userId} disconnected`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  Prisma 交友匹配平台已启动`);
  console.log(`  → http://localhost:${PORT}\n`);
});

// 进程退出前刷盘
process.on('SIGINT', () => {
  for (const k of ['users', 'conversations', 'messages', 'sensitive']) persist(k);
  process.exit(0);
});
