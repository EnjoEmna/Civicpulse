const bcrypt = require("bcrypt");
const userRepository = require("./user.repository");

async function getUserById(id) {
  const user = await userRepository.findUserById(id);

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";

    throw error;
  }

  return user;
}

async function getCurrentUser(id) {
  return getUserById(id);
}

async function listOfficers() {
  return userRepository.findOfficers();
}

async function changeUserPassword(id, { currentPassword, newPassword }) {
  const user = await userRepository.findUserAuthById(id);

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  const matches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!matches) {
    const error = new Error("Current password is incorrect");
    error.statusCode = 401;
    error.code = "INVALID_CURRENT_PASSWORD";
    throw error;
  }

  const nextHash = await bcrypt.hash(newPassword, 12);
  return userRepository.updateUserPassword(id, nextHash);
}

module.exports = {
  getUserById,
  getCurrentUser,
  listOfficers,
  changeUserPassword,
};
