const complaintService = require("./complaint.service");

async function createComplaint(req, res, next) {
  try {
    const complaint = await complaintService.createComplaint({
      citizenId: req.user.id,
      ...req.body,
    });

    res.status(201).json({
      data: {
        id: complaint.id,
        status: complaint.status,
        createdAt: complaint.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getComplaintById(req, res, next) {
  try {
    const complaint = await complaintService.getComplaintById(
      req.params.id,
      req.user,
    );

    res.status(200).json({
      data: complaint,
    });
  } catch (error) {
    next(error);
  }
}

async function updateComplaintStatus(req, res, next) {
  try {
    const complaint = await complaintService.updateComplaintStatus(
      req.params.id,
      req.body.status,
    );

    res.status(200).json({
      data: complaint,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createComplaint,
  getComplaintById,
  updateComplaintStatus,
};
