const jwt = require("jsonwebtoken");

jest.mock("../../../config/database", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const request = require("supertest");
const app = require("../../../app");
const config = require("../../../config/env");
const knowledgeGraphRepository = require("../../../repositories/knowledge-graph.repository");
const { buildKnowledgeGraphFromSources } = require("./graph-builder.service");

function makeToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    config.jwtSecret || "test-secret",
    { expiresIn: "1h" },
  );
}

describe("Layer 4 Intelligence: Civic Knowledge Graph", () => {
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

  const sampleNow = new Date("2026-11-12T01:00:00Z");

  function buildFixtureSources() {
    return {
      assets: [
        {
          id: "a1111111-1111-4111-8111-111111111111",
          asset_code: "RD-HYD-1024",
          name: "Road R-1024 · 4th Cross Corridor",
          asset_type: "ROAD_SEGMENT",
          city: "Hyderabad",
          ward: "Ward 12 - Banjara Hills",
          zone: "Central Zone",
          address: "4th Cross Rd",
          latitude: 17.4157,
          longitude: 78.4358,
          department: "Roads & Public Works",
          health_score: 37,
          health_grade: "CRITICAL",
          trend: "DETERIORATING",
          complaint_count: 3,
          open_complaint_count: 3,
          recurrence_count: 3,
          last_maintained_at: "2026-02-01T00:00:00Z",
        },
        {
          id: "a2222222-2222-4222-8222-222222222222",
          asset_code: "WP-HYD-204",
          name: "Pipeline P-204 · 4th Cross Feeder",
          asset_type: "WATER_PIPELINE",
          city: "Hyderabad",
          ward: "Ward 12 - Banjara Hills",
          zone: "Central Zone",
          address: "4th Cross Rd",
          latitude: 17.4161,
          longitude: 78.4362,
          department: "Water Supply & Drainage",
          health_score: 54,
          health_grade: "POOR",
          trend: "DETERIORATING",
          complaint_count: 2,
          open_complaint_count: 2,
          recurrence_count: 2,
          last_maintained_at: "2026-01-15T00:00:00Z",
        },
        {
          id: "a3333333-3333-4333-8333-333333333333",
          asset_code: "WP-TVM-108",
          name: "Kalambalam Pipeline",
          asset_type: "WATER_PIPELINE",
          city: "Thiruvananthapuram",
          ward: "Kalambalam Ward",
          zone: "Rural Zone",
          latitude: 8.76268,
          longitude: 76.79129,
          department: "Water Supply & Drainage",
          health_score: 58,
          health_grade: "POOR",
          trend: "STABLE",
          complaint_count: 1,
          open_complaint_count: 1,
          recurrence_count: 1,
        },
      ],
      complaints: [
        {
          id: "c1111111-1111-4111-8111-111111111111",
          reference_id: "CP-2026-000001",
          title: "Large pothole hazard near bus stop",
          category: "ROAD",
          canonical_category: "ROAD",
          effective_priority: "HIGH",
          status: "IN_PROGRESS",
          department: "Roads & Public Works",
          city: "Hyderabad",
          ward: "Ward 12 - Banjara Hills",
          latitude: 17.4156,
          longitude: 78.4357,
          assigned_officer_id: "o1111111-1111-4111-8111-111111111111",
          assigned_officer_name: "Officer R. Naidu",
          assigned_officer_email: "officer@civicpulse.org",
          created_at: "2026-11-10T00:00:00Z",
        },
        {
          id: "c2222222-2222-4222-8222-222222222222",
          reference_id: "CP-2026-000007",
          title: "Water seepage eroding pavement at 4th Cross Rd",
          category: "WATER_SUPPLY",
          canonical_category: "WATER_SUPPLY",
          effective_priority: "HIGH",
          status: "UNDER_REVIEW",
          department: "Water Supply & Drainage",
          city: "Hyderabad",
          ward: "Ward 12 - Banjara Hills",
          latitude: 17.4161,
          longitude: 78.4362,
          created_at: "2026-11-10T02:00:00Z",
        },
      ],
      assetLinks: [
        {
          complaint_id: "c1111111-1111-4111-8111-111111111111",
          asset_id: "a1111111-1111-4111-8111-111111111111",
          distance_meters: 15.2,
          link_type: "DIRECT",
          link_confidence: 0.96,
          link_reason: "Direct catchment match on 4th Cross Rd",
        },
        {
          complaint_id: "c2222222-2222-4222-8222-222222222222",
          asset_id: "a2222222-2222-4222-8222-222222222222",
          distance_meters: 12.0,
          link_type: "DIRECT",
          link_confidence: 0.95,
          link_reason: "Water pipeline catchment match",
        },
        {
          complaint_id: "c2222222-2222-4222-8222-222222222222",
          asset_id: "a1111111-1111-4111-8111-111111111111",
          distance_meters: 61.5,
          link_type: "CROSS_IMPACT",
          link_confidence: 0.84,
          link_reason: "Adjacent water seepage near RD-HYD-1024",
        },
      ],
      hotspots: [
        {
          id: "h1111111-1111-4111-8111-111111111111",
          hotspot_key: "ward-12-banjara-hills:17.4150:78.4350",
          title: "Banjara Hills 4th Cross Overlap Zone",
          city: "Hyderabad",
          ward: "Ward 12 - Banjara Hills",
          severity: "CRITICAL",
          status: "ACTIVE",
          complaint_count: 4,
          open_count: 4,
          has_cross_category_overlap: true,
          overlap_categories: ["ROAD", "WATER_SUPPLY"],
          overlap_summary: "Road damage overlaps with water seepage reports",
          radius_meters: 150,
          confidence: 0.91,
        },
      ],
      hotspotMembers: [
        {
          hotspot_id: "h1111111-1111-4111-8111-111111111111",
          complaint_id: "c1111111-1111-4111-8111-111111111111",
          distance_from_center_meters: 18,
        },
        {
          hotspot_id: "h1111111-1111-4111-8111-111111111111",
          complaint_id: "c2222222-2222-4222-8222-222222222222",
          distance_from_center_meters: 42,
        },
      ],
      maintenanceEvents: [
        {
          id: "m1111111-1111-4111-8111-111111111111",
          asset_id: "a1111111-1111-4111-8111-111111111111",
          event_type: "RESURFACING",
          outcome: "COMPLETED",
          performed_by: "Road Crew",
          actor_id: "o1111111-1111-4111-8111-111111111111",
          actor_name: "Officer R. Naidu",
          notes: "Cold-mix pothole patch",
          performed_at: "2026-02-01T00:00:00Z",
        },
      ],
      embeddings: [
        {
          complaint_id: "c1111111-1111-4111-8111-111111111111",
          embedding: [0.9, 0.4, 0.1],
          model_name: "gemini-embedding-001",
        },
        {
          complaint_id: "c2222222-2222-4222-8222-222222222222",
          embedding: [0.85, 0.5, 0.1],
          model_name: "gemini-embedding-001",
        },
      ],
    };
  }

  describe("Graph Builder & Non-Causal Inference Rules", () => {
    test("builds all core entity types, provenance metadata, and inferred POTENTIALLY_IMPACTS / SIMILAR_TO links", () => {
      const built = buildKnowledgeGraphFromSources(buildFixtureSources(), sampleNow);

      const entityTypes = new Set(built.nodes.map((n) => n.entityType));
      expect(entityTypes).toEqual(
        new Set([
          "INFRASTRUCTURE_ASSET",
          "COMPLAINT",
          "HOTSPOT",
          "MAINTENANCE_EVENT",
          "WARD",
          "DEPARTMENT",
          "OFFICER",
          "CATEGORY",
        ]),
      );

      for (const node of built.nodes) {
        expect(node.provenance).toMatchObject({
          model: "civicpulse-kg-builder",
          sourceTable: expect.any(String),
          sourceRecordIds: expect.any(Array),
          generatedAt: sampleNow.toISOString(),
        });
      }

      // Check proximity-inferred cross-infrastructure link WP-HYD-204 -> RD-HYD-1024
      const potEdge = built.edges.find(
        (e) =>
          e.relationType === "POTENTIALLY_IMPACTS" &&
          e.sourceKey === "asset:WP-HYD-204" &&
          e.targetKey === "asset:RD-HYD-1024",
      );
      expect(potEdge).toBeDefined();
      expect(potEdge.isInferred).toBe(true);
      expect(potEdge.confidence).toBeGreaterThanOrEqual(0.75);
      expect(potEdge.provenance.disclaimer).toMatch(/NOT confirmed causation/i);

      // Must NOT link cross-city assets (WP-TVM-108 is in Thiruvananthapuram)
      const crossCityPot = built.edges.find(
        (e) =>
          e.relationType === "POTENTIALLY_IMPACTS" &&
          e.sourceKey === "asset:WP-TVM-108",
      );
      expect(crossCityPot).toBeUndefined();

      // Check SIMILAR_TO inferred semantic edge
      const simEdge = built.edges.find((e) => e.relationType === "SIMILAR_TO");
      expect(simEdge).toBeDefined();
      expect(simEdge.isInferred).toBe(true);
      expect(simEdge.provenance.sourceTable).toBe("complaint_semantic_embeddings");

      // Check factual maintenance + assignment + hotspot edges
      const relations = new Set(built.edges.map((e) => e.relationType));
      expect(relations.has("AFFECTS")).toBe(true);
      expect(relations.has("CROSS_IMPACTS")).toBe(true);
      expect(relations.has("IN_HOTSPOT")).toBe(true);
      expect(relations.has("MAINTAINED_BY")).toBe(true);
      expect(relations.has("HAS_MAINTENANCE")).toBe(true);
      expect(relations.has("PERFORMED_BY")).toBe(true);
      expect(relations.has("ASSIGNED_TO")).toBe(true);
      expect(relations.has("HAS_CATEGORY")).toBe(true);
      expect(relations.has("ROUTED_TO")).toBe(true);
      expect(relations.has("LOCATED_IN")).toBe(true);
    });
  });

  describe("API Endpoints (/api/v1/intelligence/graph)", () => {
    function buildPersistedMockRows() {
      const built = buildKnowledgeGraphFromSources(buildFixtureSources(), sampleNow);
      const idByKey = new Map();
      const rawNodes = built.nodes.map((n, idx) => {
        const uuid = `90000000-0000-4000-8000-${String(idx + 1).padStart(12, "0")}`;
        idByKey.set(n.nodeKey, uuid);
        return {
          id: uuid,
          node_key: n.nodeKey,
          entity_type: n.entityType,
          external_id: n.externalId,
          label: n.label,
          city: n.city,
          ward: n.ward,
          properties: n.properties,
          provenance: n.provenance,
          created_at: sampleNow.toISOString(),
          updated_at: sampleNow.toISOString(),
        };
      });

      const rawEdges = built.edges.map((e, idx) => ({
        id: `e0000000-0000-4000-8000-${String(idx + 1).padStart(12, "0")}`,
        source_node_id: idByKey.get(e.sourceKey),
        target_node_id: idByKey.get(e.targetKey),
        relation_type: e.relationType,
        weight: e.weight,
        confidence: e.confidence,
        is_inferred: e.isInferred,
        evidence: e.evidence,
        provenance: e.provenance,
        properties: e.properties || {},
        created_at: sampleNow.toISOString(),
        updated_at: sampleNow.toISOString(),
      }));

      return { rawNodes, rawEdges };
    }

    function mockGraphRepository({ rawNodes, rawEdges }) {
      jest.spyOn(knowledgeGraphRepository, "countNodes").mockResolvedValue(rawNodes.length);
      jest.spyOn(knowledgeGraphRepository, "listNodes").mockImplementation(async ({ city, entityType, q } = {}) => {
        return rawNodes.filter((n) => {
          if (city && city !== "all") {
            const matchesCity = n.city && n.city.toLowerCase() === city.toLowerCase();
            const isGlobal = ["DEPARTMENT", "CATEGORY", "OFFICER"].includes(n.entity_type);
            if (!matchesCity && !isGlobal) return false;
          }
          if (entityType && entityType !== "all" && n.entity_type !== entityType) return false;
          if (q && !`${n.label} ${n.node_key}`.toLowerCase().includes(q.toLowerCase())) return false;
          return true;
        });
      });
      jest
        .spyOn(knowledgeGraphRepository, "findNodeByIdentifier")
        .mockImplementation(async (identifier, { entityType = null } = {}) => {
          const clean = String(identifier || "").trim().toLowerCase();
          return (
            rawNodes.find(
              (n) =>
                (!entityType || n.entity_type === entityType) &&
                (n.node_key.toLowerCase() === clean ||
                  n.node_key.toLowerCase() === `asset:${clean}` ||
                  n.node_key.toLowerCase() === `complaint:${clean}` ||
                  String(n.external_id || "").toLowerCase() === clean ||
                  n.id.toLowerCase() === clean ||
                  String(n.properties?.assetCode || "").toLowerCase() === clean ||
                  String(n.properties?.referenceId || "").toLowerCase() === clean),
            ) || null
          );
        });
      jest
        .spyOn(knowledgeGraphRepository, "findNodesByIds")
        .mockImplementation(async (ids) => rawNodes.filter((n) => ids.includes(n.id)));
      jest
        .spyOn(knowledgeGraphRepository, "findConnectedEdges")
        .mockImplementation(async (ids, { includeInferred = true } = {}) =>
          rawEdges.filter(
            (e) =>
              (ids.includes(e.source_node_id) || ids.includes(e.target_node_id)) &&
              (includeInferred || !e.is_inferred),
          ),
        );
      jest
        .spyOn(knowledgeGraphRepository, "findEdgesBetweenNodes")
        .mockImplementation(async (ids, { includeInferred = true } = {}) =>
          rawEdges.filter(
            (e) =>
              ids.includes(e.source_node_id) &&
              ids.includes(e.target_node_id) &&
              (includeInferred || !e.is_inferred),
          ),
        );
      jest
        .spyOn(knowledgeGraphRepository, "loadAllNodesAndEdges")
        .mockImplementation(async ({ city, includeInferred = true } = {}) => {
          const edges = rawEdges.filter((e) => includeInferred || !e.is_inferred);
          if (!city || city === "all") {
            return { nodes: rawNodes, edges };
          }
          const cityNodes = rawNodes.filter(
            (n) =>
              (n.city && n.city.toLowerCase() === city.toLowerCase()) ||
              ["DEPARTMENT", "CATEGORY", "OFFICER"].includes(n.entity_type),
          );
          const idSet = new Set(cityNodes.map((n) => n.id));
          const cityEdges = edges.filter(
            (e) => idSet.has(e.source_node_id) && idSet.has(e.target_node_id),
          );
          return { nodes: cityNodes, edges: cityEdges };
        });
    }

    test("forbids citizen access to knowledge graph endpoints", async () => {
      const res = await request(app)
        .get("/api/v1/intelligence/graph/overview")
        .set("Authorization", `Bearer ${citizenToken}`);

      expect(res.status).toBe(403);
    });

    test("investigates flagship asset RD-HYD-1024 with evidence chains, potential upstream contributor, and non-causal guardrail", async () => {
      mockGraphRepository(buildPersistedMockRows());

      const res = await request(app)
        .get("/api/v1/intelligence/graph/investigate/asset/RD-HYD-1024")
        .set("Authorization", `Bearer ${officerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.centerNode.nodeKey).toBe("asset:RD-HYD-1024");
      expect(res.body.data.potentialContributingAssets).toHaveLength(1);
      expect(res.body.data.potentialContributingAssets[0]).toMatchObject({
        assetCode: "WP-HYD-204",
        relationshipLabel: "Potential Relationship (Non-Causal)",
      });
      expect(
        res.body.data.evidenceChains.some(
          (c) => c.chainType === "POTENTIAL_CROSS_INFRASTRUCTURE",
        ),
      ).toBe(true);
      expect(res.body.data.guardrailNotice).toMatch(/never confirmed causation/i);

      // Verify includeInferred=false strips inferred edges
      const factualOnly = await request(app)
        .get("/api/v1/intelligence/graph/investigate/asset/RD-HYD-1024?includeInferred=false")
        .set("Authorization", `Bearer ${officerToken}`);
      expect(factualOnly.status).toBe(200);
      expect(factualOnly.body.data.potentialContributingAssets).toHaveLength(0);
    });

    test("finds shortest path between water complaint and affected corridor with narrative steps", async () => {
      mockGraphRepository(buildPersistedMockRows());

      const res = await request(app)
        .get("/api/v1/intelligence/graph/path?from=CP-2026-000007&to=RD-HYD-1024")
        .set("Authorization", `Bearer ${officerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.found).toBe(true);
      expect(res.body.data.hopCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.pathNodes.length).toBe(res.body.data.hopCount + 1);
      expect(res.body.data.narrativeSteps.length).toBe(res.body.data.hopCount);
    });

    test("returns 400 when path query params are missing and 404 when entity is unknown", async () => {
      mockGraphRepository(buildPersistedMockRows());

      const badRes = await request(app)
        .get("/api/v1/intelligence/graph/path?from=RD-HYD-1024")
        .set("Authorization", `Bearer ${officerToken}`);
      expect(badRes.status).toBe(400);

      const notFound = await request(app)
        .get("/api/v1/intelligence/graph/investigate/asset/UNKNOWN-999")
        .set("Authorization", `Bearer ${officerToken}`);
      expect(notFound.status).toBe(404);
      expect(notFound.body.error.code).toBe("ASSET_NOT_FOUND");
    });

    test("returns graph evaluation metrics with 100% provenance completeness and coverage", async () => {
      mockGraphRepository(buildPersistedMockRows());

      const res = await request(app)
        .get("/api/v1/intelligence/graph/metrics?city=Hyderabad")
        .set("Authorization", `Bearer ${officerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.provenanceCompletenessPercent).toBe(100);
      expect(res.body.data.inferredEdgesCount).toBeGreaterThanOrEqual(2);
      expect(res.body.data.relationshipCoverage.assetConnectivityPercent).toBe(100);
      expect(res.body.data.relationshipCoverage.complaintConnectivityPercent).toBe(100);
    });

    test("resolves INFRASTRUCTURE_ASSET even when maintenance node shares assetCode property", async () => {
      const mockData = buildPersistedMockRows();
      // Place maintenance node first with matching properties.assetCode
      const maintNode = {
        id: "99999999-0000-4000-8000-000000000099",
        node_key: "maintenance:m1",
        entity_type: "MAINTENANCE_EVENT",
        external_id: "m1",
        label: "RESURFACING · RD-HYD-1024",
        city: "Hyderabad",
        ward: "Ward 12 - Banjara Hills",
        properties: { assetCode: "RD-HYD-1024" },
        provenance: { model: "civicpulse-kg-builder" },
      };
      mockData.rawNodes.unshift(maintNode);
      mockGraphRepository(mockData);

      const res = await request(app)
        .get("/api/v1/intelligence/graph/investigate/asset/RD-HYD-1024")
        .set("Authorization", `Bearer ${officerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.centerNode.entityType).toBe("INFRASTRUCTURE_ASSET");
      expect(res.body.data.centerNode.nodeKey).toBe("asset:RD-HYD-1024");
    });

    test("rebuilds knowledge graph synchronously via POST /rebuild", async () => {
      jest
        .spyOn(knowledgeGraphRepository, "fetchGraphSourceData")
        .mockResolvedValue(buildFixtureSources());
      const persistSpy = jest
        .spyOn(knowledgeGraphRepository, "persistKnowledgeGraphSnapshot")
        .mockResolvedValue({ nodesSynced: 12, edgesSynced: 18 });

      const res = await request(app)
        .post("/api/v1/intelligence/graph/rebuild")
        .set("Authorization", `Bearer ${officerToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.nodesSynced).toBe(12);
      expect(res.body.data.edgesSynced).toBe(18);
      expect(persistSpy).toHaveBeenCalledTimes(1);
    });
  });
});
