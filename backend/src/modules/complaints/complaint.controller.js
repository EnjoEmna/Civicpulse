const complaintService = require("./complaint.service");

function getRequestBaseUrl(req) {
  const host = req?.get?.("host");
  if (!host) return "";
  return `${req.protocol}://${host}`;
}

function toEvidenceResponse(item, baseUrl = "") {
  const rawUrl = item.file_url || "";
  const url =
    rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
      ? rawUrl
      : baseUrl
        ? `${baseUrl}${rawUrl}`
        : rawUrl;

  return {
    id: item.id,
    complaintId: item.complaint_id,
    originalName: item.original_name,
    mimeType: item.mime_type,
    type: item.file_type,
    fileSize: Number(item.file_size),
    url,
    uploadedAt: item.created_at,
  };
}

function formatHistoryActor(item, complaint, currentUser) {
  if (
    currentUser &&
    item.actor_id &&
    String(item.actor_id) === String(currentUser.id) &&
    currentUser.role === "CITIZEN"
  ) {
    return "You";
  }

  if (item.actor_name) {
    return item.actor_name;
  }

  if (
    complaint?.citizen_id &&
    item.actor_id &&
    String(item.actor_id) === String(complaint.citizen_id)
  ) {
    return "Citizen";
  }

  if (item.actor_role === "OFFICER" || item.actor_role === "ADMIN") {
    return "Department Officer";
  }

  if (item.actor_role === "CITIZEN") {
    return "Citizen";
  }

  return "System";
}

function toTimelineResponse(items, complaint, currentUser) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    id: item.id,
    fromStatus: item.from_status || null,
    status: item.to_status,
    actor: formatHistoryActor(item, complaint, currentUser),
    actorRole: item.actor_role || "SYSTEM",
    note: item.note || `Status transitioned to ${item.to_status}`,
    timestamp: item.created_at,
  }));
}

function toComplaintResponse(complaint, baseUrl = "", currentUser = null) {
  const hasIntelligence = Boolean(
    complaint.ai_summary ||
      complaint.ai_category ||
      complaint.ai_priority ||
      complaint.enrichment_status,
  );

  return {
    id: complaint.id,
    referenceId: complaint.reference_id,
    title: complaint.title,
    description: complaint.description,
    category: complaint.category,
    department: complaint.department || null,
    assignedOfficer: complaint.assigned_officer_id
      ? {
          id: complaint.assigned_officer_id,
          name: complaint.assigned_officer_name || "Assigned Officer",
          email: complaint.assigned_officer_email || null,
        }
      : null,
    address: complaint.address,
    city: complaint.city || null,
    ward: complaint.ward || null,
    zone: complaint.zone || null,
    status: complaint.status,
    priority: complaint.priority,
    latitude: complaint.latitude,
    longitude: complaint.longitude,
    possibleDuplicateOfId: complaint.possible_duplicate_of_id || null,
    evidence: Array.isArray(complaint.evidence)
      ? complaint.evidence.map((e) => toEvidenceResponse(e, baseUrl))
      : [],
    timeline: toTimelineResponse(complaint.timeline, complaint, currentUser),
    intelligence: hasIntelligence
      ? {
          aiCategory: complaint.ai_category || null,
          aiPriority: complaint.ai_priority || null,
          aiSummary: complaint.ai_summary || null,
          aiConfidence:
            complaint.ai_confidence != null
              ? Number(complaint.ai_confidence)
              : null,
          aiTags: Array.isArray(complaint.ai_tags) ? complaint.ai_tags : [],
          aiMetadata: complaint.ai_metadata || null,
          enrichmentStatus: complaint.enrichment_status || "PENDING",
          enrichedAt: complaint.enriched_at || null,
        }
      : null,
    createdAt: complaint.created_at,
    updatedAt: complaint.updated_at,
  };
}

