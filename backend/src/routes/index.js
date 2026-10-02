const express = require("express");

const router = express.Router();

const userRoutes = require("../modules/users/user.routes");
const authRoutes = require("../modules/auth/auth.routes");
const complaintRoutes = require("../modules/complaints/complaint.routes");
const duplicateRoutes = require(
  "../modules/intelligence/understand/duplicate.routes"
);

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/complaints", complaintRoutes);
router.use("/intelligence", duplicateRoutes);

module.exports = router;