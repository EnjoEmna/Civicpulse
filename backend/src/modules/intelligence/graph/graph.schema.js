const { z } = require("zod");

const ENTITY_TYPES = [
  "COMPLAINT",
  "INFRASTRUCTURE_ASSET",
  "HOTSPOT",
  "MAINTENANCE_EVENT",
  "WARD",
  "DEPARTMENT",
  "OFFICER",
  "CATEGORY",
];

const rebuildGraphSchema = z.object({
  city: z.string().trim().max(100).optional().nullable(),
});

module.exports = {
  ENTITY_TYPES,
  rebuildGraphSchema,
};
