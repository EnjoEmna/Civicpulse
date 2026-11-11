const { spatialAnalyzeSchema } = require("./spatial.schema");
const { analyzeNearbyComplaints } = require("./spatial.service");
const {
  detectHotspotsSchema,
  updateHotspotStatusSchema,
} = require("./hotspot.schema");
const {
  detectAndPersistHotspots,
  listSavedHotspots,
  changeHotspotStatus,
  getWardAnalytics,
  listActiveCities,
  geocodePlaceQuery,
} = require("./hotspot.service");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function analyzeSpatialArea(req, res, next) {
  try {
    const validation = spatialAnalyzeSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid spatial analysis request",
          details: validation.error.issues,
        },
      });
    }

    const result = await analyzeNearbyComplaints(validation.data);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function detectHotspots(req, res, next) {
  try {
    const validation = detectHotspotsSchema.safeParse(req.body || {});
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid hotspot detection parameters",
          details: validation.error.issues,
        },
      });
    }

    const result = await detectAndPersistHotspots(validation.data);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function getHotspots(req, res, next) {
  try {
    const result = await listSavedHotspots({
      city: req.query.city,
      status: req.query.status,
      ward: req.query.ward,
      overlapOnly: String(req.query.overlapOnly || "").toLowerCase() === "true",
      limit: req.query.limit,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function updateHotspotStatus(req, res, next) {
  try {
    if (!UUID_REGEX.test(req.params.id)) {
      return res.status(404).json({
        success: false,
        error: {
          code: "HOTSPOT_NOT_FOUND",
          message: "Hotspot not found",
        },
      });
    }

    const validation = updateHotspotStatusSchema.safeParse(req.body || {});
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid hotspot status update",
          details: validation.error.issues,
        },
      });
    }

    const updated = await changeHotspotStatus(
      req.params.id,
      validation.data.status,
    );

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

async function getWardAnalyticsController(req, res, next) {
  try {
    const rawWindow = req.query.timeWindowDays
      ? Number(req.query.timeWindowDays)
      : null;

    const result = await getWardAnalytics({
      city: req.query.city || null,
      timeWindowDays:
        Number.isFinite(rawWindow) && rawWindow > 0 ? rawWindow : null,
      category: req.query.category || null,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function getActiveCitiesController(req, res, next) {
  try {
    const result = await listActiveCities();
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function geocodePlaceController(req, res, next) {
  try {
    const q = String(req.query.q || req.query.query || "").trim();
    const result = await geocodePlaceQuery(q);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  analyzeSpatialArea,
  detectHotspots,
  getHotspots,
  updateHotspotStatus,
  getWardAnalytics: getWardAnalyticsController,
  getActiveCities: getActiveCitiesController,
  geocodePlace: geocodePlaceController,
};
