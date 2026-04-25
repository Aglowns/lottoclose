const jwt = require('jsonwebtoken');

function signTokens(user) {
  const payload = {
    sub: user.id,
    storeId: user.store_id,
    role: user.role,
    name: user.name,
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
  });

  const refreshToken = jwt.sign(
    { sub: user.id, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d' },
  );

  return { accessToken, refreshToken };
}

module.exports = { signTokens };
