jest.mock("./clustering.repository", () => ({
  findClusters: jest.fn(),
}));

jest.mock("../../../repositories/hotspot.repository", () => ({
  upsertHotspotWithMembers: jest.fn(),
  listHotspots: jest.fn(),
  updateHotspotStatus: jest.fn(),
  queryWardComplaintStats: jest.fn(),
  findHotspotsByComplaintId: jest.fn(),
  listCityComplaintSummaries: jest.fn(),
}));

const { findClusters } = require("./clustering.repository");
const hotspotRepository = require("../../../repositories/hotspot.repository");
const { clusterComplaints } = require("./clustering.service");
const hotspotService = require("./hotspot.service");
const { resolveWardAndZone, searchPlacesOffline } = require("./ward.resolver");

function makeRow(id, clusterId, latitude = 17.4156, longitude = 78.4357, overrides = {}) {
  return {
    id,
    reference_id: `CP-TEST-${id}`,
    title: `Test complaint ${id}`,
    description: "Test description",
    category: "roads",
    canonical_category: "ROAD",
    status: "SUBMITTED",
    priority: null,
    address: "4th Cross Rd, Banjara Hills",
    ward: "Ward 12 - Banjara Hills",
    zone: "Central Zone",
    latitude,
    longitude,
    created_at: new Date("2026-10-27T10:00:00Z"),
    cluster_id: clusterId,
    distance_meters: 10,
    ...overrides,
  };
}

const options = {
  latitude: 17.4156,
  longitude: 78.4357,
  radiusMeters: 5000,
  clusterDistanceMeters: 150,
  minClusterSize: 2,
};

