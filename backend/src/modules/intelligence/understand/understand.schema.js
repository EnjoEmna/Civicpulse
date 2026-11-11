const { z } = require("zod");

const classifyRequestSchema = z
  .object({
    title: z.string().trim().max(200).optional().default(""),
    description: z.string().trim().max(5000).optional().default(""),
    address: z.string().trim().max(500).optional().default(""),
    existingCategory: z.string().trim().max(50).optional().nullable(),
  })
  .refine(
    (data) => data.title.trim().length > 0 || data.description.trim().length > 0,
    {
      message: "Provide a complaint title or description to analyze",
    },
  );

const aiFeedbackSchema = z.object({
  eventType: z.enum([
    "DUPLICATE_SUGGESTION",
    "CLASSIFICATION_SUGGESTION",
    "PRIORITY_SUGGESTION",
    "TRIAGE_SUMMARY",
  ]),
  action: z.enum(["ACCEPTED", "MODIFIED", "REJECTED"]),
  complaintId: z.string().uuid().optional().nullable(),
  targetComplaintId: z.string().uuid().optional().nullable(),
  suggestedValue: z.string().trim().max(100).optional().nullable(),
  finalValue: z.string().trim().max(100).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

const semanticSearchSchema = z.object({
  query: z.string().trim().min(2).max(500),
  city: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).max(50).optional(),
  status: z.string().trim().min(1).max(50).optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

module.exports = {
  classifyRequestSchema,
  aiFeedbackSchema,
  semanticSearchSchema,
};
