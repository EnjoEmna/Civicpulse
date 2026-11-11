const pool = require("../config/database");
const understandService = require("../modules/intelligence/understand/understand.service");
const backgroundJobRepository = require("../repositories/background-job.repository");
const evidenceRepository = require("../repositories/complaint-evidence.repository");
const embeddingJob = require("./embedding.job");
const hotspotService = require("../modules/intelligence/spatial/hotspot.service");

const JOB_TYPES = {
  COMPLAINT_ENRICHMENT: "COMPLAINT_ENRICHMENT",
  EMBEDDING_GENERATION: "EMBEDDING_GENERATION",
};

function computeBackoffMs(attempts) {
  const baseMs = Number(process.env.JOB_RETRY_BASE_MS) || 30000;
  return baseMs * Math.pow(2, Math.max(0, attempts - 1));
}

async function processComplaintEnrichment(complaintId) {
  const complaintRes = await pool.query(
    `SELECT
       id,
       title,
       description,
       category,
       department,
       priority,
       address
     FROM complaints
     WHERE id = $1`,
    [complaintId],
  );

  const complaint = complaintRes.rows[0];
  if (!complaint) {
    const err = new Error(`Complaint ${complaintId} not found`);
    err.statusCode = 404;
    err.code = "COMPLAINT_NOT_FOUND";
    throw err;
  }

  await pool.query(
    `UPDATE complaints
     SET enrichment_status = 'PROCESSING',
         updated_at = NOW()
     WHERE id = $1`,
    [complaintId],
  );

  try {
    const evidence = await evidenceRepository.findEvidenceByComplaintId(complaintId);

    const intelligence = await understandService.understandComplaint({
      title: complaint.title,
      description: complaint.description,
      address: complaint.address,
      existingCategory: complaint.category,
      evidenceCount: evidence.length,
    });

    const updateRes = await pool.query(
      `UPDATE complaints
       SET ai_category = $2,
           ai_priority = $3,
           ai_summary = $4,
           ai_confidence = $5,
           ai_tags = $6::jsonb,
           ai_metadata = $7::jsonb,
           priority = COALESCE(priority, $3),
           department = COALESCE(department, $8),
           enrichment_status = 'COMPLETED',
           enriched_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING
         id,
         ai_category,
         ai_priority,
         ai_summary,
         ai_confidence,
         ai_tags,
         ai_metadata,
         priority,
         department,
         enrichment_status,
         enriched_at`,
      [
        complaintId,
        intelligence.category,
        intelligence.priority,
        intelligence.summary,
        intelligence.confidence,
        JSON.stringify(intelligence.tags || []),
        JSON.stringify(intelligence.metadata || {}),
        intelligence.department,
      ],
    );

    let embeddingResult;
    try {
      const embedText = [complaint.title, complaint.description]
        .filter(Boolean)
        .join("\n");
      embeddingResult = await embeddingJob.runEmbeddingJob(complaintId, embedText);
    } catch (embedErr) {
      embeddingResult = {
        status: "FAILED",
        error: embedErr.message,
      };
    }

    return {
      complaint: updateRes.rows[0],
      intelligence,
      embedding: embeddingResult,
    };
  } catch (err) {
    await pool
      .query(
        `UPDATE complaints
         SET enrichment_status = 'FAILED',
             updated_at = NOW()
         WHERE id = $1`,
        [complaintId],
      )
      .catch(() => {});
    throw err;
  }
}

async function runEnrichmentJobRecord(job) {
  try {
    const outcome = await processComplaintEnrichment(job.complaint_id);
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
    return { ok: true, outcome };
  } catch (err) {
    await backgroundJobRepository.scheduleJobRetry(
      job.id,
      err.message,
      computeBackoffMs(job.attempts || 1),
    );
    return { ok: false, error: err };
  }
}

async function enqueueComplaintEnrichment(
  complaintId,
  { runImmediately = true, defer = false } = {},
) {
  const job = await backgroundJobRepository.enqueueJob({
    jobType: JOB_TYPES.COMPLAINT_ENRICHMENT,
    complaintId,
    payload: { complaintId },
  });

  if (runImmediately && !defer) {
    setImmediate(async () => {
      try {
        const claimed = await backgroundJobRepository.claimJobForProcessing(job.id);
        if (claimed) {
          await runEnrichmentJobRecord(claimed);
          await hotspotService
            .detectAndPersistHotspots({
              cityWide: true,
              clusterDistanceMeters: 150,
              minClusterSize: 2,
            })
            .catch(() => {});
        }
      } catch (err) {
        console.error(
          `Background enrichment failed for complaint ${complaintId}:`,
          err.message,
        );
      }
    });
  }

  return job;
}

module.exports = {
  JOB_TYPES,
  computeBackoffMs,
  processComplaintEnrichment,
  runEnrichmentJobRecord,
  enqueueComplaintEnrichment,
};
