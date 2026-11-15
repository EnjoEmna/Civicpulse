const jwt = require("jsonwebtoken");

jest.mock("../../../config/database", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const request = require("supertest");
const pool = require("../../../config/database");
const app = require("../../../app");
const config = require("../../../config/env");

const agentRepository = require("../../../repositories/agent.repository");
const aiFeedbackRepository = require("../../../repositories/ai-feedback.repository");
const complaintRepository = require("../../complaints/complaint.repository");
const semanticSearchService = require("../understand/semantic-search.service");
const hotspotService = require("../spatial/hotspot.service");
const spatialService = require("../spatial/spatial.service");
const infrastructureService = require("../infrastructure/infrastructure.service");
const infrastructureRepository = require("../../../repositories/infrastructure.repository");
const graphService = require("../graph/graph.service");

const { executeAgentTool } = require("./agent-tools");
const {
  createGroundingTrace,
  enforceNonCausalFraming,
  validateTextAgainstGroundTruth,
} = require("./grounding.validator");
const agentOrchestrator = require("./agent-orchestrator.service");

function makeToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    config.jwtSecret || "test-secret",
    { expiresIn: "1h" },
  );
}

describe("Layer 5 Intelligence: Multi-Agent AI Orchestration & Guardrails", () => {
  const citizenToken = makeToken({
    id: "22222222-2222-4222-8222-222222222222",
    role: "CITIZEN",
  });
  const officerToken = makeToken({
    id: "11111111-1111-4111-8111-111111111111",
    role: "OFFICER",
  });

  const roadAssetUuid = "a1111111-1111-4111-8111-111111111111";
  const waterAssetUuid = "a2222222-2222-4222-8222-222222222222";
  const complaintUuid1 = "c1111111-1111-4111-8111-111111111111";
  const hotspotUuid1 = "d1111111-1111-4111-8111-111111111111";
  const parentRunUuid = "91111111-1111-4111-8111-111111111111";
  const recUuid1 = "e1111111-1111-4111-8111-111111111111";

  beforeAll(() => {
    if (!config.jwtSecret) {
      config.jwtSecret = "test-secret";
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    pool.query.mockReset();
    pool.connect.mockReset();
  });

  function setupDomainSpies() {
    pool.connect.mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    });

    const roadAsset = {
      id: roadAssetUuid,
      assetCode: "RD-HYD-1024",
      name: "Road R-1024 · 4th Cross Bus Shelter Corridor",
      assetType: "ROAD_SEGMENT",
      city: "Hyderabad",
      ward: "Ward 12 - Banjara Hills",
      department: "Roads & Public Works",
      latitude: 17.4157,
      longitude: 78.4358,
      catchmentRadiusMeters: 300,
      healthScore: 37,
      healthGrade: "CRITICAL",
      trend: "DETERIORATING",
      complaintCount: 4,
      openComplaintCount: 4,
      recurrenceCount: 3,
      maintenanceAgeMonths: 8.2,
      scoreBreakdown: {
        complaintImpactPenalty: 21.6,
        recurrencePenalty: 21.4,
        severityPenalty: 20,
        unresolvedDurationPenalty: 0.4,
        maintenanceAgePenalty: 10.3,
        factors: { inActiveHotspot: true, crossImpactCount: 1 },
      },
    };

    const waterAsset = {
      id: waterAssetUuid,
      assetCode: "WP-HYD-204",
      name: "Pipeline P-204 · 4th Cross Distribution Main",
      assetType: "WATER_PIPELINE",
      city: "Hyderabad",
      ward: "Ward 12 - Banjara Hills",
      department: "Water Supply & Drainage",
      latitude: 17.4161,
      longitude: 78.4362,
      catchmentRadiusMeters: 220,
      healthScore: 54,
      healthGrade: "POOR",
      trend: "DETERIORATING",
      complaintCount: 2,
      openComplaintCount: 2,
      recurrenceCount: 2,
      maintenanceAgeMonths: 9.3,
      scoreBreakdown: {
        complaintImpactPenalty: 14,
        recurrencePenalty: 10,
        severityPenalty: 12,
        unresolvedDurationPenalty: 1,
        maintenanceAgePenalty: 9,
      },
    };

    jest.spyOn(infrastructureService, "getInfrastructureOverview").mockResolvedValue({
      summary: { totalAssets: 2, avgHealthScore: 46, gradeCounts: { CRITICAL: 1, POOR: 1 } },
      assets: [roadAsset, waterAsset],
      wards: [
        {
          city: "Hyderabad",
          ward: "Ward 12 - Banjara Hills",
          healthScore: 41,
          healthGrade: "POOR",
          openComplaints: 4,
          worstAsset: { assetCode: "RD-HYD-1024", healthScore: 37 },
        },
      ],
    });

    jest.spyOn(infrastructureRepository, "findAssetByCode").mockImplementation(async (code) => {
      if (String(code).toUpperCase() === "RD-HYD-1024") return { id: roadAssetUuid, asset_code: "RD-HYD-1024" };
      if (String(code).toUpperCase() === "WP-HYD-204") return { id: waterAssetUuid, asset_code: "WP-HYD-204" };
      return null;
    });

    jest.spyOn(infrastructureRepository, "findAssetById").mockImplementation(async (id) => {
      if (id === roadAssetUuid) return { id: roadAssetUuid, asset_code: "RD-HYD-1024" };
      if (id === waterAssetUuid) return { id: waterAssetUuid, asset_code: "WP-HYD-204" };
      return null;
    });

    jest.spyOn(infrastructureService, "getAssetDetails").mockImplementation(async (id) => {
      if (id === waterAssetUuid) {
        return {
          asset: waterAsset,
          linkedComplaints: [],
          maintenanceEvents: [],
          healthHistory: [],
        };
      }
      return {
        asset: roadAsset,
        linkedComplaints: [
          {
            id: complaintUuid1,
            referenceId: "CP-2026-000001",
            title: "Large pothole hazard near bus stop",
            category: "ROAD",
            priority: "HIGH",
            status: "IN_PROGRESS",
            linkType: "DIRECT",
          },
        ],
        maintenanceEvents: [
          { id: "m1", eventType: "RESURFACING", outcome: "COMPLETED", performedAt: "2026-03-01T00:00:00Z" },
        ],
        healthHistory: [{ healthScore: 72 }, { healthScore: 54 }, { healthScore: 37 }],
      };
    });

    jest.spyOn(hotspotService, "listSavedHotspots").mockResolvedValue({
      total: 1,
      activeCount: 1,
      crossCategoryOverlapCount: 1,
      hotspots: [
        {
          id: hotspotUuid1,
          hotspotKey: "ward-12:17.4150:78.4350",
          title: "4th Cross Banjara Hills Overlap Cluster",
          city: "Hyderabad",
          ward: "Ward 12 - Banjara Hills",
          severity: "CRITICAL",
          status: "ACTIVE",
          complaintCount: 4,
          openCount: 4,
          densityPerSqKm: 18.5,
          hasCrossCategoryOverlap: true,
          overlapCategories: ["ROAD", "WATER_SUPPLY"],
          overlapSummary: "Water seepage reports co-occur near road craters",
        },
      ],
    });

    jest.spyOn(hotspotService, "getWardAnalytics").mockResolvedValue({
      wards: [
        {
          city: "Hyderabad",
          ward: "Ward 12 - Banjara Hills",
          totalComplaints: 5,
          openComplaints: 4,
          densityPerSqKm: 18.5,
        },
      ],
    });

    jest.spyOn(spatialService, "analyzeNearbyComplaints").mockResolvedValue({
      radiusMeters: 350,
      returnedCount: 4,
      openCount: 4,
      categoryCounts: { ROAD: 3, WATER_SUPPLY: 1 },
      hasCrossCategoryOverlap: true,
      overlapAlert: "Road damage and Water Supply reports co-occur in this search zone",
    });

    jest.spyOn(complaintRepository, "findAllComplaints").mockResolvedValue([
      {
        id: complaintUuid1,
        reference_id: "CP-2026-000001",
        title: "Large pothole hazard near bus stop",
        category: "ROAD",
        ai_category: "ROAD",
        priority: "HIGH",
        ai_priority: "HIGH",
        status: "IN_PROGRESS",
        city: "Hyderabad",
        ward: "Ward 12 - Banjara Hills",
        department: "Roads & Public Works",
        ai_summary: "Hazardous pothole at 4th Cross Rd bus shelter.",
        created_at: "2026-11-10T08:00:00Z",
      },
    ]);

    jest.spyOn(semanticSearchService, "semanticSearchComplaints").mockResolvedValue({
      embeddingSource: "local-hashed-384d",
      results: [
        {
          id: complaintUuid1,
          referenceId: "CP-2026-000001",
          title: "Large pothole hazard near bus stop",
          canonicalCategory: "ROAD",
          priority: "HIGH",
          status: "IN_PROGRESS",
          ward: "Ward 12 - Banjara Hills",
        },
      ],
    });

    jest.spyOn(graphService, "investigateAsset").mockResolvedValue({
      centerNode: {
        id: "n-road",
        nodeKey: "asset:RD-HYD-1024",
        label: "RD-HYD-1024 · 4th Cross Corridor",
      },
      nodes: [{ id: "n-road" }, { id: "n-water" }, { id: "n-comp" }],
      edges: [{ id: "e1" }, { id: "e2" }],
      potentialContributingAssets: [
        {
          nodeKey: "asset:WP-HYD-204",
          assetCode: "WP-HYD-204",
          name: "Pipeline P-204 · 4th Cross Distribution Main",
          assetType: "WATER_PIPELINE",
          healthScore: 54,
          healthGrade: "POOR",
          relationshipLabel: "Potential Relationship (Non-Causal)",
          distanceMeters: 62,
          confidence: 0.88,
          upstreamOpenComplaints: 2,
          evidence: "WP-HYD-204 lies 62m from RD-HYD-1024.",
          disclaimer:
            "Potential relationship inferred from spatial proximity; verify subsurface leakage before civil repair.",
        },
      ],
      evidenceChains: [
        {
          id: "chain-1",
          chainType: "POTENTIAL_CROSS_INFRASTRUCTURE",
          title: "Potential Cross-System Chain via WP-HYD-204",
          isInferred: true,
          confidence: 0.88,
          summary: "WP-HYD-204 lies 62m from RD-HYD-1024.",
          disclaimer: "NOT confirmed causation.",
          steps: [
            { nodeKey: "asset:WP-HYD-204", entityType: "INFRASTRUCTURE_ASSET", label: "WP-HYD-204", edgeLabelAfter: "POTENTIALLY_IMPACTS", isInferred: true },
            { nodeKey: "asset:RD-HYD-1024", entityType: "INFRASTRUCTURE_ASSET", label: "RD-HYD-1024", edgeLabelAfter: null, isInferred: false },
          ],
        },
      ],
      investigationSummary: "RD-HYD-1024 scores 37/100 and is potentially impacted by WP-HYD-204 at 62m.",
    });

    jest.spyOn(graphService, "findShortestPath").mockResolvedValue({
      found: true,
      hopCount: 1,
      containsInferredEdge: true,
      narrativeSteps: ["WP-HYD-204 —[POTENTIALLY_IMPACTS · Potential]→ RD-HYD-1024"],
    });

    const stepCounter = { idx: 0 };
    jest.spyOn(agentRepository, "createAgentRun").mockImplementation(async (payload) => {
      stepCounter.idx += 1;
      const isParent = payload.runType === "ORCHESTRATION";
      return {
        id: isParent ? parentRunUuid : `b0000000-0000-4000-8000-00000000000${stepCounter.idx}`,
        parent_run_id: payload.parentRunId,
        step_order: payload.stepOrder,
        run_type: payload.runType,
        agent_name: payload.agentName,
        query_text: payload.queryText,
        target_type: payload.targetType,
        target_id: payload.targetId,
        city: payload.city,
        status: payload.status,
        inputs: payload.inputs,
        tools_used: payload.toolsUsed,
        tool_calls_count: payload.toolCallsCount,
        valid_tool_calls_count: payload.validToolCallsCount,
        outputs: payload.outputs,
        grounding_report: payload.groundingReport,
        unsupported_claim_count: payload.unsupportedClaimCount,
        model_name: payload.modelName,
        model_version: payload.modelVersion,
        duration_ms: payload.durationMs,
        initiated_by: payload.initiatedBy,
        created_at: new Date("2026-11-12T10:00:00Z").toISOString(),
      };
    });

    jest.spyOn(agentRepository, "createRecommendations").mockImplementation(async (recs) =>
      recs.map((r, i) => ({
        id: i === 0 ? recUuid1 : `f2222222-2222-4222-8222-22222222222${i + 1}`,
        agent_run_id: r.agentRunId,
        target_type: r.targetType,
        target_id: r.targetId,
        asset_id: r.assetId,
        complaint_id: r.complaintId,
        hotspot_id: r.hotspotId,
        city: r.city,
        ward: r.ward,
        category: r.category,
        priority: r.priority,
        action_title: r.actionTitle,
        proposed_action: r.proposedAction,
        rationale: r.rationale,
        evidence_citations: r.evidenceCitations,
        confidence: r.confidence,
        requires_human_confirmation: r.requiresHumanConfirmation,
        is_non_causal_inferred: r.isNonCausalInferred,
        decision_status: "PENDING",
        decided_by: null,
        modified_action: null,
        decision_note: null,
        decided_at: null,
        created_at: new Date("2026-11-12T10:00:00Z").toISOString(),
        updated_at: new Date("2026-11-12T10:00:00Z").toISOString(),
      })),
    );
  }

  test("grounding validator passes verified facts and catches hallucinated assets/numbers", () => {
    const trace = createGroundingTrace();
    trace.groundTruth.entities.add("RD-HYD-1024");
    trace.groundTruth.entities.add("WP-HYD-204");
    trace.groundTruth.entities.add("CP-2026-000001");
    trace.groundTruth.numbers.add("37");
    trace.groundTruth.numbers.add("62");
    trace.groundTruth.numbers.add("0.88");

    const valid = validateTextAgainstGroundTruth(
      "RD-HYD-1024 scores 37/100 and WP-HYD-204 is 62m away with 88% confidence referencing CP-2026-000001.",
      trace.groundTruth,
    );
    expect(valid.passed).toBe(true);
    expect(valid.unsupportedClaimCount).toBe(0);

    const hallucinated = validateTextAgainstGroundTruth(
      "RD-FAKE-999 scores 88/100 at 420m from CP-2099-999999.",
      trace.groundTruth,
    );
    expect(hallucinated.passed).toBe(false);
    expect(hallucinated.unsupportedClaimCount).toBe(4);
    expect(hallucinated.unsupportedClaims.map((c) => c.type)).toEqual(
      expect.arrayContaining([
        "UNVERIFIED_ASSET_CODE",
        "UNVERIFIED_COMPLAINT_REF",
        "UNVERIFIED_SCORE",
        "UNVERIFIED_DISTANCE",
      ]),
    );
  });

  test("non-causal guardrail strips strong causal wording and appends Potential Relationship label", () => {
    const res = enforceNonCausalFraming(
      "WP-HYD-204 definitely caused by seepage is confirmed root cause of road cracks.",
      { hasInferredLinks: true },
    );
    expect(res.adjusted).toBe(true);
    expect(res.sanitizedText).not.toMatch(/confirmed root cause/i);
    expect(res.sanitizedText).toContain("Potential Relationship (Non-Causal)");
  });

  test("tool registry blocks unauthorized agents and invalid argument schemas", async () => {
    const trace = createGroundingTrace();
    await expect(
      executeAgentTool({
        toolName: "investigate_asset_graph",
        agentName: "PriorityAgent",
        args: { assetIdOrCode: "RD-HYD-1024" },
        trace,
      }),
    ).rejects.toThrow(/not authorized/i);

    await expect(
      executeAgentTool({
        toolName: "fetch_complaints",
        agentName: "ComplaintAgent",
        args: { limit: 9999 },
        trace,
      }),
    ).rejects.toThrow(/Invalid arguments/i);
  });

  test("orchestrates all 7 agents sequentially on RD-HYD-1024 with zero unsupported claims", async () => {
    setupDomainSpies();

    const result = await agentOrchestrator.orchestrateInvestigation({
      question: "Why is Road RD-HYD-1024 repeatedly receiving complaints?",
      initiatedBy: "11111111-1111-4111-8111-111111111111",
    });

    expect(result.run.status).toBe("COMPLETED");
    expect(result.run.targetType).toBe("ASSET");
    expect(result.run.targetId).toBe("RD-HYD-1024");
    expect(result.run.city).toBe("Hyderabad");
    expect(result.run.unsupportedClaimCount).toBe(0);
    expect(result.groundingReport.passed).toBe(true);

    // Exact 7-agent sequence from Plan Section 8
    expect(result.stepRuns.map((s) => s.agentName)).toEqual([
      "PriorityAgent",
      "InvestigationAgent",
      "InfrastructureAgent",
      "SpatialAgent",
      "ComplaintAgent",
      "RecommendationAgent",
      "ReportAgent",
    ]);

    // Guardrails & Non-causal enforcement on WP-HYD-204 -> RD-HYD-1024
    expect(result.report.guardrails.deterministicMathOnly).toBe(true);
    expect(result.report.guardrails.nonCausalInferenceEnforced).toBe(true);
    expect(result.report.upstreamContributingAssets[0].assetCode).toBe("WP-HYD-204");
    expect(result.report.upstreamContributingAssets[0].relationshipLabel).toBe(
      "Potential Relationship (Non-Causal)",
    );

    expect(result.recommendations.length).toBeGreaterThanOrEqual(2);
    expect(result.recommendations[0].isNonCausalInferred).toBe(true);
    expect(result.recommendations.every((r) => r.requiresHumanConfirmation)).toBe(true);
    expect(result.recommendations.every((r) => r.decisionStatus === "PENDING")).toBe(true);
  });

  test("HTTP POST /api/v1/intelligence/agents/investigate executes orchestration & enforces RBAC", async () => {
    setupDomainSpies();

    const forbidden = await request(app)
      .post("/api/v1/intelligence/agents/investigate")
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({ question: "Why is RD-HYD-1024 failing?" });
    expect(forbidden.status).toBe(403);

    const res = await request(app)
      .post("/api/v1/intelligence/agents/investigate")
      .set("Authorization", `Bearer ${officerToken}`)
      .send({ question: "Why is Road RD-HYD-1024 repeatedly receiving complaints?" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stepRuns).toHaveLength(7);
    expect(res.body.data.report.resolvedTarget.targetId).toBe("RD-HYD-1024");
  });

  test("HTTP PATCH /recommendations/:id/decision enforces schema & human-in-the-loop lifecycle", async () => {
    jest.spyOn(agentRepository, "findRecommendationById").mockResolvedValue({
      id: recUuid1,
      agent_run_id: parentRunUuid,
      target_type: "ASSET",
      target_id: "RD-HYD-1024",
      proposed_action: "Dispatch joint team to inspect WP-HYD-204.",
      rationale: "Potential Relationship (Non-Causal)",
      decision_status: "PENDING",
      priority: "CRITICAL",
    });
    jest.spyOn(agentRepository, "updateRecommendationDecision").mockResolvedValue({
      id: recUuid1,
      decision_status: "ACCEPTED",
    });
    jest.spyOn(aiFeedbackRepository, "recordFeedback").mockResolvedValue(null);

    // Citizen blocked
    const forbidden = await request(app)
      .patch(`/api/v1/intelligence/agents/recommendations/${recUuid1}/decision`)
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({ decision: "ACCEPTED" });
    expect(forbidden.status).toBe(403);

    // MODIFIED without modifiedAction returns 400
    const badModify = await request(app)
      .patch(`/api/v1/intelligence/agents/recommendations/${recUuid1}/decision`)
      .set("Authorization", `Bearer ${officerToken}`)
      .send({ decision: "MODIFIED", decisionNote: "Change team" });
    expect(badModify.status).toBe(400);

    // Valid ACCEPT returns 200
    const accepted = await request(app)
      .patch(`/api/v1/intelligence/agents/recommendations/${recUuid1}/decision`)
      .set("Authorization", `Bearer ${officerToken}`)
      .send({ decision: "ACCEPTED", decisionNote: "Dispatched crew #3" });
    expect(accepted.status).toBe(200);
    expect(agentRepository.updateRecommendationDecision).toHaveBeenCalledWith(
      recUuid1,
      expect.objectContaining({
        decision: "ACCEPTED",
        decisionNote: "Dispatched crew #3",
      }),
    );
  });

  test("HTTP GET /api/v1/intelligence/agents/metrics returns Plan Section 15 evaluation metrics", async () => {
    jest.spyOn(agentRepository, "getEvaluationStats").mockResolvedValue({
      orchestrations: {
        total_orchestrations: 4,
        completed_count: 4,
        partial_count: 0,
        failed_count: 0,
        total_tool_calls: 28,
        valid_tool_calls: 28,
        total_unsupported_claims: 0,
        zero_hallucination_runs: 4,
        avg_duration_ms: 42.5,
        runs_with_provenance: 4,
      },
      stepsByAgent: [
        {
          agent_name: "PriorityAgent",
          total_steps: 4,
          completed_steps: 4,
          tool_calls: 12,
          valid_tool_calls: 12,
          unsupported_claims: 0,
          avg_duration_ms: 9.2,
        },
      ],
      recommendations: {
        total_recommendations: 10,
        pending_count: 2,
        accepted_count: 5,
        rejected_count: 2,
        modified_count: 1,
        non_causal_count: 4,
        avg_confidence: 0.885,
      },
    });

    const res = await request(app)
      .get("/api/v1/intelligence/agents/metrics")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.taskSuccessRatePercent).toBe(100);
    expect(res.body.data.toolUseAccuracyPercent).toBe(100);
    expect(res.body.data.unsupportedClaimRatePercent).toBe(0);
    expect(res.body.data.zeroHallucinationRunPercent).toBe(100);
    // (5 accepted + 1 modified) / 8 decided = 75.0%
    expect(res.body.data.recommendationLifecycle.acceptanceRatePercent).toBe(75);
  });

  test("Layer 6 Officer Copilot routes enforce RBAC (citizen receives 403 Forbidden)", async () => {
    const res = await request(app)
      .get("/api/v1/copilot/digest")
      .set("Authorization", `Bearer ${citizenToken}`);
    expect(res.status).toBe(403);
  });
});
