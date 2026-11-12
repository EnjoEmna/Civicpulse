const express = require("express");

const authenticate = require("../../../middleware/authenticate");
const authorize = require("../../../middleware/authorize");
const PERMISSIONS = require("../../../domain/permissions");
const {
  getOverview,
  getNodeNeighborhood,
  investigateAsset,
  investigateComplaint,
  getShortestPath,
  getMetrics,
  rebuildGraph,
} = require("./graph.controller");

const router = express.Router();

router.get(
  "/overview",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getOverview,
);

router.get(
  "/metrics",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getMetrics,
);

router.get(
  "/path",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getShortestPath,
);

router.get(
  "/nodes/:nodeKey",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getNodeNeighborhood,
);

router.get(
  "/investigate/asset/:assetIdOrCode",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  investigateAsset,
);

router.get(
  "/investigate/complaint/:complaintId",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  investigateComplaint,
);

router.post(
  "/rebuild",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  rebuildGraph,
);

module.exports = router;
