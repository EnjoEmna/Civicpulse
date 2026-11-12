const express = require("express");

const authenticate = require("../../../middleware/authenticate");
const authorize = require("../../../middleware/authorize");
const PERMISSIONS = require("../../../domain/permissions");
const {
  investigate,
  listRuns,
  getRunDetails,
  listRecommendations,
  decideRecommendation,
  getMetrics,
  listTools,
} = require("./agent.controller");

const router = express.Router();

router.post(
  "/investigate",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  investigate,
);

router.get(
  "/runs",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  listRuns,
);

router.get(
  "/runs/:id",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getRunDetails,
);

router.get(
  "/recommendations",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  listRecommendations,
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
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getMetrics,
);

router.get(
  "/tools",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  listTools,
);

module.exports = router;
