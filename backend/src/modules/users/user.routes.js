const express = require("express");

const authenticate = require("../../middleware/authenticate");
const authorize = require("../../middleware/authorize");
const validate = require("../../middleware/validate");
const PERMISSIONS = require("../../domain/permissions");
const { changePasswordSchema } = require("./user.schema");
const {
  getCurrentUser,
  getOfficers,
  updatePassword,
} = require("./user.controller");

const router = express.Router();

router.get("/me", authenticate, getCurrentUser);
router.patch(
  "/me/password",
  authenticate,
  validate(changePasswordSchema),
  updatePassword,
);
router.get(
  "/officers",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getOfficers,
);

module.exports = router;
