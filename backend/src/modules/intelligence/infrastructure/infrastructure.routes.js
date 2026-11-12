const express = require("express");

const authenticate = require("../../../middleware/authenticate");
const authorize = require("../../../middleware/authorize");
const PERMISSIONS = require("../../../domain/permissions");
const {
  getInfrastructureHealth,
  getWardHealth,
  getAssetById,
  createAsset,
  logMaintenanceEvent,
  recomputeHealth,
  getAssetsForComplaint,
  getInfrastructureMetrics,
} = require("./infrastructure.controller");

const router = express.Router();

router.get(
  "/health",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getInfrastructureHealth,
);

router.get(
  "/metrics",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getInfrastructureMetrics,
);

router.get(
  "/wards",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getWardHealth,
);

router.get(
  "/assets/:id",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getAssetById,
);

router.post(
  "/assets",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_UPDATE_STATUS),
  createAsset,
);

router.post(
  "/assets/:id/maintenance",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_UPDATE_STATUS),
  logMaintenanceEvent,
);

router.post(
  "/recompute",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  recomputeHealth,
);

router.get(
  "/complaints/:complaintId",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getAssetsForComplaint,
);

module.exports = router;
