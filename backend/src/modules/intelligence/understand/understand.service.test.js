const jwt = require("jsonwebtoken");

jest.mock("../../../config/database", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const request = require("supertest");
const app = require("../../../app");
const pool = require("../../../config/database");
const config = require("../../../config/env");
const aiConfig = require("../../../config/ai");

const {
  classifyComplaint,
  normalizeCategory,
  getDepartmentForCategory,
} = require("./classification.service");
const {
  summarizeComplaint,
  summarizeComplaintGroup,
} = require("./summarization.service");
const { understandComplaint } = require("./understand.service");

const backgroundJobRepository = require("../../../repositories/background-job.repository");
const aiFeedbackRepository = require("../../../repositories/ai-feedback.repository");
const evidenceRepository = require("../../../repositories/complaint-evidence.repository");
const complaintRepository = require("../../complaints/complaint.repository");
const complaintEmbeddingRepository = require("../../../repositories/complaint-embedding.repository");
const hotspotRepository = require("../../../repositories/hotspot.repository");
const embeddingJob = require("../../../jobs/embedding.job");
const enrichmentJob = require("../../../jobs/complaint-enrichment.job");
const retryJob = require("../../../jobs/retry.job");
const { normalizeText } = require("./text-normalization.service");
const LocalSemanticEmbeddingProvider = require("./local.embedding");
const { evaluateDuplicate } = require("./duplicate.policy");

function makeToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    config.jwtSecret || "test-secret",
    { expiresIn: "1h" },
  );
}

