// routes/chat.js —— 聊天（REST 列表 + 历史 + 状态变更）
const express = require('express');
const crypto = require('crypto');
const { users, conversations, messages } = require('../lib/store');
const { requireAuth } = require('../lib/auth');
const { guard: filterGuard } = require('../lib/filter');

const router = express.Router();
router.use(requireAuth);

const FREE_LIMIT = 3; // 未确认会话，主动方最多发 FREE_LIMIT 条

// 1) 发起搭讪（创建 / 复用会话）
router.post('/start', (req, res) => {
  const { toUserId, firstMessage } = req.body || {};
  if (!toUserId) return res.status(400).json({ error: 'toUserId 必填' });
  if (toUserId === req.user.id) return res.status(400).json({ error: '不能给自己发消息' });
  const target = users.get(toUserId);
  if (!target) return res.status(404).json({ error: '对方不存在' });

  let conv = conversations.findBetween(req.user.id, toUserId);
  const isNew = !conv;
  if (!conv) {
    conv = {
      id: crypto.randomBytes(8).toString('hex'),
      from: req.user.id,
      to: toUserId,
      confirmed: false,         // 对方是否同意"深入聊"
      confirmedBy: null,
      blocked: false,
      createdAt: Date.now(),
    };
  }
  conv.lastActiveAt = Date.now();
  conversations.upsert(conv);

  // 如果带了首条消息，立即过审
  let firstMsgResult = null;
  if (firstMessage) {
    const r = filterGuard(firstMessage);
    if (r.block) {
      return res.status(400).json({ error: '消息包含违规内容，已被拦截', detail: r });
    }
    if (r.hit) {
      // review 级别也直接拦截（保守策略）
      return res.status(400).json({ error: '消息包含敏感内容，请修改后重发', detail: r });
    }
    // 检查条数限制（主动方在未确认时最多 FREE_LIMIT 条）
    const sent = messages.countFromSender(conv.id, req.user.id);
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
    messages.add(msg);
    firstMsgResult = msg;
  }

  res.json({ ok: true, conversation: decorate(conv, req.user.id), firstMessage: firstMsgResult, isNew });
});

// 2) 会话列表
router.get('/conversations', (req, res) => {
  const list = conversations.list()
    .filter((c) => c.from === req.user.id || c.to === req.user.id)
    .sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0))
    .map((c) => decorate(c, req.user.id));
  res.json({ conversations: list });
});

// 3) 消息历史
router.get('/conversations/:id/messages', (req, res) => {
  const conv = conversations.get(req.params.id);
  if (!conv) return res.status(404).json({ error: '会话不存在' });
  if (conv.from !== req.user.id && conv.to !== req.user.id) {
    return res.status(403).json({ error: '无权访问此会话' });
  }
  const list = messages.byConversation(conv.id);
  res.json({
    conversation: decorate(conv, req.user.id),
    messages: list,
  });
});

// 4) 发消息（HTTP 入口；Socket 也走同一个 guard）
router.post('/conversations/:id/messages', (req, res) => {
  const conv = conversations.get(req.params.id);
  if (!conv) return res.status(404).json({ error: '会话不存在' });
  if (conv.from !== req.user.id && conv.to !== req.user.id) {
    return res.status(403).json({ error: '无权访问此会话' });
  }
  if (conv.blocked) return res.status(403).json({ error: '会话已被屏蔽' });

  const text = String((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: '消息不能为空' });

  // 过审
  const r = filterGuard(text);
  if (r.block || r.hit) {
    return res.status(400).json({
      error: '消息包含违规内容，已被拦截',
      detail: r,
    });
  }

  // 门控：未确认且发送方是主动方，则限 FREE_LIMIT 条
  if (!conv.confirmed) {
    // 谁是"主动方"？会话的 from
    const sender = req.user.id;
    const isInitiator = sender === conv.from;
    if (isInitiator) {
      const sent = messages.countFromSender(conv.id, sender);
      if (sent >= FREE_LIMIT) {
        return res.status(403).json({
          error: `对方尚未确认，你最多只能发 ${FREE_LIMIT} 条消息。请等待对方接受。`,
          limit: FREE_LIMIT,
          sent,
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
  messages.add(msg);
  conv.lastActiveAt = Date.now();
  conversations.upsert(conv);

  // 推送给对方（HTTP 接口下，前端轮询即可；Socket 模式下实时推送）
  const io = req.app.get('io');
  if (io) {
    io.to(`user:${msg.to}`).emit('chat:message', { conversation: decorate(conv, msg.to), message: msg });
    io.to(`user:${msg.from}`).emit('chat:message', { conversation: decorate(conv, msg.from), message: msg });
  }

  res.json({ ok: true, message: msg, conversation: decorate(conv, req.user.id) });
});

// 5) 确认/拒绝"深入聊"
router.post('/conversations/:id/confirm', (req, res) => {
  const conv = conversations.get(req.params.id);
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
  conversations.upsert(conv);
  const io = req.app.get('io');
  if (io) {
    io.to(`user:${conv.from}`).emit('chat:status', decorate(conv, conv.from));
    io.to(`user:${conv.to}`).emit('chat:status', decorate(conv, conv.to));
  }
  res.json({ ok: true, conversation: decorate(conv, req.user.id) });
});

// 6) 屏蔽
router.post('/conversations/:id/block', (req, res) => {
  const conv = conversations.get(req.params.id);
  if (!conv) return res.status(404).json({ error: '会话不存在' });
  if (conv.from !== req.user.id && conv.to !== req.user.id) {
    return res.status(403).json({ error: '无权操作' });
  }
  conv.blocked = true;
  conv.blockedBy = req.user.id;
  conv.blockedAt = Date.now();
  conversations.upsert(conv);
  res.json({ ok: true, conversation: decorate(conv, req.user.id) });
});

function decorate(conv, viewerId) {
  const otherId = conv.from === viewerId ? conv.to : conv.from;
  const other = users.get(otherId);
  const sentByMe = messages.countFromSender(conv.id, viewerId);
  const totalToMe = messages.byConversation(conv.id).filter((m) => m.to === viewerId).length;
  return {
    id: conv.id,
    from: conv.from,
    to: conv.to,
    other: other ? {
      id: other.id,
      nickname: other.nickname,
      avatar: other.avatar,
      gender: other.gender,
      orientation: other.orientation,
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
