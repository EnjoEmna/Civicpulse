const {
  upvoteComplaint,
} = require("./upvote.service");

async function upvote(req, res, next) {
  try {
    const { complaintId } = req.params;
    const userId = req.user.id;

    const result = await upvoteComplaint({
      complaintId,
      userId,
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    return res.status(result.created ? 201 : 200).json({
      success: true,
      created: result.created,
      upvoteCount: result.upvoteCount,
      message: result.created
        ? "Complaint upvoted successfully"
        : "Complaint already upvoted",
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  upvote,
};