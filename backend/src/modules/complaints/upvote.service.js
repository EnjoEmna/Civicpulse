const {
  complaintExists,
} = require("./complaint.repository");

const {
  createUpvote,
  countUpvotes,
} = require("../../repositories/complaint-upvote.repository");

async function upvoteComplaint({ complaintId, userId }) {
  const exists = await complaintExists(complaintId);

  if (!exists) {
    return null;
  }

  const upvote = await createUpvote({
    complaintId,
    userId,
  });

  const upvoteCount = await countUpvotes(complaintId);

  return {
    created: upvote !== null,
    upvoteCount,
  };
}

module.exports = {
  upvoteComplaint,
};