// routes/chat.js —— 聊天（REST 列表 + 历史 + 状态变更）
const express = require('express');
const crypto = require('crypto');
const { users, conversations, messages } = require('../lib/store');
const { requireAuth } = require('../lib/auth');
const { guard: filterGuard } = require('../lib/filter');

const router = express.Router();
router.use(requireAuth);

const FREE_LIMIT = 3;

router.post('/start', async (req, res) => {
  try {
    const { toUserId, firstMessage } = req.body || {};
    if (!toUserId) return res.status(400).json({ error: 'toUserId 必填' });
    if (toUserId === req.user.id) return res.status(400).json({ error: '不能给自己发消息' });
    const target = await users.get(toUserId);
    if (!target) return res.status(404).json({ error: '对方不存在' });

    let conv = await conversations.findBetween(req.user.id, toUserId);
    const isNew = !conv;
    if (!conv) {
      conv = {
        id: crypto.randomBytes(8).toString('hex'),
        from: req.user.id,
        to: toUserId,
        confirmed: false,
        confirmedBy: null,
        blocked: false,
        createdAt: Date.now(),
      };
    }
    conv.lastActiveAt = Date.now();
    await conversations.upsert(conv);

    let firstMsgResult = null;
    if (firstMessage) {
      const r = filterGuard(firstMessage);
      if (r.block || r.hit) {
        return res.status(400).json({ error: '消息包含违规内容，已被拦截', detail: r });
      }
      const sent = await messages.countFromSender(conv.id, req.user.id);
      if (sent >= FREE_LIMIT) {
        return res.status(403).json({ error: `未确认前最多 ${FREE_LIMIT} 条消息` });
      }
      const msg = {
        id: crypto.randomBytes(6).toString('hex'),
        convId: conv.id,
        from: req.user.id,
        to: toUserId,
        text: String(firstMessage).slice(0, 1000),
        ts: Date.now(),
        filtered: r,
      };
      await messages.add(msg);
      firstMsgResult = msg;
    }

    res.json({ ok: true, conversation: await decorate(conv, req.user.id), firstMessage: firstMsgResult, isNew });
  } catch (e) {
    console.error('[chat start]', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/conversations', async (req, res) => {
  try {
    const list = (await conversations.list())
      .filter((c) => c.from === req.user.id || c.to === req.user.id)
      .sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));
    const decorated = await Promise.all(list.map((c) => decorate(c, req.user.id)));
    res.json({ conversations: decorated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const conv = await conversations.get(req.params.id);
    if (!conv) return res.status(404).json({ error: '会话不存在' });
    if (conv.from !== req.user.id && conv.to !== req.user.id) {
      return res.status(403).json({ error: '无权访问此会话' });
    }
    const list = await messages.byConversation(conv.id);
    res.json({
      conversation: await decorate(conv, req.user.id),
      messages: list,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const conv = await conversations.get(req.params.id);
    if (!conv) return res.status(404).json({ error: '会话不存在' });
    if (conv.from !== req.user.id && conv.to !== req.user.id) {
      return res.status(403).json({ error: '无权访问此会话' });
    }
    if (conv.blocked) return res.status(403).json({ error: '会话已被屏蔽' });

    const text = String((req.body || {}).text || '').trim();
    if (!text) return res.status(400).json({ error: '消息不能为空' });

    const r = filterGuard(text);
    if (r.block || r.hit) {
      return res.status(400).json({ error: '消息包含违规内容，已被拦截', detail: r });
    }

    if (!conv.confirmed) {
      const sender = req.user.id;
      const isInitiator = sender === conv.from;
      if (isInitiator) {
        const sent = await messages.countFromSender(conv.id, sender);
        if (sent >= FREE_LIMIT) {
          return res.status(403).json({
            error: `对方尚未确认，你最多只能发 ${FREE_LIMIT} 条消息。请等待对方接受。`,
            limit: FREE_LIMIT, sent,
          });
        }
      }
    }

    const msg = {
      id: crypto.randomBytes(6).toString('hex'),
      convId: conv.id,
      from: req.user.id,
      to: conv.from === req.user.id ? conv.to : conv.from,
      text: text.slice(0, 1000),
      ts: Date.now(),
      filtered: r,
    };
    await messages.add(msg);
    conv.lastActiveAt = Date.now();
    await conversations.upsert(conv);

    const io = req.app.get('io');
    if (io) {
      const fromDeco = await decorate(conv, msg.from);
      const toDeco = await decorate(conv, msg.to);
      io.to(`user:${msg.to}`).emit('chat:message', { conversation: toDeco, message: msg });
      io.to(`user:${msg.from}`).emit('chat:message', { conversation: fromDeco, message: msg });
    }

    res.json({ ok: true, message: msg, conversation: await decorate(conv, req.user.id) });
  } catch (e) {
    console.error('[chat message]', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/conversations/:id/confirm', async (req, res) => {
  try {
    const conv = await conversations.get(req.params.id);
    if (!conv) return res.status(404).json({ error: '会话不存在' });
    if (conv.from !== req.user.id && conv.to !== req.user.id) {
      return res.status(403).json({ error: '无权操作' });
    }
    const { accept } = req.body || {};
    if (accept) {
      conv.confirmed = true;
      conv.confirmedBy = req.user.id;
      conv.confirmedAt = Date.now();
    } else {
      conv.blocked = true;
      conv.blockedBy = req.user.id;
      conv.blockedAt = Date.now();
    }
    await conversations.upsert(conv);
    const io = req.app.get('io');
    if (io) {
      const a = await decorate(conv, conv.from);
      const b = await decorate(conv, conv.to);
      io.to(`user:${conv.from}`).emit('chat:status', a);
      io.to(`user:${conv.to}`).emit('chat:status', b);
    }
    res.json({ ok: true, conversation: await decorate(conv, req.user.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/conversations/:id/block', async (req, res) => {
  try {
    const conv = await conversations.get(req.params.id);
    if (!conv) return res.status(404).json({ error: '会话不存在' });
    if (conv.from !== req.user.id && conv.to !== req.user.id) {
      return res.status(403).json({ error: '无权操作' });
    }
    conv.blocked = true;
    conv.blockedBy = req.user.id;
    conv.blockedAt = Date.now();
    await conversations.upsert(conv);
    res.json({ ok: true, conversation: await decorate(conv, req.user.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function decorate(conv, viewerId) {
  const otherId = conv.from === viewerId ? conv.to : conv.from;
  const other = await users.get(otherId);
  const sentByMe = await messages.countFromSender(conv.id, viewerId);
  const totalToMe = (await messages.byConversation(conv.id)).filter((m) => m.to === viewerId).length;
  return {
    id: conv.id,
    from: conv.from,
    to: conv.to,
    other: other ? {
      id: other.id,
      nickname: other.nickname,
      avatar: other.avatar,
      role: other.role,
      height: other.height,
      weight: other.weight,
      mbti: other.mbti,
      zodiac: other.zodiac,
      hobbies: other.hobbies,
    } : null,
    confirmed: conv.confirmed,
    confirmedBy: conv.confirmedBy,
    blocked: conv.blocked,
    createdAt: conv.createdAt,
    lastActiveAt: conv.lastActiveAt,
    sentByMe,
    receivedByMe: totalToMe,
    isInitiator: conv.from === viewerId,
    freeLimit: FREE_LIMIT,
  };
}

module.exports = router;
module.exports.FREE_LIMIT = FREE_LIMIT;
module.exports.decorate = decorate;
