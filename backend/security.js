const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');

// Each middleware owns its counters; traffic on other endpoints cannot consume them.
function rateLimiter(limit = 60, windowMs = 60000) {
  const counters = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of counters) if (value.until <= now) counters.delete(key);
    const key = req.ip || req.socket.remoteAddress;
    let entry = counters.get(key);
    if (!entry) { entry = { count: 0, until: now + windowMs }; counters.set(key, entry); }
    if (++entry.count > limit) {
      res.setHeader('Retry-After', Math.ceil((entry.until - now) / 1000));
      return res.status(429).json({ error: 'Çok fazla istek. Lütfen daha sonra tekrar deneyin.' });
    }
    next();
  };
}

function createAdminAuth(password, { ttlMs = 8 * 60 * 60 * 1000, now = Date.now } = {}) {
  const sessions = new Map();
  const digest = value => createHash('sha256').update(value).digest();
  const configured = typeof password === 'string' && password.length >= 6;
  const expected = configured ? digest(password) : null;
  const tokenFrom = req => /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
  const purge = () => { for (const [key, expiry] of sessions) if (expiry <= now()) sessions.delete(key); };
  return {
    login(req, res) {
      if (!configured) return res.status(503).json({ error: 'Yönetici girişi yapılandırılmamış.' });
      const supplied = req.body?.password;
      if (typeof supplied !== 'string' || supplied.length > 1024 || !timingSafeEqual(expected, digest(supplied))) {
        return res.status(401).json({ error: 'Hatalı şifre.' });
      }
      purge();
      if (sessions.size >= 1000) return res.status(429).json({ error: 'Çok fazla aktif oturum.' });
      const token = randomBytes(32).toString('hex');
      const expiresAt = now() + ttlMs;
      sessions.set(digest(token).toString('hex'), expiresAt);
      res.json({ token, expiresAt });
    },
    requireAdmin(req, res, next) {
      purge();
      const token = tokenFrom(req);
      if (!token || !sessions.has(digest(token).toString('hex'))) {
        return res.status(401).json({ error: 'Yönetici oturumu gerekli.' });
      }
      next();
    },
    logout(req, res) {
      const token = tokenFrom(req);
      if (token) sessions.delete(digest(token).toString('hex'));
      res.sendStatus(204);
    }
  };
}

module.exports = { rateLimiter, createAdminAuth };
