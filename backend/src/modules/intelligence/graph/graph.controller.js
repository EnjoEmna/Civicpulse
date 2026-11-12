const graphService = require("./graph.service");
const graphBuilder = require("./graph-builder.service");
const { rebuildGraphSchema } = require("./graph.schema");

async function getOverview(req, res, next) {
  try {
    const data = await graphService.getGraphOverview({
      city: req.query.city || null,
      entityType: req.query.entityType || null,
      q: req.query.q || null,
      limit: req.query.limit ? Number(req.query.limit) : 120,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getNodeNeighborhood(req, res, next) {
  try {
    const includeInferred =
      req.query.includeInferred !== undefined
        ? req.query.includeInferred !== "false"
        : true;
    const data = await graphService.getNodeNeighborhood(req.params.nodeKey, {
      depth: req.query.depth ? Number(req.query.depth) : 2,
      maxNodes: req.query.maxNodes ? Number(req.query.maxNodes) : 75,
      includeInferred,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function investigateAsset(req, res, next) {
  try {
    const includeInferred =
      req.query.includeInferred !== undefined
        ? req.query.includeInferred !== "false"
        : true;
    const data = await graphService.investigateAsset(req.params.assetIdOrCode, {
      includeInferred,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function investigateComplaint(req, res, next) {
  try {
    const includeInferred =
      req.query.includeInferred !== undefined
        ? req.query.includeInferred !== "false"
        : true;
    const data = await graphService.investigateComplaint(req.params.complaintId, {
      includeInferred,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getShortestPath(req, res, next) {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Both 'from' and 'to' query parameters are required.",
        },
      });
    }
    const includeInferred =
      req.query.includeInferred !== undefined
        ? req.query.includeInferred !== "false"
        : true;
    const data = await graphService.findShortestPath(from, to, {
      maxDepth: req.query.maxDepth ? Number(req.query.maxDepth) : 5,
      includeInferred,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getMetrics(req, res, next) {
  try {
    const data = await graphService.getGraphMetrics({
      city: req.query.city || null,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function rebuildGraph(req, res, next) {
  try {
    const validation = rebuildGraphSchema.safeParse(req.body || {});
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid knowledge graph rebuild payload",
          details: validation.error.issues,
        },
      });
    }

    const data = await graphBuilder.syncKnowledgeGraph({
      city: validation.data.city || null,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOverview,
  getNodeNeighborhood,
  investigateAsset,
  investigateComplaint,
  getShortestPath,
  getMetrics,
  rebuildGraph,
};
