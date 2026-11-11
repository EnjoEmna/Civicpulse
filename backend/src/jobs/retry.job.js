const pool = require("../config/database");
const backgroundJobRepository = require("../repositories/background-job.repository");
const complaintEnrichmentJob = require("./complaint-enrichment.job");
const embeddingJob = require("./embedding.job");
const hotspotService = require("../modules/intelligence/spatial/hotspot.service");

let runnerTimer = null;
let isProcessingBatch = false;

async function executeClaimedJob(job) {
  if (job.job_type === complaintEnrichmentJob.JOB_TYPES.COMPLAINT_ENRICHMENT) {
    return complaintEnrichmentJob.runEnrichmentJobRecord(job);
  }

  if (job.job_type === complaintEnrichmentJob.JOB_TYPES.EMBEDDING_GENERATION) {
    try {
      const outcome = await embeddingJob.runEmbeddingJob(job.complaint_id);
      await backgroundJobRepository.markJobCompleted(job.id, outcome);
      return { ok: true, outcome };
    } catch (err) {
      await backgroundJobRepository.scheduleJobRetry(
        job.id,
        err.message,
        complaintEnrichmentJob.computeBackoffMs(job.attempts || 1),
      );
      return { ok: false, error: err };
    }
  }

  await backgroundJobRepository.markJobFailed(
    job.id,
    `Unsupported job type "${job.job_type}"`,
  );
  return { ok: false, error: new Error(`Unsupported job type "${job.job_type}"`) };
}

async function processDueJobs(limit = 10) {
  if (isProcessingBatch) {
    return { processed: 0, succeeded: 0, failed: 0, busy: true };
  }

  isProcessingBatch = true;
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    const jobs = await backgroundJobRepository.claimDueJobs(limit);
    for (const job of jobs) {
      processed += 1;
      const result = await executeClaimedJob(job);
      if (result.ok) {
        succeeded += 1;
      } else {
        failed += 1;
      }
    }

    return { processed, succeeded, failed, busy: false };
  } finally {
    isProcessingBatch = false;
  }
}

async function backfillUnenrichedComplaints(limit = 25) {
  const res = await pool.query(
    `SELECT id
     FROM complaints
     WHERE enrichment_status IN ('PENDING', 'FAILED')
        OR ai_summary IS NULL
        OR ai_category IS NULL
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit],
  );

  let enqueued = 0;
  for (const row of res.rows) {
    await backgroundJobRepository.enqueueJob({
      jobType: complaintEnrichmentJob.JOB_TYPES.COMPLAINT_ENRICHMENT,
      complaintId: row.id,
      payload: { complaintId: row.id, backfill: true },
    });
    enqueued += 1;
  }

  const runSummary = enqueued > 0 ? await processDueJobs(limit) : { processed: 0, succeeded: 0, failed: 0 };

  const embeddingBackfill = await embeddingJob
    .backfillMissingEmbeddings(limit)
    .catch((err) => ({ processed: 0, error: err.message }));

  return {
    enqueued,
    embeddingsBackfilled: embeddingBackfill.processed || 0,
    ...runSummary,
  };
}

function startJobRunner({ intervalMs = 60000, runBackfillOnStart = true } = {}) {
  if (runnerTimer) {
    return runnerTimer;
  }

  if (runBackfillOnStart) {
    setImmediate(() => {
      backfillUnenrichedComplaints(50)
        .then(async (res) => {
          if (res.enqueued > 0 || res.processed > 0 || res.embeddingsBackfilled > 0) {
            console.log(
              `Background enrichment startup sweep: enqueued=${res.enqueued}, processed=${res.processed}, embeddings=${res.embeddingsBackfilled}`,
            );
          }
          await hotspotService
            .detectAndPersistHotspots({
              cityWide: true,
              clusterDistanceMeters: 150,
              minClusterSize: 2,
            })
            .catch(() => {});
        })
        .catch((err) => {
          console.warn("Background enrichment startup sweep skipped:", err.message);
        });
    });
  }

  runnerTimer = setInterval(() => {
    processDueJobs(10).catch((err) => {
      console.warn("Background job retry tick failed:", err.message);
    });
  }, intervalMs);

  if (typeof runnerTimer.unref === "function") {
    runnerTimer.unref();
  }

  return runnerTimer;
}

function stopJobRunner() {
  if (runnerTimer) {
    clearInterval(runnerTimer);
    runnerTimer = null;
  }
}

module.exports = {
  executeClaimedJob,
  processDueJobs,
  backfillUnenrichedComplaints,
  startJobRunner,
  stopJobRunner,
};
