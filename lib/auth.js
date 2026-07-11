// lib/auth.js —— 极简 token 鉴权
// token = 随机串 -> 内存映射。生产请用 JWT 或 Redis。
const crypto = require('crypto');
const tokens = new Map(); // token -> { userId, exp }

function issue(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, { userId, exp: Date.now() + 7 * 24 * 3600 * 1000 });
  return token;
}

function verify(token) {
  if (!token) return null;
  const rec = tokens.get(token);
  if (!rec) return null;
  if (rec.exp < Date.now()) {
    tokens.delete(token);
    return null;
  }
  return rec.userId;
}

function revoke(token) {
  tokens.delete(token);
}

function middleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.query.token || '');
  const userId = verify(token);
  if (!userId) {
    req.user = null;
  } else {
    req.user = { id: userId, token };
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '未登录或登录已过期' });
  next();
}

module.exports = { issue, verify, revoke, middleware, requireAuth };
