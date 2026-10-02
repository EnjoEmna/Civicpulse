const jwt = require("jsonwebtoken");

const config = require("../../config/env");

function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
    },
    config.jwtSecret,
    {
      expiresIn: config.jwtExpiresIn,
    },
  );
}

module.exports = {
  generateAccessToken,
};