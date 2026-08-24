const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config');

function auth(requiredRoles = []) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing token' });
    }
    try {
      const token = authHeader.includes(' ') ? authHeader.split(' ')[1] : authHeader;
      const payload = jwt.verify(token, jwtSecret);
      req.user = payload;
      if (requiredRoles.length && !requiredRoles.includes(payload.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      return next();
    } catch (e) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}

module.exports = { auth };
