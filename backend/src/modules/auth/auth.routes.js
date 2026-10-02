const express = require("express");

const {
  register,
  login,
} = require("./auth.controller");

const {
  registerSchema,
  loginSchema,
} = require("./auth.schema");

const validate = require("../../middleware/validate");

const router = express.Router();

router.post(
  "/register",
  validate(registerSchema),
  register,
);

router.post(
  "/login",
  validate(loginSchema),
  login,
);

module.exports = router;