function toNearbyResponse(item, currentUserId) {
  return {
    id: item.id,
    referenceId: item.reference_id,
    title: item.title,
    description: item.description,
    category: item.category,
    department: item.department || null,
    status: item.status,
    priority: item.priority,
    address: item.address,
    city: item.city || null,
    ward: item.ward || null,
    zone: item.zone || null,
    latitude: item.latitude,
    longitude: item.longitude,
    aiSummary: item.ai_summary || null,
    upvoteCount: Number(item.upvote_count || 0),
    distanceMeters: Number(item.distance_meters || 0),
    isOwnComplaint:
      currentUserId != null &&
      item.citizen_id != null &&
      String(item.citizen_id) === String(currentUserId),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

async function createComplaint(req, res, next) {
  try {
    const baseUrl = getRequestBaseUrl(req);
    const complaint = await complaintService.createComplaint({
      citizenId: req.user.id,
      ...req.body,
    });

    return res.status(201).json({
      data: toComplaintResponse(complaint, baseUrl, req.user),
    });
  } catch (error) {
    next(error);
  }
}

async function getComplaintById(req, res, next) {
  try {
    const baseUrl = getRequestBaseUrl(req);
    const complaint = await complaintService.getComplaintById(
      req.params.id,
      req.user,
    );

    return res.status(200).json({
      data: toComplaintResponse(complaint, baseUrl, req.user),
    });
  } catch (error) {
    next(error);
  }
}

async function getMyComplaints(req, res, next) {
  try {
    const baseUrl = getRequestBaseUrl(req);
    const complaints = await complaintService.getMyComplaints(req.user.id);

    return res.status(200).json({
      data: complaints.map((c) => toComplaintResponse(c, baseUrl, req.user)),
    });
  } catch (error) {
    next(error);
  }
}

async function getAllComplaints(req, res, next) {
  try {
    const baseUrl = getRequestBaseUrl(req);
    const complaints = await complaintService.getAllComplaints({
      status: req.query.status,
      category: req.query.category,
      city: req.query.city,
      query: req.query.query,
      limit: req.query.limit,
    });

    return res.status(200).json({
      data: complaints.map((c) => toComplaintResponse(c, baseUrl, req.user)),
    });
  } catch (error) {
    next(error);
  }
}

async function getMapComplaints(req, res, next) {
  try {
    const baseUrl = getRequestBaseUrl(req);
    const complaints = await complaintService.getMapComplaints({
      status: req.query.status,
      category: req.query.category,
      city: req.query.city,
    });

    return res.status(200).json({
      data: complaints.map((c) => toComplaintResponse(c, baseUrl, req.user)),
    });
  } catch (error) {
    next(error);
  }
}

async function getNearbyComplaints(req, res, next) {
  try {
    const complaints = await complaintService.getNearbyComplaints({
      latitude: req.query.lat ?? req.query.latitude,
      longitude: req.query.lng ?? req.query.longitude,
      radiusMeters: req.query.radius ?? req.query.radiusMeters,
      category: req.query.category,
      city: req.query.city,
      limit: req.query.limit,
    });

    return res.status(200).json({
      data: complaints.map((item) => toNearbyResponse(item, req.user?.id)),
    });
  } catch (error) {
    next(error);
  }
}

async function getComplaintStats(req, res, next) {
  try {
    const stats = await complaintService.getComplaintStats();

    return res.status(200).json({
      data: stats,
    });
  } catch (error) {
    next(error);
  }
}

async function updateComplaintStatus(req, res, next) {
  try {
    const baseUrl = getRequestBaseUrl(req);
    const complaint = await complaintService.updateComplaintStatus(
      req.params.id,
      req.body.status,
      {
        actor: req.user,
        note: req.body.note,
        assignedOfficerId: req.body.assignedOfficerId,
        possibleDuplicateOfId: req.body.possibleDuplicateOfId,
      },
    );

    return res.status(200).json({
      data: toComplaintResponse(complaint, baseUrl, req.user),
    });
  } catch (error) {
    next(error);
  }
}

async function assignComplaint(req, res, next) {
  try {
    const baseUrl = getRequestBaseUrl(req);
    const complaint = await complaintService.assignComplaint(req.params.id, {
      assignedOfficerId: req.body.assignedOfficerId,
      actor: req.user,
      note: req.body.note,
    });

    return res.status(200).json({
      data: toComplaintResponse(complaint, baseUrl, req.user),
    });
  } catch (error) {
    next(error);
  }
}

async function uploadComplaintEvidence(req, res, next) {
  try {
    const baseUrl = getRequestBaseUrl(req);
    const files = req.uploadedFiles || [];
    const inserted = await complaintService.addComplaintEvidence(
      req.params.id,
      files,
      req.user,
    );

    return res.status(201).json({
      data: inserted.map((item) => toEvidenceResponse(item, baseUrl)),
    });
  } catch (error) {
    next(error);
  }
}

async function getComplaintEvidence(req, res, next) {
  try {
    const baseUrl = getRequestBaseUrl(req);
    const records = await complaintService.getComplaintEvidence(
      req.params.id,
      req.user,
    );

    return res.status(200).json({
      data: records.map((item) => toEvidenceResponse(item, baseUrl)),
    });
  } catch (error) {
    next(error);
  }
}

async function deleteComplaintEvidence(req, res, next) {
  try {
    const deleted = await complaintService.deleteComplaintEvidence(
      req.params.id,
      req.params.evidenceId,
      req.user,
    );

    return res.status(200).json({
      data: {
        id: deleted.id,
        deleted: true,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createComplaint,
  getComplaintById,
  getMyComplaints,
  updateComplaintStatus,
  assignComplaint,
  getAllComplaints,
  getMapComplaints,
  getNearbyComplaints,
  getComplaintStats,
  uploadComplaintEvidence,
  getComplaintEvidence,
  deleteComplaintEvidence,
  toComplaintResponse,
};
