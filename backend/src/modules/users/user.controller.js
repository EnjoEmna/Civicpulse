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

async function getOfficers(req, res, next) {
  try {
    const officers = await userService.listOfficers();

    res.status(200).json({
      data: officers,
    });
  } catch (error) {
    next(error);
  }
}

async function updatePassword(req, res, next) {
  try {
    const updated = await userService.changeUserPassword(req.user.id, req.body);

    res.status(200).json({
      data: {
        id: updated.id,
        updatedAt: updated.updated_at,
        message: "Password updated successfully",
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCurrentUser,
  getOfficers,
  updatePassword,
};
