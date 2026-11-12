const { z } = require("zod");

const ASSET_TYPES = [
  "ROAD_SEGMENT",
  "WATER_PIPELINE",
  "DRAINAGE",
  "STREETLIGHT_CLUSTER",
  "WASTE_POINT",
];

const MAINTENANCE_TYPES = [
  "INSPECTION",
  "REPAIR",
  "RESURFACING",
  "REPLACEMENT",
  "CLEANING",
  "PREVENTIVE_MAINTENANCE",
];

const MAINTENANCE_OUTCOMES = [
  "COMPLETED",
  "PARTIAL",
  "DEFERRED",
  "FAILED_INSPECTION",
];

const createAssetSchema = z.object({
  assetCode: z.string().trim().min(2).max(40),
  name: z.string().trim().min(3).max(200),
  assetType: z.enum(ASSET_TYPES),
  city: z.string().trim().min(2).max(100).optional().nullable(),
  ward: z.string().trim().min(2).max(100).optional().nullable(),
  zone: z.string().trim().min(2).max(100).optional().nullable(),
  address: z.string().trim().max(255).optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  catchmentRadiusMeters: z.coerce.number().min(50).max(5000).optional(),
  department: z.string().trim().min(2).max(120).optional(),
  installDate: z.string().trim().optional().nullable(),
  lastMaintainedAt: z.string().trim().optional().nullable(),
});

const createMaintenanceEventSchema = z.object({
  eventType: z.enum(MAINTENANCE_TYPES),
  outcome: z.enum(MAINTENANCE_OUTCOMES).optional().default("COMPLETED"),
  performedBy: z.string().trim().max(140).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  performedAt: z.string().trim().optional().nullable(),
});

const recomputeHealthSchema = z.object({
  city: z.string().trim().max(100).optional().nullable(),
});

module.exports = {
  ASSET_TYPES,
  MAINTENANCE_TYPES,
  MAINTENANCE_OUTCOMES,
  createAssetSchema,
  createMaintenanceEventSchema,
  recomputeHealthSchema,
};
