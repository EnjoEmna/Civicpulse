const { z } = require("zod");

const createComplaintSchema = z.object({
  description: z.string().min(10).max(5000),

  category: z.string().max(50).optional(),

  latitude: z.number().min(-90).max(90).optional(),

  longitude: z.number().min(-180).max(180).optional(),
});

const updateComplaintStatusSchema = z.object({
  status: z.enum([
    "UNDER_REVIEW",
    "ASSIGNED",
    "IN_PROGRESS",
    "RESOLVED",
    "REJECTED",
    "NEEDS_INFORMATION",
    "DUPLICATE_SUSPECTED",
  ]),
});

module.exports = {
  createComplaintSchema,
  updateComplaintStatusSchema,
};