// routes/profile.js —— 个人资料 CRUD
const express = require('express');
const { users } = require('../lib/store');
const { requireAuth } = require('../lib/auth');
const { ROLES } = require('./auth');

const router = express.Router();
router.use(requireAuth);

const HEIGHT = [130, 220];
const WEIGHT = [30, 150];

router.put('/me', (req, res) => {
  try {
    const u = users.get(req.user.id);
    if (!u) return res.status(404).json({ error: '用户不存在' });
    const body = req.body || {};

    const scalar = ['nickname', 'height', 'weight', 'mbti', 'zodiac', 'bio', 'avatar', 'role'];
    for (const k of scalar) {
      if (body[k] !== undefined) u[k] = body[k];
    }
    if (body.role != null && !ROLES.includes(body.role)) {
      return res.status(400).json({ error: '角色值不合法' });
    }
    if (body.height != null) {
      const h = Number(body.height);
      if (h < HEIGHT[0] || h > HEIGHT[1]) return res.status(400).json({ error: `身高应在 ${HEIGHT[0]}-${HEIGHT[1]} cm` });
      u.height = h;
    }
    if (body.weight != null) {
      const w = Number(body.weight);
      if (w < WEIGHT[0] || w > WEIGHT[1]) return res.status(400).json({ error: `体重应在 ${WEIGHT[0]}-${WEIGHT[1]} kg` });
      u.weight = w;
    }
    if (Array.isArray(body.hobbies)) {
      u.hobbies = body.hobbies.map(String).slice(0, 20);
    }
    if (body.prefer && typeof body.prefer === 'object') {
      u.prefer = {
        ...u.prefer,
        ...body.prefer,
        heightMin: clamp(body.prefer.heightMin, HEIGHT[0], HEIGHT[1]),
        heightMax: clamp(body.prefer.heightMax, HEIGHT[0], HEIGHT[1]),
        weightMin: clamp(body.prefer.weightMin, WEIGHT[0], WEIGHT[1]),
        weightMax: clamp(body.prefer.weightMax, WEIGHT[0], WEIGHT[1]),
      };
    }
    users.upsert(u);
    const { passwordHash, ...rest } = u;
    res.json({ ok: true, user: rest });
  } catch (e) {
    console.error('[profile PUT]', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/options', (req, res) => {
  res.json({
    roles: ROLES,
    roleLabels: {
      '0': '0 · 接受方',
      '1': '1 · 主动方',
      '0.5': '0.5 · 都可以',
      'side': 'side · 不参与',
    },
    mbti: ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'],
    zodiac: ['白羊','金牛','双子','巨蟹','狮子','处女','天平','天蝎','射手','摩羯','水瓶','双鱼'],
    hobbies: [
      '电影','音乐','旅行','美食','健身','读书','游戏','摄影','绘画','写作',
      '烹饪','徒步','骑行','游泳','瑜伽','舞蹈','唱歌','咖啡','宠物','二次元',
      '电竞','桌游','篮球','足球','网球','滑雪','冲浪','露营','手工','花艺',
    ],
    heights: HEIGHT,
    weights: WEIGHT,
  });
});

function clamp(v, lo, hi) {
  const n = Number(v);
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

module.exports = router;
