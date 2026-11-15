const copilotService = require("./copilot.service");
const {
  askCopilotSchema,
  decideRecommendationSchema,
} = require("./copilot.schema");

async function getDigest(req, res, next) {
  try {
    const data = await copilotService.getMorningDigest({
      city: req.query.city || null,
      limit: req.query.limit ? Number(req.query.limit) : 5,
      officer: req.user || null,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function ask(req, res, next) {
  try {
    const validation = askCopilotSchema.safeParse(req.body || {});
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid Copilot query payload",
          details: validation.error.issues,
        },
      });
    }

    const data = await copilotService.askCopilot({
      ...validation.data,
      officer: req.user || null,
    });

    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function listSessions(req, res, next) {
  try {
    const data = await copilotService.listSessions({
      officer: req.user || null,
      city: req.query.city || null,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getSessionDetails(req, res, next) {
  try {
    const data = await copilotService.getSessionDetails(req.params.id, {
      officer: req.user || null,
    });
    return res.status(200).json({ success: true, data });
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

    const recommendation = await copilotService.decideRecommendation(
      req.params.id,
      validation.data,
      req.user,
    );

    return res.status(200).json({
      success: true,
      data: { recommendation },
    });
  } catch (err) {
    next(err);
  }
}

async function getMetrics(req, res, next) {
  try {
    const data = await copilotService.getCopilotMetrics({
      city: req.query.city || null,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDigest,
  ask,
  listSessions,
  getSessionDetails,
  decideRecommendation,
  getMetrics,
};
