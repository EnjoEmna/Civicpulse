const { findDuplicateCandidates } = require("./duplicate.service");

const { duplicateCheckSchema } = require("./duplicate.schema");

async function checkDuplicates(req, res, next) {
  try {
    const { error, value } = duplicateCheckSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid duplicate-check request",
        errors: error.details.map((detail) => detail.message),
      });
    }

    const candidates = await findDuplicateCandidates(value);

    const possibleDuplicates = candidates.filter(
      (candidate) => candidate.isDuplicate,
    );

    return res.status(200).json({
      success: true,
      hasPossibleDuplicates: possibleDuplicates.length > 0,
      candidates: possibleDuplicates.map((candidate) => ({
        complaintId: candidate.complaintId,
        description: candidate.description,
        category: candidate.category,
        status: candidate.status,
        priority: candidate.priority,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        createdAt: candidate.createdAt,
        similarity: candidate.similarity,
        upvoteCount: candidate.upvoteCount,
        distanceMeters: candidate.distanceMeters,
        categoryMatch: candidate.categoryMatch,
      })),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  checkDuplicates,
};