describe("Phase 2 Intelligence: Auto-Classification & Summarization", () => {
  const citizenToken = makeToken({
    id: "22222222-2222-4222-8222-222222222222",
    role: "CITIZEN",
  });
  const officerToken = makeToken({
    id: "11111111-1111-4111-8111-111111111111",
    role: "OFFICER",
  });

  beforeAll(() => {
    if (!config.jwtSecret) {
      config.jwtSecret = "test-secret";
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    retryJob.stopJobRunner();
  });

  test("normalizes legacy/citizen categories and resolves department names", () => {
    expect(normalizeCategory("roads")).toBe("ROAD");
    expect(normalizeCategory("street_light")).toBe("ELECTRICITY");
    expect(normalizeCategory("garbage")).toBe("SANITATION");
    expect(getDepartmentForCategory("WATER_SUPPLY")).toBe(
      "Water Supply & Drainage",
    );
  });

  test("classifies municipal complaints accurately using rule-based analyzer offline", async () => {
    const roadResult = await classifyComplaint(
      {
        title: "Deep pothole near main bus stop",
        description:
          "Huge asphalt crater on the road causing hazardous waterlogging and traffic slowdown for 4 days.",
        address: "4th Cross Rd",
      },
      { preferGemini: false },
    );

    expect(roadResult.category).toBe("ROAD");
    expect(roadResult.citizenCategory).toBe("roads");
    expect(roadResult.department).toBe("Roads & Public Works");
    expect(["HIGH", "CRITICAL"]).toContain(roadResult.priority);
    expect(roadResult.confidence).toBeGreaterThanOrEqual(0.65);
    expect(roadResult.tags).toContain("pothole");
    expect(roadResult.provenance.source).toBe("rule-based");

    const safetyResult = await classifyComplaint(
      {
        title: "Exposed live wire near school gate",
        description:
          "Sparking live wire fallen on the footpath near primary school, urgent electrocution hazard.",
      },
      { preferGemini: false },
    );

    expect(safetyResult.category).toBe("PUBLIC_SAFETY");
    expect(safetyResult.priority).toBe("CRITICAL");
  });

  test("generates concise factual AI summaries offline and supports Gemini structured responses", async () => {
    const offlineSummary = await summarizeComplaint(
      {
        title: "Drinking water pipeline leakage",
        description:
          "Clean drinking water pipeline has been continuously leaking outside Block B for 3 days. Sidewalk is flooded and slippery.",
        category: "WATER_SUPPLY",
        priority: "HIGH",
        address: "Block B, Lakeview Colony",
        evidenceCount: 2,
      },
      { preferGemini: false },
    );

    expect(offlineSummary.summary).toContain("Drinking water pipeline leakage");
    expect(offlineSummary.keyPoints.some((p) => p.includes("2 files"))).toBe(
      true,
    );
    expect(offlineSummary.recommendedAction).toContain("leakage");
    expect(offlineSummary.provenance.source).toBe("extractive-fallback");

    // Verify Gemini path when API key & SDK call succeed
    jest.spyOn(aiConfig, "hasGeminiApiKey").mockReturnValue(true);
    jest
      .spyOn(aiConfig, "generateStructuredJson")
      .mockResolvedValueOnce({
        model: "gemini-3-flash-preview",
        data: {
          category: "SANITATION",
          priority: "HIGH",
          confidence: 0.93,
          tags: ["garbage", "overflow"],
          rationale: "Uncollected waste overflow reported near market entrance.",
        },
      })
      .mockResolvedValueOnce({
        model: "gemini-3-flash-preview",
        data: {
          summary:
            "Overflowing public garbage bin near Market Road requires immediate sanitation clearance.",
          keyPoints: [
            "Overflowing waste bin at Market Road",
            "Assessed as High priority sanitation issue",
          ],
          recommendedAction: "Dispatch sanitation collection truck.",
        },
      });

    const aiAnalysis = await understandComplaint({
      title: "Bins overflowing at market",
      description: "Waste has spilled onto the pedestrian path.",
      address: "Market Road",
      evidenceCount: 1,
    });

    expect(aiAnalysis.category).toBe("SANITATION");
    expect(aiAnalysis.priority).toBe("HIGH");
    expect(aiAnalysis.confidence).toBe(0.93);
    expect(aiAnalysis.summary).toContain("sanitation clearance");
    expect(aiAnalysis.metadata.classificationProvenance.source).toBe("gemini");
    expect(aiAnalysis.metadata.summarizationProvenance.modelName).toBe(
      "gemini-3-flash-preview",
    );
  });

  test("summarizes a cluster of complaints cleanly", () => {
    const group = summarizeComplaintGroup([
      { category: "ROAD" },
      { category: "roads" },
      { category: "WATER_SUPPLY" },
    ]);

    expect(group.count).toBe(3);
    expect(group.categoryCounts).toEqual({ ROAD: 2, WATER_SUPPLY: 1 });
    expect(group.summary).toContain("2 road");
  });

  test("POST /api/v1/intelligence/classify returns structured analysis for draft complaints", async () => {
    const res = await request(app)
      .post("/api/v1/intelligence/classify")
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({
        title: "Five streetlights not working",
        description:
          "Entire stretch of School Road has been dark for a week due to streetlight power outage.",
        address: "School Road",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.category).toBe("ELECTRICITY");
    expect(res.body.data.citizenCategory).toBe("electricity");
    expect(res.body.data.department).toBe("Electricity & Street Lighting");
    expect(res.body.data.summary).toBeTruthy();
  });

  test("processComplaintEnrichment persists classification, summary, and handles embedding skip gracefully", async () => {
    const complaintId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    jest
      .spyOn(pool, "query")
      .mockResolvedValueOnce({
        rows: [
          {
            id: complaintId,
            title: "Overflowing garbage dump near clinic",
            description:
              "Uncollected waste dump causing foul smell outside the community clinic for 4 days.",
            category: "SANITATION",
            department: null,
            priority: null,
            address: "Clinic Lane",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // enrichment_status = PROCESSING
      .mockResolvedValueOnce({
        rows: [
          {
            id: complaintId,
            ai_category: "SANITATION",
            ai_priority: "HIGH",
            ai_summary: "Overflowing garbage dump near clinic...",
            ai_confidence: 0.88,
            ai_tags: ["garbage", "dump"],
            ai_metadata: {},
            priority: "HIGH",
            department: "Sanitation & Solid Waste",
            enrichment_status: "COMPLETED",
            enriched_at: new Date(),
          },
        ],
      });

    jest
      .spyOn(evidenceRepository, "findEvidenceByComplaintId")
      .mockResolvedValue([]);

    jest.spyOn(embeddingJob, "runEmbeddingJob").mockResolvedValue({
      status: "SKIPPED",
      reason: "GEMINI_API_KEY not configured",
    });

    const result = await enrichmentJob.processComplaintEnrichment(complaintId);

    expect(result.complaint.enrichment_status).toBe("COMPLETED");
    expect(result.intelligence.category).toBe("SANITATION");
    expect(result.complaint.department).toBe("Sanitation & Solid Waste");
    expect(result.embedding.status).toBe("SKIPPED");
  });

  test("retry.job schedules exponential backoff retry on job failure and officer endpoints expose queue", async () => {
    const jobRecord = {
      id: "job-1",
      job_type: enrichmentJob.JOB_TYPES.EMBEDDING_GENERATION,
      complaint_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "PROCESSING",
      attempts: 1,
      max_attempts: 3,
    };

    jest
      .spyOn(embeddingJob, "runEmbeddingJob")
      .mockRejectedValue(new Error("Temporary Gemini API 503"));

    const retrySpy = jest
      .spyOn(backgroundJobRepository, "scheduleJobRetry")
      .mockResolvedValue({ ...jobRecord, status: "RETRY_SCHEDULED" });

    const outcome = await retryJob.executeClaimedJob(jobRecord);

    expect(outcome.ok).toBe(false);
    expect(retrySpy).toHaveBeenCalledWith(
      "job-1",
      "Temporary Gemini API 503",
      enrichmentJob.computeBackoffMs(1),
    );

    jest.spyOn(backgroundJobRepository, "getJobStats").mockResolvedValue({
      total: 4,
      pending: 0,
      processing: 0,
      retry_scheduled: 1,
      completed: 3,
      failed: 0,
    });
    jest.spyOn(backgroundJobRepository, "listJobs").mockResolvedValue([]);

    const jobsRes = await request(app)
      .get("/api/v1/intelligence/jobs")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(jobsRes.status).toBe(200);
    expect(jobsRes.body.data.stats.completed).toBe(3);
  });

  test("text normalization handles Hinglish/civic synonyms and LocalSemanticEmbeddingProvider separates topics", async () => {
    const normalized = normalizeText(
      "Big gaddha on main sadak with paani logging near bus shelter",
    );

    expect(normalized.hinglishDetected).toBe(true);
    expect(normalized.languageHint).toBe("en-hi-mixed");
    expect(normalized.expandedTokens).toEqual(
      expect.arrayContaining(["pothole", "road", "water", "bus", "stop"]),
    );
    expect(normalized.canonicalConcepts).toEqual(
      expect.arrayContaining(["CONCEPT_ROAD_POTHOLE", "CONCEPT_TRANSIT_JUNCTION"]),
    );

    const provider = new LocalSemanticEmbeddingProvider();
    const vecOrig = await provider.generateEmbedding(
      "Large pothole hazard near bus stop on 4th Cross Rd",
    );
    const vecParaphrase = await provider.generateEmbedding(
      "Deep crater on roadway next to 4th Cross bus shelter",
    );
    const vecGarbage = await provider.generateEmbedding(
      "Uncollected garbage bin overflowing with foul odor in park",
    );

    const simParaphrase = LocalSemanticEmbeddingProvider.cosineSimilarity(
      vecOrig,
      vecParaphrase,
    );
    const simGarbage = LocalSemanticEmbeddingProvider.cosineSimilarity(
      vecOrig,
      vecGarbage,
    );

    expect(vecOrig).toHaveLength(LocalSemanticEmbeddingProvider.DIMENSIONS);
    expect(simParaphrase).toBeGreaterThanOrEqual(0.68);
    expect(simParaphrase).toBeGreaterThan(simGarbage + 0.35);
  });

  test("evaluateDuplicate combines semantic, spatial, category, and temporal signals", () => {
    const nearbyMatch = evaluateDuplicate({
      similarity: 0.74,
      distanceMeters: 25,
      daysApart: 3,
      categoryMatch: true,
      timeWindowDays: 90,
    });
    expect(nearbyMatch.isDuplicate).toBe(true);
    expect(nearbyMatch.combinedScore).toBeGreaterThanOrEqual(0.85);

    const distantNonDuplicate = evaluateDuplicate({
      similarity: 0.92,
      distanceMeters: 450,
      daysApart: 1,
      categoryMatch: true,
      timeWindowDays: 90,
    });
    expect(distantNonDuplicate.isDuplicate).toBe(false);
    expect(distantNonDuplicate.spatialMatch).toBe(false);

    const expiredNonDuplicate = evaluateDuplicate({
      similarity: 0.92,
      distanceMeters: 15,
      daysApart: 120,
      categoryMatch: true,
      timeWindowDays: 90,
    });
    expect(expiredNonDuplicate.isDuplicate).toBe(false);
    expect(expiredNonDuplicate.temporalMatch).toBe(false);
  });

  test("POST /intelligence/feedback & GET /intelligence/metrics record and return Layer 1 telemetry", async () => {
    jest.spyOn(aiFeedbackRepository, "recordFeedback").mockResolvedValue({
      id: "fb-1",
      event_type: "DUPLICATE_SUGGESTION",
      action: "ACCEPTED",
    });

    const fbRes = await request(app)
      .post("/api/v1/intelligence/feedback")
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({
        eventType: "DUPLICATE_SUGGESTION",
        action: "ACCEPTED",
        targetComplaintId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        suggestedValue: "CP-2026-000001",
      });

    expect(fbRes.status).toBe(201);
    expect(fbRes.body.data.action).toBe("ACCEPTED");

    jest.spyOn(aiFeedbackRepository, "getLayer1Metrics").mockResolvedValue({
      classification: {
        totalComplaints: 9,
        enrichedComplaints: 9,
        enrichmentRatePercent: 100,
        categoryAgreementPercent: 88.9,
        avgConfidence: 0.87,
        avgInferenceLatencyMs: 6.4,
      },
      embeddings: {
        totalComplaints: 9,
        indexedComplaints: 9,
        coveragePercent: 100,
        backend: "postgresql-semantic-array",
      },
      jobs: { total: 5, completed: 5, failed: 0, pending: 0, processing: 0, retry_scheduled: 0 },
      feedback: {
        totalEvents: 1,
        accepted: 1,
        modified: 0,
        rejected: 0,
        acceptanceRatePercent: 100,
        duplicateSuggestions: { total: 1, accepted: 1, rejected: 0 },
      },
    });

    const metricsRes = await request(app)
      .get("/api/v1/intelligence/metrics")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(metricsRes.status).toBe(200);
    expect(metricsRes.body.data.embeddings.coveragePercent).toBe(100);
    expect(metricsRes.body.data.feedback.acceptanceRatePercent).toBe(100);
  });

  test("POST /intelligence/search & GET /intelligence/complaints/:id/similar return semantic results + hotspots for officers", async () => {
    const provider = new LocalSemanticEmbeddingProvider();
    const potholeVec = await provider.generateEmbedding(
      "Large pothole hazard near bus stop in Thiruvananthapuram",
    );

    jest
      .spyOn(complaintEmbeddingRepository, "supportsAnyEmbeddingsTable")
      .mockResolvedValue(true);
    jest
      .spyOn(embeddingJob, "backfillMissingEmbeddings")
      .mockResolvedValue({ processed: 0, failures: [], skipped: false });
    jest
      .spyOn(embeddingJob, "generateComplaintVector")
      .mockResolvedValue({
        embedding: potholeVec,
        modelName: "local-semantic-hybrid-v1",
        modelVersion: "1.0",
        source: "local-semantic",
      });
    jest
      .spyOn(complaintEmbeddingRepository, "findSimilarComplaints")
      .mockResolvedValue([
        {
          complaint_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          reference_id: "CP-2026-000011",
          title: "Damaged culvert & pothole at NH-66 Kalambalam Junction",
          description: "Deep pothole near bus junction causes waterlogging.",
          category: "ROAD",
          department: "Roads & Public Works",
          status: "SUBMITTED",
          priority: "HIGH",
          address: "Kalambalam Junction, Trivandrum, Kerala",
          city: "Thiruvananthapuram",
          ward: "Kalambalam Ward",
          zone: "Thiruvananthapuram Rural Zone",
          latitude: 8.76305,
          longitude: 76.79162,
          ai_summary: "NH-66 pothole hazard.",
          ai_confidence: 0.9,
          ai_tags: ["pothole", "road"],
          concepts: ["CONCEPT_ROAD_POTHOLE", "CONCEPT_TRANSIT_JUNCTION"],
          upvote_count: 2,
          similarity: 0.81,
          created_at: new Date(),
        },
      ]);
    jest.spyOn(complaintRepository, "findAllComplaints").mockResolvedValue([]);

    const citizenDenied = await request(app)
      .post("/api/v1/intelligence/search")
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({ query: "gaddha on sadak" });
    expect(citizenDenied.status).toBe(403);

    const searchRes = await request(app)
      .post("/api/v1/intelligence/search")
      .set("Authorization", `Bearer ${officerToken}`)
      .send({ query: "gaddha near bus stop", city: "Thiruvananthapuram" });

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data.detectedConcepts).toContain("CONCEPT_ROAD_POTHOLE");
    expect(searchRes.body.data.results).toHaveLength(1);
    expect(searchRes.body.data.results[0].city).toBe("Thiruvananthapuram");
    expect(searchRes.body.data.results[0].similarity).toBeGreaterThanOrEqual(0.8);

    const targetId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    jest.spyOn(complaintRepository, "findComplaintById").mockResolvedValue({
      id: targetId,
      reference_id: "CP-2026-000006",
      title: "Large pothole near Kalambalam",
      description: "Road crater causing waterlogging",
      category: "ROAD",
      city: "Thiruvananthapuram",
      ward: "Kalambalam Ward",
      zone: "Thiruvananthapuram Rural Zone",
      address: "Kalambalam, Trivandrum",
      latitude: 8.76284,
      longitude: 76.79146,
      created_at: new Date(),
    });
    jest.spyOn(hotspotRepository, "findHotspotsByComplaintId").mockResolvedValue([
      {
        id: "hs-kerala-1",
        hotspot_key: "kalambalam-ward:8.7625:76.7925",
        title: "Kalambalam Ward: Road + Water Supply Overlap",
        city: "Thiruvananthapuram",
        ward: "Kalambalam Ward",
        zone: "Thiruvananthapuram Rural Zone",
        center_latitude: 8.7628,
        center_longitude: 76.7915,
        radius_meters: 95,
        dominant_category: "ROAD",
        issue_categories: ["ROAD", "WATER_SUPPLY"],
        category_counts: { ROAD: 2, WATER_SUPPLY: 1 },
        complaint_count: 3,
        open_count: 3,
        density_per_sq_km: 105.8,
        recurrence_score: 0.65,
        confidence: 0.87,
        severity: "HIGH",
        has_cross_category_overlap: true,
        overlap_categories: ["ROAD", "WATER_SUPPLY"],
        overlap_summary: "Water Supply leakage and Road damage reports co-occur.",
        status: "ACTIVE",
        distance_from_center_meters: 14,
      },
    ]);

    const similarRes = await request(app)
      .get(`/api/v1/intelligence/complaints/${targetId}/similar`)
      .set("Authorization", `Bearer ${officerToken}`);

    expect(similarRes.status).toBe(200);
    expect(similarRes.body.data.city).toBe("Thiruvananthapuram");
    expect(similarRes.body.data.hotspots).toHaveLength(1);
    expect(similarRes.body.data.hotspots[0].hasCrossCategoryOverlap).toBe(true);
    expect(similarRes.body.data.similarComplaints).toHaveLength(1);
    expect(similarRes.body.data.similarComplaints[0].referenceId).toBe("CP-2026-000011");
  });
});
