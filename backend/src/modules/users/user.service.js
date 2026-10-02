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

module.exports = {
  getUserById,
  getCurrentUser,
};
