// lib/auth.js —— token 鉴权（token 存 MongoDB，跨实例共享；过期自动清理）
const { tokens } = require('./store');

const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000;

async function issue(userId) {
  const token = require('crypto').randomBytes(24).toString('hex');
  await tokens.put(token, userId, TOKEN_TTL_MS);
  return token;
}

async function verify(token) {
  if (!token) return null;
  const rec = await tokens.get(token);
  if (!rec) return null;
  return rec.userId;
}

async function revoke(token) {
  if (!token) return;
  await tokens.revoke(token);
}

function middleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.query.token || '');
  if (!token) { req.user = null; return next(); }
  // verify 是 async，但 middleware 不能 await；用 .then 设置 req.user
  verify(token).then((userId) => {
    req.user = userId ? { id: userId, token } : null;
    next();
  }).catch((e) => {
    console.error('[auth middleware]', e);
    req.user = null;
    next();
  });
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '未登录或登录已过期' });
  next();
}

module.exports = { issue, verify, revoke, middleware, requireAuth };
