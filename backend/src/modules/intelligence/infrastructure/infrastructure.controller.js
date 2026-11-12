const {
  createAssetSchema,
  createMaintenanceEventSchema,
  recomputeHealthSchema,
} = require("./infrastructure.schema");
const infrastructureService = require("./infrastructure.service");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getInfrastructureHealth(req, res, next) {
  try {
    const data = await infrastructureService.getInfrastructureOverview({
      city: req.query.city || null,
      ward: req.query.ward || null,
      assetType: req.query.assetType || null,
      grade: req.query.grade || null,
      sortBy: req.query.sortBy || "lowest_health",
      limit: req.query.limit ? Number(req.query.limit) : 100,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function getWardHealth(req, res, next) {
  try {
    const data = await infrastructureService.getWardHealthSummary({
      city: req.query.city || null,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function getAssetById(req, res, next) {
  try {
    if (!UUID_REGEX.test(req.params.id)) {
      return res.status(404).json({
        success: false,
        error: {
          code: "ASSET_NOT_FOUND",
          message: "Infrastructure asset not found",
        },
      });
    }

    const data = await infrastructureService.getAssetDetails(req.params.id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function createAsset(req, res, next) {
  try {
    const validation = createAssetSchema.safeParse(req.body || {});
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid infrastructure asset payload",
          details: validation.error.issues,
        },
      });
    }

    const data = await infrastructureService.registerAsset(validation.data);
    return res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function logMaintenanceEvent(req, res, next) {
  try {
    if (!UUID_REGEX.test(req.params.id)) {
      return res.status(404).json({
        success: false,
        error: {
          code: "ASSET_NOT_FOUND",
          message: "Infrastructure asset not found",
        },
      });
    }

    const validation = createMaintenanceEventSchema.safeParse(req.body || {});
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid maintenance event payload",
          details: validation.error.issues,
        },
      });
    }

    const data = await infrastructureService.recordMaintenanceForAsset(
      req.params.id,
      validation.data,
      req.user,
    );

    return res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function recomputeHealth(req, res, next) {
  try {
    const validation = recomputeHealthSchema.safeParse(req.body || {});
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid recompute request",
          details: validation.error.issues,
        },
      });
    }

    const data = await infrastructureService.recalculateInfrastructureHealth({
      city: validation.data.city || null,
      forceSnapshot: true,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function getAssetsForComplaintController(req, res, next) {
  try {
    if (!UUID_REGEX.test(req.params.complaintId)) {
      return res.status(404).json({
        success: false,
        error: {
          code: "COMPLAINT_NOT_FOUND",
          message: "Complaint not found",
        },
      });
    }

    const assets = await infrastructureService.getAssetsForComplaint(
      req.params.complaintId,
    );

    return res.status(200).json({
      success: true,
      data: {
        complaintId: req.params.complaintId,
        assets,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getInfrastructureMetrics(req, res, next) {
  try {
    const data = await infrastructureService.getInfrastructureMetrics({
      city: req.query.city || null,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getInfrastructureHealth,
  getWardHealth,
  getAssetById,
  createAsset,
  logMaintenanceEvent,
  recomputeHealth,
  getAssetsForComplaint: getAssetsForComplaintController,
  getInfrastructureMetrics,
};
