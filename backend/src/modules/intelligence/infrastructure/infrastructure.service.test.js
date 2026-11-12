const jwt = require("jsonwebtoken");

jest.mock("../../../config/database", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const request = require("supertest");
const app = require("../../../app");
const config = require("../../../config/env");
const infrastructureRepository = require("../../../repositories/infrastructure.repository");
const {
  deriveHealthGrade,
  evaluateComplaintAssetMatch,
  computeAssetHealthScore,
} = require("./health-score.calculator");

function makeToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    config.jwtSecret || "test-secret",
    { expiresIn: "1h" },
  );
}

describe("Layer 3 Intelligence: Infrastructure Health Score", () => {
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
  });

  describe("Deterministic Rule-Based Calculator", () => {
    test("computes critical score for heavily impacted road with cross-category water overlap and overdue maintenance", () => {
      const now = new Date("2026-11-11T00:00:00Z");
      const asset = {
        id: "aaaa1111-1111-4111-8111-111111111111",
        asset_code: "RD-TEST-1024",
        asset_type: "ROAD_SEGMENT",
        last_maintained_at: "2026-01-10T00:00:00Z", // ~10 months overdue
      };

      const linkedComplaints = [
        {
          id: "c1",
          status: "SUBMITTED",
          priority: "HIGH",
          link_type: "DIRECT",
          upvote_count: 4,
          created_at: "2026-10-25T00:00:00Z",
        },
        {
          id: "c2",
          status: "IN_PROGRESS",
          priority: "CRITICAL",
          link_type: "DIRECT",
          upvote_count: 3,
          created_at: "2026-10-28T00:00:00Z",
        },
        {
          id: "c3",
          status: "UNDER_REVIEW",
          priority: "HIGH",
          link_type: "DIRECT",
          upvote_count: 1,
          created_at: "2026-11-05T00:00:00Z",
        },
        {
          id: "c4",
          status: "SUBMITTED",
          priority: "HIGH",
          link_type: "CROSS_IMPACT",
          upvote_count: 0,
          created_at: "2026-11-02T00:00:00Z",
        },
      ];

      const result = computeAssetHealthScore({
        asset,
        linkedComplaints,
        maintenanceEvents: [],
        inActiveHotspot: true,
        now,
      });

      expect(result.healthScore).toBeLessThan(40);
      expect(result.healthGrade).toBe("CRITICAL");
      expect(result.trend).toBe("DETERIORATING");
      expect(result.openComplaintCount).toBe(4);
      expect(result.scoreBreakdown.baseScore).toBe(100);
      expect(
        Math.round(100 - result.scoreBreakdown.totalPenalty),
      ).toBe(result.healthScore);
    });

    test("rewards completed maintenance recovery and ignores older pre-maintenance resolved issues", () => {
      const now = new Date("2026-11-11T00:00:00Z");
      const asset = {
        id: "aaaa2222-2222-4222-8222-222222222222",
        asset_code: "RD-CLEAN-01",
        asset_type: "ROAD_SEGMENT",
        last_maintained_at: "2026-11-01T00:00:00Z",
      };

      const linkedComplaints = [
        {
          id: "c-old",
          status: "RESOLVED",
          priority: "CRITICAL",
          link_type: "DIRECT",
          created_at: "2026-06-01T00:00:00Z",
        },
      ];

      const maintenanceEvents = [
        {
          event_type: "RESURFACING",
          outcome: "COMPLETED",
          performed_at: "2026-11-05T00:00:00Z",
        },
      ];

      const result = computeAssetHealthScore({
        asset,
        linkedComplaints,
        maintenanceEvents,
        previousScore: 52,
        now,
      });

      expect(result.healthScore).toBeGreaterThanOrEqual(95);
      expect(result.healthGrade).toBe("GOOD");
      expect(result.trend).toBe("IMPROVING");
      expect(result.scoreBreakdown.maintenanceAgePenalty).toBeLessThan(1);
    });

    test("matches direct road complaints and adjacent water cross-impact within radius, while excluding distant cities", () => {
      const roadAsset = {
        asset_type: "ROAD_SEGMENT",
        city: "Thiruvananthapuram",
        ward: "Kalambalam Ward",
        catchment_radius_meters: 300,
      };

      const directRoad = evaluateComplaintAssetMatch(
        roadAsset,
        {
          city: "Thiruvananthapuram",
          ward: "Kalambalam Ward",
          canonical_category: "ROAD",
          category: "ROAD",
          title: "Deep pothole near bus stop",
        },
        45,
      );
      expect(directRoad?.linkType).toBe("DIRECT");

      const waterCrossImpact = evaluateComplaintAssetMatch(
        roadAsset,
        {
          city: "Thiruvananthapuram",
          ward: "Kalambalam Ward",
          canonical_category: "WATER_SUPPLY",
          category: "WATER_SUPPLY",
          title: "Water pipe leak eroding edge",
        },
        80,
      );
      expect(waterCrossImpact?.linkType).toBe("CROSS_IMPACT");

      const otherCity = evaluateComplaintAssetMatch(
        roadAsset,
        {
          city: "Hyderabad",
          ward: "Ward 12 - Banjara Hills",
          canonical_category: "ROAD",
          category: "ROAD",
          title: "Pothole",
        },
        20,
      );
      expect(otherCity).toBeNull();
    });

    test("derives grade thresholds accurately", () => {
      expect(deriveHealthGrade(85)).toBe("GOOD");
      expect(deriveHealthGrade(65)).toBe("FAIR");
      expect(deriveHealthGrade(45)).toBe("POOR");
      expect(deriveHealthGrade(35)).toBe("CRITICAL");
    });

    test("preserves DETERIORATING and IMPROVING trend even across idempotent recomputes with same score", () => {
      const now = new Date("2026-11-11T00:00:00Z");
      const declining = computeAssetHealthScore({
        asset: {
          id: "t-dec",
          asset_code: "RD-DEC-1",
          asset_type: "ROAD_SEGMENT",
          last_maintained_at: "2026-01-01T00:00:00Z",
        },
        linkedComplaints: [
          { id: "c1", status: "SUBMITTED", priority: "HIGH", link_type: "DIRECT", created_at: "2026-11-08T00:00:00Z" },
          { id: "c2", status: "UNDER_REVIEW", priority: "MEDIUM", link_type: "DIRECT", created_at: "2026-11-09T00:00:00Z" },
        ],
        previousScore: 78,
        now,
      });
      expect(declining.trend).toBe("DETERIORATING");

      // Idempotent recompute at identical score with >= 2 open complaints stays DETERIORATING
      const sameScoreRepeat = computeAssetHealthScore({
        asset: {
          id: "t-dec",
          asset_code: "RD-DEC-1",
          asset_type: "ROAD_SEGMENT",
          last_maintained_at: "2026-01-01T00:00:00Z",
        },
        linkedComplaints: [
          { id: "c1", status: "SUBMITTED", priority: "HIGH", link_type: "DIRECT", created_at: "2026-11-08T00:00:00Z" },
          { id: "c2", status: "UNDER_REVIEW", priority: "MEDIUM", link_type: "DIRECT", created_at: "2026-11-09T00:00:00Z" },
        ],
        previousScore: declining.healthScore,
        now,
      });
      expect(sameScoreRepeat.trend).toBe("DETERIORATING");

      const recovering = computeAssetHealthScore({
        asset: {
          id: "t-rec",
          asset_code: "DR-REC-1",
          asset_type: "DRAINAGE",
          last_maintained_at: "2026-11-05T00:00:00Z",
        },
        linkedComplaints: [],
        previousScore: 99,
        now,
      });
      expect(recovering.healthScore).toBeGreaterThanOrEqual(98);
      expect(recovering.trend).toBe("IMPROVING");
    });
  });

  describe("API Endpoints (/api/v1/intelligence/infrastructure)", () => {
    const assetUuid = "11111111-1111-4111-8111-999999999999";
    const sampleAssetRow = {
      id: assetUuid,
      asset_code: "RD-HYD-1024",
      name: "Road R-1024 · 4th Cross Corridor",
      asset_type: "ROAD_SEGMENT",
      city: "Hyderabad",
      ward: "Ward 12 - Banjara Hills",
      zone: "Central Zone",
      address: "4th Cross Rd, Banjara Hills",
      latitude: 17.4157,
      longitude: 78.4358,
      catchment_radius_meters: 300,
      department: "Roads & Public Works",
      install_date: "2022-11-11",
      last_maintained_at: "2026-03-01T00:00:00Z",
      health_score: 37,
      health_grade: "CRITICAL",
      trend: "DETERIORATING",
      complaint_count: 4,
      open_complaint_count: 3,
      recurrence_count: 3,
      maintenance_event_count: 1,
      score_breakdown: { baseScore: 100, totalPenalty: 63 },
      last_scored_at: "2026-11-11T05:00:00Z",
      created_at: "2026-11-11T05:00:00Z",
      updated_at: "2026-11-11T05:00:00Z",
    };

    test("forbids citizen access to infrastructure health endpoints", async () => {
      const res = await request(app)
        .get("/api/v1/intelligence/infrastructure/health")
        .set("Authorization", `Bearer ${citizenToken}`);

      expect(res.status).toBe(403);
    });

    test("returns filtered infrastructure overview and ward summary for officers", async () => {
      jest.spyOn(infrastructureRepository, "listAssets").mockResolvedValue([sampleAssetRow]);
      jest.spyOn(infrastructureRepository, "queryWardHealthInputs").mockResolvedValue({
        assets: [sampleAssetRow],
        complaints: [
          {
            id: "c1",
            city: "Hyderabad",
            ward: "Ward 12 - Banjara Hills",
            zone: "Central Zone",
            status: "SUBMITTED",
            effective_priority: "HIGH",
            created_at: "2026-11-10T00:00:00Z",
          },
        ],
      });

      const res = await request(app)
        .get("/api/v1/intelligence/infrastructure/health?city=Hyderabad")
        .set("Authorization", `Bearer ${officerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.totalAssets).toBe(1);
      expect(res.body.data.summary.gradeCounts.CRITICAL).toBe(1);
      expect(res.body.data.assets[0].assetCode).toBe("RD-HYD-1024");
      expect(res.body.data.wards[0].ward).toBe("Ward 12 - Banjara Hills");
      expect(res.body.data.wards[0].healthScore).toBe(37);
    });

    test("returns detailed asset breakdown, linked complaints, and maintenance history", async () => {
      jest.spyOn(infrastructureRepository, "findAssetById").mockResolvedValue(sampleAssetRow);
      jest
        .spyOn(infrastructureRepository, "fetchLinkedComplaintsForAsset")
        .mockResolvedValue([
          {
            id: "33333333-3333-4333-8333-333333333333",
            reference_id: "CP-2026-000001",
            title: "Large pothole hazard near bus stop",
            canonical_category: "ROAD",
            effective_priority: "HIGH",
            status: "IN_PROGRESS",
            city: "Hyderabad",
            ward: "Ward 12 - Banjara Hills",
            address: "4th Cross Rd",
            link_type: "DIRECT",
            link_confidence: 0.95,
            link_reason: "Matched road segment direct issue",
            distance_meters: 15.4,
            upvote_count: 2,
            created_at: "2026-11-10T00:00:00Z",
          },
        ]);
      jest
        .spyOn(infrastructureRepository, "fetchMaintenanceEvents")
        .mockResolvedValue([
          {
            id: "44444444-4444-4444-8444-444444444444",
            asset_id: assetUuid,
            event_type: "RESURFACING",
            outcome: "COMPLETED",
            performed_by: "Road Division Crew",
            notes: "Initial patch",
            performed_at: "2026-03-01T00:00:00Z",
            created_at: "2026-03-01T00:00:00Z",
          },
        ]);
      jest.spyOn(infrastructureRepository, "fetchHealthHistory").mockResolvedValue([]);

      const res = await request(app)
        .get(`/api/v1/intelligence/infrastructure/assets/${assetUuid}`)
        .set("Authorization", `Bearer ${officerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.asset.assetCode).toBe("RD-HYD-1024");
      expect(res.body.data.linkedComplaints).toHaveLength(1);
      expect(res.body.data.maintenanceEvents).toHaveLength(1);
    });

    test("returns 404 for malformed asset UUID", async () => {
      const res = await request(app)
        .get("/api/v1/intelligence/infrastructure/assets/not-a-uuid")
        .set("Authorization", `Bearer ${officerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("ASSET_NOT_FOUND");
    });

    test("records a maintenance event and recomputes asset health score", async () => {
      const updatedRow = {
        ...sampleAssetRow,
        last_maintained_at: "2026-11-11T08:00:00Z",
        health_score: 79,
        health_grade: "FAIR",
        trend: "IMPROVING",
      };

      jest
        .spyOn(infrastructureRepository, "findAssetById")
        .mockResolvedValueOnce(sampleAssetRow)
        .mockResolvedValueOnce({ ...sampleAssetRow, last_maintained_at: "2026-11-11T08:00:00Z" })
        .mockResolvedValueOnce(updatedRow);
      jest
        .spyOn(infrastructureRepository, "createMaintenanceEvent")
        .mockResolvedValue({
          id: "55555555-5555-4555-8555-555555555555",
          asset_id: assetUuid,
          event_type: "RESURFACING",
          outcome: "COMPLETED",
          performed_by: "Road Crew",
          notes: "Full lane resurfaced",
          performed_at: "2026-11-11T08:00:00Z",
          created_at: "2026-11-11T08:00:00Z",
        });
      jest.spyOn(infrastructureRepository, "fetchAllScorableComplaints").mockResolvedValue([]);
      jest.spyOn(infrastructureRepository, "replaceAutoComplaintLinks").mockResolvedValue();
      jest.spyOn(infrastructureRepository, "fetchLinkedComplaintsForAsset").mockResolvedValue([]);
      jest
        .spyOn(infrastructureRepository, "fetchMaintenanceEvents")
        .mockResolvedValue([
          {
            id: "55555555-5555-4555-8555-555555555555",
            asset_id: assetUuid,
            event_type: "RESURFACING",
            outcome: "COMPLETED",
            performed_by: "Road Crew",
            notes: "Full lane resurfaced",
            performed_at: "2026-11-11T08:00:00Z",
            created_at: "2026-11-11T08:00:00Z",
          },
        ]);
      jest
        .spyOn(infrastructureRepository, "updateAssetHealthScore")
        .mockResolvedValue(updatedRow);
      jest.spyOn(infrastructureRepository, "fetchHealthHistory").mockResolvedValue([]);

      const res = await request(app)
        .post(`/api/v1/intelligence/infrastructure/assets/${assetUuid}/maintenance`)
        .set("Authorization", `Bearer ${officerToken}`)
        .send({
          eventType: "RESURFACING",
          outcome: "COMPLETED",
          performedBy: "Road Crew",
          notes: "Full lane resurfaced",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.event.eventType).toBe("RESURFACING");
      expect(res.body.data.asset.healthScore).toBe(79);
    });

    test("returns evaluation sensitivity and maintenance label alignment metrics", async () => {
      jest.spyOn(infrastructureRepository, "listAssets").mockResolvedValue([
        {
          ...sampleAssetRow,
          health_score: 37,
          health_grade: "CRITICAL",
          trend: "DETERIORATING",
          score_breakdown: {
            complaintImpactPenalty: 21.6,
            recurrencePenalty: 18.0,
            severityPenalty: 20.0,
            unresolvedDurationPenalty: 1.4,
            maintenanceAgePenalty: 12.0,
            totalPenalty: 63.0,
            factors: { crossImpactCount: 1, inActiveHotspot: true, resolvedActiveCount: 0 },
          },
        },
        {
          ...sampleAssetRow,
          id: "22222222-2222-4222-8222-999999999999",
          asset_code: "DR-HYD-112",
          asset_type: "DRAINAGE",
          last_maintained_at: new Date().toISOString(),
          health_score: 99,
          health_grade: "GOOD",
          trend: "IMPROVING",
          score_breakdown: {
            complaintImpactPenalty: 0,
            recurrencePenalty: 0,
            severityPenalty: 0,
            unresolvedDurationPenalty: 0,
            maintenanceAgePenalty: 1.0,
            totalPenalty: 1.0,
            factors: { crossImpactCount: 0, inActiveHotspot: false, resolvedActiveCount: 0 },
          },
        },
      ]);

      const res = await request(app)
        .get("/api/v1/intelligence/infrastructure/metrics")
        .set("Authorization", `Bearer ${officerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalAssets).toBe(2);
      expect(res.body.data.labelAlignment.maintenanceAlignmentPercent).toBe(100);
      expect(res.body.data.sensitivityAnalysis.deltaResolveOpenPts).toBeGreaterThan(0);
      expect(res.body.data.sensitivityAnalysis.deltaCompleteMaintenancePts).toBeGreaterThanOrEqual(0);
    });
  });
});
