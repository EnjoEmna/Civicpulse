const express = require("express");

const authenticate = require("../../middleware/authenticate");
const authorize = require("../../middleware/authorize");
const validate = require("../../middleware/validate");
const { uploadEvidenceMiddleware } = require("../../config/storage");

const PERMISSIONS = require("../../domain/permissions");
const authorizeAny = require("../../middleware/authorizeAny");

const {
  createComplaint,
  getComplaintById,
  getMyComplaints,
  updateComplaintStatus,
  assignComplaint,
  getAllComplaints,
  getMapComplaints,
  getNearbyComplaints,
  getComplaintStats,
  uploadComplaintEvidence,
  getComplaintEvidence,
  deleteComplaintEvidence,
} = require("./complaint.controller");

const {
  createComplaintSchema,
  updateComplaintStatusSchema,
  assignComplaintSchema,
} = require("./complaint.schema");

const { upvote } = require("./upvote.controller");

const router = express.Router();

router.get(
  "/",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getAllComplaints,
);

router.post(
  "/",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_CREATE),
  validate(createComplaintSchema),
  createComplaint,
);

router.get("/mine", authenticate, getMyComplaints);

router.get("/nearby", authenticate, getNearbyComplaints);

router.get(
  "/stats",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getComplaintStats,
);

router.get(
  "/map",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_READ_DEPARTMENT),
  getMapComplaints,
);

router.post("/:complaintId/upvote", authenticate, upvote);

router.get(
  "/:id/evidence",
  authenticate,
  authorizeAny(
    PERMISSIONS.COMPLAINT_READ_OWN,
    PERMISSIONS.COMPLAINT_READ_DEPARTMENT,
  ),
  getComplaintEvidence,
);

router.post(
  "/:id/evidence",
  authenticate,
  authorizeAny(
    PERMISSIONS.COMPLAINT_CREATE,
    PERMISSIONS.COMPLAINT_UPDATE_STATUS,
  ),
  uploadEvidenceMiddleware,
  uploadComplaintEvidence,
);

router.delete(
  "/:id/evidence/:evidenceId",
  authenticate,
  authorizeAny(
    PERMISSIONS.COMPLAINT_CREATE,
    PERMISSIONS.COMPLAINT_UPDATE_STATUS,
  ),
  deleteComplaintEvidence,
);

router.get(
  "/:id",
  authenticate,
  authorizeAny(
    PERMISSIONS.COMPLAINT_READ_OWN,
    PERMISSIONS.COMPLAINT_READ_DEPARTMENT,
  ),
  getComplaintById,
);

router.patch(
  "/:id/status",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_UPDATE_STATUS),
  validate(updateComplaintStatusSchema),
  updateComplaintStatus,
);

router.patch(
  "/:id/assign",
  authenticate,
  authorize(PERMISSIONS.COMPLAINT_UPDATE_STATUS),
  validate(assignComplaintSchema),
  assignComplaint,
);

module.exports = router;
