const crypto = require('crypto');

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkCredentials(user, pass) {
  const expectedUser = process.env.WEB_ADMIN_USER || '';
  const expectedPass = process.env.WEB_ADMIN_PASS || '';
  if (!expectedUser || !expectedPass) return false;
  return timingSafeEqual(user || '', expectedUser) && timingSafeEqual(pass || '', expectedPass);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'No autenticado' });
  return res.redirect('/login.html');
}

module.exports = { checkCredentials, requireAuth };
