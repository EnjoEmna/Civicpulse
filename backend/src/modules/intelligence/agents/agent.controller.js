const agentOrchestrator = require("./agent-orchestrator.service");
const { listToolSchemas } = require("./agent-tools");
const {
  investigateSchema,
  decideRecommendationSchema,
} = require("./agent.schema");

async function investigate(req, res, next) {
  try {
    const validation = investigateSchema.safeParse(req.body || {});
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid multi-agent investigation request",
          details: validation.error.issues,
        },
      });
    }

    const result = await agentOrchestrator.orchestrateInvestigation({
      ...validation.data,
      initiatedBy: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

async function listRuns(req, res, next) {
  try {
    const result = await agentOrchestrator.listOrchestrationRuns({
      city: req.query.city || null,
      status: req.query.status || null,
      targetType: req.query.targetType || null,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getRunDetails(req, res, next) {
  try {
    const result = await agentOrchestrator.getOrchestrationRunDetails(req.params.id);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function listRecommendations(req, res, next) {
  try {
    const result = await agentOrchestrator.listRecommendations({
      decisionStatus: req.query.status || null,
      city: req.query.city || null,
      priority: req.query.priority || null,
      agentRunId: req.query.runId || null,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function decideRecommendation(req, res, next) {
  try {
    const validation = decideRecommendationSchema.safeParse(req.body || {});
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid recommendation decision payload",
          details: validation.error.issues,
        },
      });
    }

    const updated = await agentOrchestrator.decideRecommendation(
      req.params.id,
      validation.data,
      req.user,
    );

    return res.status(200).json({
      success: true,
      data: { recommendation: updated },
    });
  } catch (err) {
    next(err);
  }
}

async function getMetrics(req, res, next) {
  try {
    const data = await agentOrchestrator.getAgentEvaluationMetrics({
      city: req.query.city || null,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function listTools(req, res) {
  return res.status(200).json({
    success: true,
    data: {
      tools: listToolSchemas(),
    },
  });
}

module.exports = {
  investigate,
  listRuns,
  getRunDetails,
  listRecommendations,
  decideRecommendation,
  getMetrics,
  listTools,
};
