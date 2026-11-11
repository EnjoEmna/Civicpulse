const express = require("express");

const authenticate = require("../../../middleware/authenticate");
const authorize = require("../../../middleware/authorize");
const validate = require("../../../middleware/validate");
const PERMISSIONS = require("../../../domain/permissions");
const {
  classifyRequestSchema,
  aiFeedbackSchema,
  semanticSearchSchema,
} = require("./understand.schema");
const {
  classifyDraft,
  enrichComplaintById,
  getBackgroundJobs,
  retryBackgroundJobs,
  submitAiFeedback,
  getIntelligenceMetrics,
  semanticSearch,
  getSimilarAndHotspots,
} = require("./understand.controller");

const router = express.Router();

router.post(
  "/classify",
  authenticate,
  validate(classifyRequestSchema),
  classifyDraft,
);

router.post(
  "/complaints/:id/enrich",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  enrichComplaintById,
);

router.get(
  "/jobs",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getBackgroundJobs,
);

router.post(
  "/jobs/retry",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  retryBackgroundJobs,
);

router.post(
  "/feedback",
  authenticate,
  validate(aiFeedbackSchema),
  submitAiFeedback,
);

router.get(
  "/metrics",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getIntelligenceMetrics,
);

router.post(
  "/search",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  validate(semanticSearchSchema),
  semanticSearch,
);

router.get(
  "/complaints/:id/similar",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getSimilarAndHotspots,
);

module.exports = router;
