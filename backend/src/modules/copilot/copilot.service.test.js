const jwt = require("jsonwebtoken");

jest.mock("../../config/database", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const request = require("supertest");
const app = require("../../app");
const config = require("../../config/env");

const copilotRepository = require("../../repositories/copilot.repository");
const agentOrchestrator = require("../intelligence/agents/agent-orchestrator.service");
const infrastructureService = require("../intelligence/infrastructure/infrastructure.service");
const graphService = require("../intelligence/graph/graph.service");
const hotspotService = require("../intelligence/spatial/hotspot.service");

function makeToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name || "Test User" },
    config.jwtSecret || "test-secret",
    { expiresIn: "1h" },
  );
}

describe("Layer 6 Officer Copilot API & Workflows", () => {
  const citizenToken = makeToken({
    id: "22222222-2222-4222-8222-222222222222",
    role: "CITIZEN",
    name: "Citizen User",
  });
  const officerToken = makeToken({
    id: "11111111-1111-4111-8111-111111111111",
    role: "OFFICER",
    name: "Officer R. Naidu",
  });
  const otherOfficerToken = makeToken({
    id: "33333333-3333-4333-8333-333333333333",
    role: "OFFICER",
    name: "Officer Two",
  });

  const roadAssetUuid = "a1111111-1111-4111-8111-111111111111";
  const sessionUuid = "f1111111-1111-4111-8111-111111111111";
  const userMsgUuid = "f2222222-2222-4222-8222-222222222222";
  const botMsgUuid = "f3333333-3333-4333-8333-333333333333";
  const runUuid = "91111111-1111-4111-8111-111111111111";
  const recUuid = "e1111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test("GET /api/v1/copilot/digest forbids citizens (403) and returns Morning Digest for officers", async () => {
    const forbiddenRes = await request(app)
      .get("/api/v1/copilot/digest")
      .set("Authorization", `Bearer ${citizenToken}`);
    expect(forbiddenRes.status).toBe(403);

    jest.spyOn(infrastructureService, "getInfrastructureOverview").mockResolvedValue({
      summary: {
        totalAssets: 12,
        gradeCounts: { CRITICAL: 2, POOR: 3, FAIR: 4, GOOD: 3 },
        maintenanceOverdueCount: 4,
      },
      assets: [
        {
          id: roadAssetUuid,
          assetCode: "RD-HYD-1024",
          name: "Road R-1024",
          assetType: "ROAD_SEGMENT",
          city: "Hyderabad",
          ward: "Ward 12 - Banjara Hills",
          department: "Roads & Public Works",
          healthScore: 34,
          healthGrade: "CRITICAL",
          trend: "DETERIORATING",
          openComplaintCount: 4,
          recurrenceCount: 3,
          maintenanceAgeMonths: 8.2,
          scoreBreakdown: { complaintImpactPenalty: 22 },
        },
      ],
      wards: [],
    });

    jest.spyOn(hotspotService, "listSavedHotspots").mockResolvedValue({
      activeCount: 1,
      crossCategoryOverlapCount: 1,
      hotspots: [
        {
          id: "d1111111-1111-4111-8111-111111111111",
          hotspotKey: "hs-1",
          title: "4th Cross Cluster",
          ward: "Ward 12 - Banjara Hills",
          complaintCount: 4,
          openCount: 3,
          hasCrossCategoryOverlap: true,
          overlapCategories: ["ROAD", "WATER_SUPPLY"],
        },
      ],
    });

    jest.spyOn(agentOrchestrator, "listRecommendations").mockResolvedValue({
      total: 1,
      pendingCount: 1,
      recommendations: [
        {
          id: recUuid,
          agentRunId: runUuid,
          targetType: "ASSET",
          targetId: "RD-HYD-1024",
          assetId: roadAssetUuid,
          priority: "CRITICAL",
          actionTitle: "Joint inspection of WP-HYD-204 before repairing RD-HYD-1024",
          proposedAction: "Inspect WP-HYD-204 first.",
          rationale: "Co-located asset.",
          confidence: 0.9,
          requiresHumanConfirmation: true,
          isNonCausalInferred: true,
          decisionStatus: "PENDING",
        },
      ],
    });

    jest.spyOn(graphService, "investigateAsset").mockResolvedValue({
      potentialContributingAssets: [
        {
          assetCode: "WP-HYD-204",
          name: "Pipeline P-204",
          assetType: "WATER_PIPELINE",
          healthScore: 52,
          healthGrade: "POOR",
          distanceMeters: 42,
          confidence: 0.85,
          disclaimer: "Potential co-located contributor; inspect upstream asset before repair.",
        },
      ],
    });

    const res = await request(app)
      .get("/api/v1/copilot/digest?city=Hyderabad&limit=3")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.city).toBe("Hyderabad");
    expect(res.body.data.priorityItems).toHaveLength(1);
    expect(res.body.data.priorityItems[0].assetCode).toBe("RD-HYD-1024");
    expect(
      res.body.data.priorityItems[0].potentialContributingAssets[0].relationshipLabel,
    ).toBe("Potential Relationship (Non-Causal)");
    expect(res.body.data.pendingRecommendations).toHaveLength(1);
  });

  test("POST /api/v1/copilot/ask validates input and persists grounded investigation + explainability", async () => {
    const invalidRes = await request(app)
      .post("/api/v1/copilot/ask")
      .set("Authorization", `Bearer ${officerToken}`)
      .send({ question: "hi" });
    expect(invalidRes.status).toBe(400);

    const createdSession = {
      id: sessionUuid,
      officer_id: "11111111-1111-4111-8111-111111111111",
      title: "Investigate RD-HYD-1024",
      city: "Hyderabad",
      target_type: "ASSET",
      target_id: "RD-HYD-1024",
      last_message_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    jest.spyOn(copilotRepository, "createSession").mockResolvedValue(createdSession);
    jest.spyOn(copilotRepository, "updateSessionMeta").mockResolvedValue(createdSession);

    let msgCall = 0;
    jest.spyOn(copilotRepository, "createMessage").mockImplementation(async (payload) => {
      msgCall += 1;
      return {
        id: msgCall === 1 ? userMsgUuid : botMsgUuid,
        session_id: payload.sessionId,
        role: payload.role,
        content: payload.content,
        agent_run_id: payload.agentRunId,
        structured_payload: payload.structuredPayload,
        latency_ms: payload.latencyMs,
        created_at: new Date().toISOString(),
      };
    });

    jest.spyOn(agentOrchestrator, "orchestrateInvestigation").mockResolvedValue({
      run: {
        id: runUuid,
        status: "COMPLETED",
        durationMs: 42,
        toolCallsCount: 11,
        validToolCallsCount: 11,
        unsupportedClaimCount: 0,
        modelName: "deterministic-report-synthesizer",
      },
      report: {
        headline: "Investigation Brief: RD-HYD-1024 (34/100 · CRITICAL)",
        executiveSummary:
          "RD-HYD-1024 scores 34/100 (CRITICAL). Potential Relationship (Non-Causal): co-located WP-HYD-204 lies 42m nearby.",
        keyFindings: ["Maint age penalty -15"],
        resolvedTarget: {
          targetType: "ASSET",
          targetId: "RD-HYD-1024",
          city: "Hyderabad",
          ward: "Ward 12 - Banjara Hills",
        },
        infrastructureSummary: {
          id: roadAssetUuid,
          assetCode: "RD-HYD-1024",
          name: "Road R-1024",
          assetType: "ROAD_SEGMENT",
          city: "Hyderabad",
          ward: "Ward 12 - Banjara Hills",
          department: "Roads & Public Works",
          healthScore: 34,
          healthGrade: "CRITICAL",
          trend: "DETERIORATING",
          openComplaintCount: 4,
          complaintCount: 5,
          maintenanceAgeMonths: 8.2,
          scoreBreakdown: {
            complaintImpactPenalty: 22,
            recurrencePenalty: 14,
            severityPenalty: 12,
            unresolvedDurationPenalty: 8,
            maintenanceAgePenalty: 10,
          },
          maintenanceEvents: [],
          healthTrajectory: [],
        },
        upstreamContributingAssets: [
          {
            assetCode: "WP-HYD-204",
            name: "Pipeline P-204",
            assetType: "WATER_PIPELINE",
            healthScore: 52,
            healthGrade: "POOR",
            distanceMeters: 42,
            confidence: 0.85,
            relationshipLabel: "Potential Relationship (Non-Causal)",
            upstreamOpenComplaints: 2,
            disclaimer: "Inspect upstream asset prior to resurfacing.",
          },
        ],
        evidenceChains: [
          {
            id: "chain-1",
            chainType: "POTENTIAL_CONTRIBUTION",
            title: "WP-HYD-204 -> RD-HYD-1024",
            isInferred: true,
            relationshipLabel: "Potential Relationship (Non-Causal)",
            confidence: 0.85,
            summary: "Co-located 42m",
            steps: [],
          },
        ],
        spatialSummary: { focalHotspots: [] },
        complaintSummary: { keyCitizenReports: [], focalComplaint: null },
        guardrails: {
          deterministicMathOnly: true,
          readOnlyToolsOnly: true,
          humanConfirmationRequired: true,
          nonCausalInferenceEnforced: true,
        },
      },
      recommendations: [
        {
          id: recUuid,
          actionTitle: "Joint inspection of WP-HYD-204 before repairing RD-HYD-1024",
          proposedAction: "Pressure-test WP-HYD-204 before resurfacing RD-HYD-1024.",
          rationale: "Potential Relationship (Non-Causal).",
          priority: "CRITICAL",
          confidence: 0.85,
          requiresHumanConfirmation: true,
          isNonCausalInferred: true,
          decisionStatus: "PENDING",
        },
      ],
      stepRuns: [
        {
          stepOrder: 1,
          agentName: "PriorityAgent",
          status: "COMPLETED",
          durationMs: 6,
          toolCallsCount: 3,
          validToolCallsCount: 3,
          modelName: "deterministic-priority-ranker",
        },
      ],
      groundingReport: {
        passed: true,
        checkedFactCount: 8,
        groundedFactCount: 8,
        unsupportedClaimCount: 0,
        groundingScore: 1,
        unsupportedClaims: [],
      },
    });

    const res = await request(app)
      .post("/api/v1/copilot/ask")
      .set("Authorization", `Bearer ${officerToken}`)
      .send({
        question: "Why is Road RD-HYD-1024 repeatedly receiving complaints?",
        assetCode: "RD-HYD-1024",
        city: "Hyderabad",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.session.id).toBe(sessionUuid);
    expect(res.body.data.assistantMessage.agentRunId).toBe(runUuid);
    expect(
      res.body.data.assistantMessage.structuredPayload.explainability.primaryAsset.assetCode,
    ).toBe("RD-HYD-1024");
    expect(
      res.body.data.assistantMessage.structuredPayload.explainability.groundingReport
        .unsupportedClaimCount,
    ).toBe(0);
    expect(res.body.data.recommendations).toHaveLength(1);
    expect(res.body.data.recommendations[0].decisionStatus).toBe("PENDING");
  });

  test("GET /api/v1/copilot/sessions/:id enforces session ownership (403 for different officer)", async () => {
    jest.spyOn(copilotRepository, "findSessionById").mockResolvedValue({
      id: sessionUuid,
      officer_id: "11111111-1111-4111-8111-111111111111",
      title: "Investigate RD-HYD-1024",
      city: "Hyderabad",
      last_message_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const denied = await request(app)
      .get(`/api/v1/copilot/sessions/${sessionUuid}`)
      .set("Authorization", `Bearer ${otherOfficerToken}`);
    expect(denied.status).toBe(403);

    jest.spyOn(copilotRepository, "listMessagesBySession").mockResolvedValue([
      {
        id: botMsgUuid,
        session_id: sessionUuid,
        role: "COPILOT",
        content: "Grounded response",
        agent_run_id: runUuid,
        structured_payload: {},
        latency_ms: 40,
        created_at: new Date().toISOString(),
      },
    ]);
    jest.spyOn(agentOrchestrator, "listRecommendations").mockResolvedValue({
      total: 1,
      pendingCount: 0,
      recommendations: [{ id: recUuid, decisionStatus: "ACCEPTED" }],
    });

    const allowed = await request(app)
      .get(`/api/v1/copilot/sessions/${sessionUuid}`)
      .set("Authorization", `Bearer ${officerToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.messages[0].recommendations[0].decisionStatus).toBe("ACCEPTED");
  });

  test("PATCH /api/v1/copilot/recommendations/:id/decision validates MODIFIED payload & records confirmation", async () => {
    const missingModified = await request(app)
      .patch(`/api/v1/copilot/recommendations/${recUuid}/decision`)
      .set("Authorization", `Bearer ${officerToken}`)
      .send({ decision: "MODIFIED" });
    expect(missingModified.status).toBe(400);

    jest.spyOn(agentOrchestrator, "decideRecommendation").mockResolvedValue({
      id: recUuid,
      decisionStatus: "ACCEPTED",
      decisionNote: "Dispatched crew",
    });

    const okRes = await request(app)
      .patch(`/api/v1/copilot/recommendations/${recUuid}/decision`)
      .set("Authorization", `Bearer ${officerToken}`)
      .send({
        decision: "ACCEPTED",
        decisionNote: "Dispatched crew",
      });

    expect(okRes.status).toBe(200);
    expect(okRes.body.data.recommendation.decisionStatus).toBe("ACCEPTED");
  });

  test("GET /api/v1/copilot/metrics returns combined Layer 5 & Layer 6 telemetry", async () => {
    jest.spyOn(agentOrchestrator, "getAgentEvaluationMetrics").mockResolvedValue({
      totalOrchestrations: 5,
      taskSuccessRatePercent: 100,
      toolCallsTotal: 55,
      validToolCallsTotal: 55,
      toolUseAccuracyPercent: 100,
      totalUnsupportedClaims: 0,
      unsupportedClaimRatePercent: 0,
      zeroHallucinationRunPercent: 100,
      provenanceCompletenessPercent: 100,
      avgDurationMs: 38,
      agentBreakdown: [],
      recommendationLifecycle: {
        total: 6,
        pending: 2,
        accepted: 3,
        rejected: 1,
        modified: 0,
        decidedCount: 4,
        nonCausalFlaggedCount: 2,
        avgConfidence: 0.89,
        acceptanceRatePercent: 75,
      },
      registeredToolsCount: 14,
    });

    jest.spyOn(copilotRepository, "getCopilotUsageStats").mockResolvedValue({
      sessions: { total_sessions: 4, active_sessions_24h: 3 },
      messages: {
        total_messages: 10,
        user_queries_count: 5,
        copilot_replies_count: 5,
        avg_copilot_latency_ms: 41.5,
      },
    });

    const res = await request(app)
      .get("/api/v1/copilot/metrics")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.zeroHallucinationRunPercent).toBe(100);
    expect(res.body.data.copilotUsage.totalSessions).toBe(4);
    expect(res.body.data.copilotUsage.avgCopilotLatencyMs).toBe(41.5);
  });
});
