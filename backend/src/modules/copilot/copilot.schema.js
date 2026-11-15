const { z } = require("zod");
const { decideRecommendationSchema } = require("../intelligence/agents/agent.schema");

const askCopilotSchema = z.object({
  question: z.string().trim().min(3).max(800),
  sessionId: z.string().uuid().optional().nullable(),
  targetType: z
    .enum(["ASSET", "COMPLAINT", "WARD", "CITY", "GENERAL"])
    .optional()
    .nullable(),
  targetId: z.string().trim().min(1).max(160).optional().nullable(),
  assetCode: z.string().trim().min(2).max(60).optional().nullable(),
  complaintId: z.string().trim().min(2).max(80).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  ward: z.string().trim().max(100).optional().nullable(),
  includeInferred: z.boolean().optional(),
  useGemini: z.boolean().optional(),
});

module.exports = {
  askCopilotSchema,
  decideRecommendationSchema,
};
