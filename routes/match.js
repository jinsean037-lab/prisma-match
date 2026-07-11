// routes/match.js —— 匹配候选列表
const express = require('express');
const { users } = require('../lib/store');
const { requireAuth } = require('../lib/auth');
const { rank } = require('../lib/match');

const router = express.Router();
router.use(requireAuth);

router.get('/candidates', (req, res) => {
  const me = users.get(req.user.id);
  if (!me) return res.status(404).json({ error: '用户不存在' });
  const all = users.list().filter((u) => u.profileComplete);
  const ranked = rank(me, all);
  res.json({
    candidates: ranked.map((r) => ({
      id: r.user.id,
      nickname: r.user.nickname,
      avatar: r.user.avatar,
      role: r.user.role,
      age: r.user.age || null,
      height: r.user.height,
      weight: r.user.weight,
      mbti: r.user.mbti,
      zodiac: r.user.zodiac,
      hobbies: r.user.hobbies,
      bio: r.user.bio,
      score: r.score,
      reasons: r.reasons,
    })),
  });
});

module.exports = router;
