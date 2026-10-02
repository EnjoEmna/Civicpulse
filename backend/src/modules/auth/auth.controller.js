const {
  registerUser,
  loginUser,
} = require("./auth.service");

async function register(req, res, next) {
  try {
    const user = await registerUser(req.body);

    res.status(201).json({
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const result = await loginUser(req.body);

    res.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
};