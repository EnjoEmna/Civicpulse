const { z } = require("zod");

const spatialClusteringSchema = z
  .object({
    latitude: z.number().min(-90).max(90).optional(),

    longitude: z.number().min(-180).max(180).optional(),

    cityWide: z.boolean().optional().default(false),

    // Geographic area to analyze
    radiusMeters: z.number().int().min(100).max(50000).default(5000),

    // Maximum distance between directly connected complaints
    clusterDistanceMeters: z.number().int().min(10).max(1000).default(150),

    // Exclude isolated complaints from the cluster output
    minClusterSize: z.number().int().min(2).max(100).default(2),

    // Optional filter; ROAD and ROADS will be normalized
    category: z.string().trim().min(1).max(50).optional(),

    // Optional time window filter (days)
    timeWindowDays: z.number().int().min(1).max(3650).optional(),

    // Optional city filter
    city: z.string().trim().min(1).max(100).optional(),

    // Optional municipal ward filter
    ward: z.string().trim().min(1).max(100).optional(),
  })
  .refine(
    (data) =>
      data.cityWide === true ||
      (data.latitude !== undefined && data.longitude !== undefined),
    {
      message: "Provide latitude and longitude or enable cityWide clustering",
    },
  );

module.exports = {
  spatialClusteringSchema,
};