describe("clusterComplaints & hotspotService (Layer 2)", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("excludes singleton clusters when minClusterSize is 2", async () => {
    findClusters.mockResolvedValue([
      makeRow("A", "cluster-1"),
      makeRow("B", "cluster-1"),
      makeRow("C", "cluster-2"),
    ]);

    const result = await clusterComplaints(options);

    expect(result.clusterCount).toBe(1);
    expect(result.clusteredComplaintCount).toBe(2);
    expect(result.excludedComplaintCount).toBe(1);
    expect(result.clusters[0].complaintCount).toBe(2);
  });

  test("excludes clusters smaller than minClusterSize 3", async () => {
    findClusters.mockResolvedValue([
      makeRow("A", "cluster-1"),
      makeRow("B", "cluster-1"),
      makeRow("C", "cluster-2"),
      makeRow("D", "cluster-2"),
      makeRow("E", "cluster-2"),
    ]);

    const result = await clusterComplaints({
      ...options,
      minClusterSize: 3,
    });

    expect(result.clusterCount).toBe(1);
    expect(result.clusteredComplaintCount).toBe(3);
    expect(result.excludedComplaintCount).toBe(2);
    expect(result.clusters[0].complaintCount).toBe(3);
  });

  test("returns an empty result when no complaints are found", async () => {
    findClusters.mockResolvedValue([]);

    const result = await clusterComplaints(options);

    expect(result.clusterCount).toBe(0);
    expect(result.clusteredComplaintCount).toBe(0);
    expect(result.excludedComplaintCount).toBe(0);
    expect(result.clusters).toEqual([]);
  });

  test("detects cross-category overlap (ROAD + WATER_SUPPLY), severity, recurrence, and ward density", async () => {
    findClusters.mockResolvedValue([
      makeRow("1", "cluster-overlap", 17.4156, 78.4357, {
        canonical_category: "ROAD",
        priority: "HIGH",
        created_at: new Date("2026-10-20T10:00:00Z"),
      }),
      makeRow("2", "cluster-overlap", 17.4159, 78.436, {
        canonical_category: "ROAD",
        priority: "HIGH",
        created_at: new Date("2026-10-22T10:00:00Z"),
      }),
      makeRow("3", "cluster-overlap", 17.4161, 78.4362, {
        category: "WATER_SUPPLY",
        canonical_category: "WATER_SUPPLY",
        priority: "CRITICAL",
        created_at: new Date("2026-10-27T10:00:00Z"),
      }),
    ]);

    const result = await clusterComplaints(options);

    expect(result.clusterCount).toBe(1);
    expect(result.crossCategoryOverlapCount).toBe(1);
    expect(result.crossCategoryOverlaps).toHaveLength(1);

    const cluster = result.clusters[0];
    expect(cluster.hasCrossCategoryOverlap).toBe(true);
    expect(cluster.overlapCategories).toEqual(["ROAD", "WATER_SUPPLY"]);
    expect(cluster.overlapSummary).toContain("subsurface leakage");
    expect(cluster.severity).toBe("CRITICAL");
    expect(cluster.recurrenceScore).toBeGreaterThan(0.5);
    expect(cluster.radiusMeters).toBeGreaterThanOrEqual(50);
    expect(cluster.ward).toBe("Ward 12 - Banjara Hills");
    expect(cluster.zone).toBe("Central Zone");
  });

  test("detectAndPersistHotspots persists clusters and getWardAnalytics aggregates ward densities", async () => {
    findClusters.mockResolvedValue([
      makeRow("10", "cluster-a", 17.4156, 78.4357, { canonical_category: "ROAD" }),
      makeRow("11", "cluster-a", 17.416, 78.4361, { canonical_category: "WATER_SUPPLY" }),
    ]);

    hotspotRepository.upsertHotspotWithMembers.mockResolvedValue({ id: "hs-1" });
    hotspotRepository.listHotspots.mockResolvedValue([
      {
        id: "hs-1",
        hotspot_key: "ward-12-banjara-hills:17.4150:78.4350",
        title: "Ward 12: Road + Water Supply Overlap",
        ward: "Ward 12 - Banjara Hills",
        zone: "Central Zone",
        center_latitude: 17.4158,
        center_longitude: 78.4359,
        radius_meters: 80,
        dominant_category: "ROAD",
        issue_categories: ["ROAD", "WATER_SUPPLY"],
        category_counts: { ROAD: 1, WATER_SUPPLY: 1 },
        complaint_count: 2,
        open_count: 2,
        density_per_sq_km: 99.5,
        recurrence_score: 0.51,
        confidence: 0.81,
        severity: "HIGH",
        has_cross_category_overlap: true,
        overlap_categories: ["ROAD", "WATER_SUPPLY"],
        overlap_summary: "Overlap alert",
        status: "ACTIVE",
        metadata: {},
        detected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        members: [],
      },
    ]);

    const persisted = await hotspotService.detectAndPersistHotspots({ cityWide: true });
    expect(hotspotRepository.upsertHotspotWithMembers).toHaveBeenCalledTimes(1);
    expect(persisted.detectedCount).toBe(1);
    expect(persisted.persistedCount).toBe(1);
    expect(persisted.crossCategoryOverlapCount).toBe(1);

    hotspotRepository.queryWardComplaintStats.mockResolvedValue({
      rows: [
        {
          ward: "Ward 12 - Banjara Hills",
          zone: "Central Zone",
          canonical_category: "ROAD",
          status: "SUBMITTED",
          effective_priority: "HIGH",
          latitude: 17.4156,
          longitude: 78.4357,
        },
        {
          ward: "Ward 12 - Banjara Hills",
          zone: "Central Zone",
          canonical_category: "WATER_SUPPLY",
          status: "IN_PROGRESS",
          effective_priority: "HIGH",
          latitude: 17.416,
          longitude: 78.436,
        },
      ],
      hotspotCountsByWard: new Map([
        ["Ward 12 - Banjara Hills", { activeHotspots: 1, overlapHotspots: 1 }],
      ]),
    });

    const wardReport = await hotspotService.getWardAnalytics();
    expect(wardReport.totalWards).toBe(1);
    expect(wardReport.wards[0].ward).toBe("Ward 12 - Banjara Hills");
    expect(wardReport.wards[0].totalComplaints).toBe(2);
    expect(wardReport.wards[0].activeHotspots).toBe(1);
    expect(wardReport.wards[0].overlapHotspots).toBe(1);
    expect(wardReport.wards[0].densityPerSqKm).toBeGreaterThan(0);
  });

  test("resolves multi-city wards/cities safely including Kerala, Bengaluru, arbitrary addresses, and lists active cities", async () => {
    const kerala = resolveWardAndZone({
      latitude: 8.76284,
      longitude: 76.79146,
      address: "Kalambalam, Trivandrum, Kerala, India",
    });
    expect(kerala.city).toBe("Thiruvananthapuram");
    expect(kerala.ward).toContain("Kalambalam");

    const bengaluru = resolveWardAndZone({
      latitude: 12.9784,
      longitude: 77.6408,
      address: "100 Ft Road, Indiranagar, Bengaluru",
    });
    expect(bengaluru.city).toBe("Bengaluru");
    expect(bengaluru.ward).toContain("Indiranagar");

    const customGlobal = resolveWardAndZone({
      latitude: null,
      longitude: null,
      address: "MI Road, Jaipur, Rajasthan, India",
    });
    expect(customGlobal.city).toBe("Jaipur");
    expect(customGlobal.ward).toContain("MI Road");

    const matches = searchPlacesOffline("Kalambalam");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].city).toBe("Thiruvananthapuram");

    hotspotRepository.listCityComplaintSummaries.mockResolvedValue([
      {
        city: "Hyderabad",
        complaintCount: 9,
        openCount: 9,
        hotspotCount: 3,
        overlapCount: 1,
        center: { latitude: 17.4156, longitude: 78.4357 },
      },
      {
        city: "Thiruvananthapuram",
        complaintCount: 3,
        openCount: 3,
        hotspotCount: 1,
        overlapCount: 1,
        center: { latitude: 8.7628, longitude: 76.7915 },
      },
    ]);

    const citiesPayload = await hotspotService.listActiveCities();
    expect(citiesPayload.totalCities).toBe(2);
    expect(citiesPayload.cities.map((c) => c.city)).toEqual([
      "Hyderabad",
      "Thiruvananthapuram",
    ]);
    expect(citiesPayload.directory.length).toBeGreaterThanOrEqual(5);
  });
});
