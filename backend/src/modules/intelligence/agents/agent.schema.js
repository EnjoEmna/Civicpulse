const { z } = require("zod");

const investigateSchema = z.object({
  question: z.string().trim().min(3).max(800).optional(),
  targetType: z
    .enum(["ASSET", "COMPLAINT", "WARD", "CITY", "GENERAL"])
    .optional(),
  targetId: z.string().trim().min(1).max(160).optional(),
  assetCode: z.string().trim().min(2).max(60).optional(),
  complaintId: z.string().trim().min(2).max(80).optional(),
  city: z.string().trim().max(100).optional().nullable(),
  ward: z.string().trim().max(100).optional().nullable(),
  includeInferred: z.boolean().optional(),
  useGemini: z.boolean().optional(),
});

const decideRecommendationSchema = z
  .object({
    decision: z.enum(["ACCEPTED", "REJECTED", "MODIFIED"]),
    modifiedAction: z.string().trim().min(5).max(1000).optional().nullable(),
    decisionNote: z.string().trim().max(1000).optional().nullable(),
  })
  .refine(
    (val) =>
      val.decision !== "MODIFIED" ||
      (typeof val.modifiedAction === "string" &&
        val.modifiedAction.trim().length >= 5),
    {
      message:
        "modifiedAction (at least 5 characters) is required when decision is MODIFIED.",
      path: ["modifiedAction"],
    },
  );

module.exports = {
  investigateSchema,
  decideRecommendationSchema,
};
