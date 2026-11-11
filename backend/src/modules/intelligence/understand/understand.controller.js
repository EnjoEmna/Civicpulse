const { classifyComplaint } = require("./classification.service");
const { understandComplaint } = require("./understand.service");
const {
  semanticSearchComplaints,
  findRelatedComplaintsForComplaint,
} = require("./semantic-search.service");
const {
  JOB_TYPES,
  processComplaintEnrichment,
} = require("../../../jobs/complaint-enrichment.job");
const {
  processDueJobs,
  backfillUnenrichedComplaints,
} = require("../../../jobs/retry.job");
const backgroundJobRepository = require("../../../repositories/background-job.repository");
const aiFeedbackRepository = require("../../../repositories/ai-feedback.repository");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function classifyDraft(req, res, next) {
  try {
    const analysis = await understandComplaint({
      title: req.body.title,
      description: req.body.description,
      address: req.body.address,
      existingCategory: req.body.existingCategory,
    });

    return res.status(200).json({
      data: analysis,
    });
  } catch (error) {
    next(error);
  }
}

async function classifyOnly(req, res, next) {
  try {
    const classification = await classifyComplaint({
      title: req.body.title,
      description: req.body.description,
      address: req.body.address,
      existingCategory: req.body.existingCategory,
    });

    return res.status(200).json({
      data: classification,
    });
  } catch (error) {
    next(error);
  }
}

async function enrichComplaintById(req, res, next) {
  try {
    const complaintId = req.params.id;
    if (!UUID_REGEX.test(complaintId)) {
      return res.status(404).json({
        error: {
          code: "COMPLAINT_NOT_FOUND",
          message: "Complaint not found",
        },
      });
    }

    const job = await backgroundJobRepository.enqueueJob({
      jobType: JOB_TYPES.COMPLAINT_ENRICHMENT,
      complaintId,
      payload: { complaintId, triggeredBy: req.user.id },
    });

    await backgroundJobRepository.claimJobForProcessing(job.id);

    try {
      const outcome = await processComplaintEnrichment(complaintId);
      await backgroundJobRepository.markJobCompleted(job.id, {
        aiCategory: outcome.intelligence.category,
        aiPriority: outcome.intelligence.priority,
        department: outcome.intelligence.department,
        confidence: outcome.intelligence.confidence,
        embeddingStatus: outcome.embedding?.status || "SKIPPED",
        source:
          outcome.intelligence.metadata?.classificationProvenance?.source ||
          "rule-based",
      });

      return res.status(200).json({
        data: {
          complaintId,
          aiCategory: outcome.complaint.ai_category,
          aiPriority: outcome.complaint.ai_priority,
          aiSummary: outcome.complaint.ai_summary,
          aiConfidence: outcome.complaint.ai_confidence,
          aiTags: outcome.complaint.ai_tags,
          aiMetadata: outcome.complaint.ai_metadata,
          priority: outcome.complaint.priority,
          department: outcome.complaint.department,
          enrichmentStatus: outcome.complaint.enrichment_status,
          enrichedAt: outcome.complaint.enriched_at,
          embedding: outcome.embedding,
        },
      });
    } catch (err) {
      await backgroundJobRepository
        .scheduleJobRetry(job.id, err.message)
        .catch(() => {});
      throw err;
    }
  } catch (error) {
    next(error);
  }
}

async function getBackgroundJobs(req, res, next) {
  try {
    const [stats, jobs] = await Promise.all([
      backgroundJobRepository.getJobStats(),
      backgroundJobRepository.listJobs({
        status: req.query.status,
        jobType: req.query.jobType,
        limit: req.query.limit,
      }),
    ]);

    return res.status(200).json({
      data: {
        stats,
        jobs: jobs.map((job) => ({
          id: job.id,
          jobType: job.job_type,
          complaintId: job.complaint_id,
          referenceId: job.reference_id,
          complaintTitle: job.complaint_title,
          enrichmentStatus: job.enrichment_status,
          status: job.status,
          attempts: job.attempts,
          maxAttempts: job.max_attempts,
          result: job.result,
          lastError: job.last_error,
          nextRunAt: job.next_run_at,
          completedAt: job.completed_at,
          updatedAt: job.updated_at,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
}

async function retryBackgroundJobs(req, res, next) {
  try {
    const backfill = await backfillUnenrichedComplaints(25);
    const due = await processDueJobs(25);

    return res.status(200).json({
      data: {
        backfill,
        due,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function submitAiFeedback(req, res, next) {
  try {
    const saved = await aiFeedbackRepository.recordFeedback({
      eventType: req.body.eventType,
      action: req.body.action,
      complaintId: req.body.complaintId || null,
      targetComplaintId: req.body.targetComplaintId || null,
      actorId: req.user?.id || null,
      actorRole: req.user?.role || null,
      suggestedValue: req.body.suggestedValue || null,
      finalValue: req.body.finalValue || null,
      metadata: req.body.metadata || {},
    });

    return res.status(201).json({
      data: saved || { recorded: false },
    });
  } catch (error) {
    next(error);
  }
}

async function getIntelligenceMetrics(req, res, next) {
  try {
    const metrics = await aiFeedbackRepository.getLayer1Metrics();
    return res.status(200).json({
      data: metrics,
    });
  } catch (error) {
    next(error);
  }
}

async function semanticSearch(req, res, next) {
  try {
    const result = await semanticSearchComplaints({
      query: req.body.query,
      city: req.body.city,
      category: req.body.category,
      status: req.body.status,
      limit: req.body.limit,
    });
    return res.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function getSimilarAndHotspots(req, res, next) {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 8;
    const result = await findRelatedComplaintsForComplaint(req.params.id, {
      limit,
    });
    return res.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  classifyDraft,
  classifyOnly,
  enrichComplaintById,
  getBackgroundJobs,
  retryBackgroundJobs,
  submitAiFeedback,
  getIntelligenceMetrics,
  semanticSearch,
  getSimilarAndHotspots,
};
