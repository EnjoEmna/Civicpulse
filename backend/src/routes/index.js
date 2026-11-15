const express = require("express");

const router = express.Router();

const userRoutes = require("../modules/users/user.routes");
const authRoutes = require("../modules/auth/auth.routes");
const complaintRoutes = require("../modules/complaints/complaint.routes");
const duplicateRoutes = require("../modules/intelligence/understand/duplicate.routes");
const understandRoutes = require("../modules/intelligence/understand/understand.routes");
const infrastructureRoutes = require("../modules/intelligence/infrastructure/infrastructure.routes");
const graphRoutes = require("../modules/intelligence/graph/graph.routes");
const agentRoutes = require("../modules/intelligence/agents/agent.routes");
const copilotRoutes = require("../modules/copilot/copilot.routes");
const spatialRoutes = require("../modules/intelligence/spatial/spatial.routes");

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/complaints", complaintRoutes);
router.use("/intelligence", duplicateRoutes);
router.use("/intelligence", understandRoutes);
router.use("/intelligence/infrastructure", infrastructureRoutes);
router.use("/intelligence/graph", graphRoutes);
router.use("/intelligence/agents", agentRoutes);
router.use("/copilot", copilotRoutes);
router.use("/spatial", spatialRoutes);

module.exports = router;
