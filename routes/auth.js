// routes/auth.js —— 注册 / 登录 / 注销
// 平台定位：男同性恋交友（不收性别 / 性取向字段；只问"角色"）
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { users } = require('../lib/store');
const { issue, revoke, requireAuth } = require('../lib/auth');

const router = express.Router();

const ROLES = ['0', '0.5', '1', 'side']; // 0=接受方 / 1=主动方 / 0.5=均可 / side=不参与
const PW_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8,}$/; // 8+ 位，必须含字母+数字

router.post('/register', async (req, res) => {
  try {
    const { username, password, nickname, role } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    if (username.length < 2 || username.length > 20) return res.status(400).json({ error: '用户名需 2-20 位' });
    if (!PW_REGEX.test(password)) return res.status(400).json({ error: '密码至少 8 位，且必须同时包含字母和数字' });
    if (role && !ROLES.includes(role)) return res.status(400).json({ error: '角色值不合法' });
    if (users.getByUsername(username)) return res.status(409).json({ error: '用户名已存在' });

    const id = crypto.randomBytes(8).toString('hex');
    const hash = await bcrypt.hash(password, 10);
    const user = {
      id,
      username,
      passwordHash: hash,
      nickname: nickname || username,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`,
      gender: 'male',           // 平台仅服务男性
      orientation: 'gay',       // 平台仅服务 gay
      role: role || '',         // 用户在资料页填
      height: null, weight: null,
      mbti: '', zodiac: '',
      hobbies: [],
      bio: '',
      prefer: {
        rolePref: ['0.5', 'any'], // 默认偏好 0.5 / any
        heightMin: 150, heightMax: 195,
        weightMin: 45, weightMax: 95,
        mbtiPref: [], zodiacPref: [],
        hobbyPref: [],
      },
      createdAt: Date.now(),
    };
    users.upsert(user);
    const token = issue(id);
    res.json({ ok: true, token, user: stripPassword(user) });
  } catch (e) {
    console.error('[register]', e);
    res.status(500).json({ error: e.message || '服务器内部错误' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    const u = users.getByUsername(username);
    if (!u) return res.status(401).json({ error: '用户名或密码错误' });
    const ok = await bcrypt.compare(password, u.passwordHash);
    if (!ok) return res.status(401).json({ error: '用户名或密码错误' });
    const token = issue(u.id);
    res.json({ ok: true, token, user: stripPassword(u) });
  } catch (e) {
    console.error('[login]', e);
    res.status(500).json({ error: e.message || '服务器内部错误' });
  }
});

router.post('/logout', requireAuth, (req, res) => {
  revoke(req.user.token);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const u = users.get(req.user.id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  res.json({ user: stripPassword(u) });
});

function stripPassword(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

module.exports = router;
module.exports.ROLES = ROLES;
