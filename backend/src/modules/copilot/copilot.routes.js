const express = require("express");

const authenticate = require("../../middleware/authenticate");
const authorize = require("../../middleware/authorize");
const PERMISSIONS = require("../../domain/permissions");
const {
  getDigest,
  ask,
  listSessions,
  getSessionDetails,
  decideRecommendation,
  getMetrics,
} = require("./copilot.controller");

const router = express.Router();

router.get(
  "/digest",
  authenticate,
  authorize(PERMISSIONS.COPILOT_QUERY),
  getDigest,
);

router.post(
  "/ask",
  authenticate,
  authorize(PERMISSIONS.COPILOT_QUERY),
  ask,
);

router.get(
  "/sessions",
  authenticate,
  authorize(PERMISSIONS.COPILOT_QUERY),
  listSessions,
);

router.get(
  "/sessions/:id",
  authenticate,
  authorize(PERMISSIONS.COPILOT_QUERY),
  getSessionDetails,
);

router.patch(
  "/recommendations/:id/decision",
  authenticate,
  authorize(PERMISSIONS.RECOMMENDATION_DECIDE),
  decideRecommendation,
);

router.get(
  "/metrics",
  authenticate,
  authorize(PERMISSIONS.COPILOT_QUERY),
  getMetrics,
);

module.exports = router;
