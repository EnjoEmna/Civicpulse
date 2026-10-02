const userService = require("./user.service");

async function getCurrentUser(req, res, next) {
  try {
    const user = await userService.getCurrentUser(req.user.id);

    res.status(200).json({
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCurrentUser,
};