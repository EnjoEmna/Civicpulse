const bcrypt = require("bcrypt");

const authRepository = require("./auth.repository");
const { generateAccessToken } = require("./auth.tokens");

async function registerUser({ name, email, password }) {
  const existingUser = await authRepository.findUserByEmail(email);

  if (existingUser) {
    const error = new Error("Email is already registered");
    error.statusCode = 409;
    error.code = "EMAIL_ALREADY_EXISTS";

    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await authRepository.createUser({
    name,
    email,
    passwordHash,
  });

  return user;
}

async function loginUser({ email, password }) {
  const user = await authRepository.findUserByEmail(email);

  if (!user) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    error.code = "INVALID_CREDENTIALS";

    throw error;
  }

  const passwordMatches = await bcrypt.compare(
    password,
    user.password_hash,
  );

  if (!passwordMatches) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    error.code = "INVALID_CREDENTIALS";

    throw error;
  }

  const accessToken = generateAccessToken(user);

  return {
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

module.exports = {
  registerUser,
  loginUser,
};