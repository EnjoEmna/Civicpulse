jest.mock("./clustering.repository", () => ({
  findClusters: jest.fn(),
}));

const { findClusters } = require("./clustering.repository");
const { clusterComplaints } = require("./clustering.service");

function makeRow(id, clusterId, latitude = 10.78, longitude = 78.67) {
  return {
    id,
    reference_id: `CP-TEST-${id}`,
    title: `Test complaint ${id}`,
    description: "Test description",
    category: "roads",
    canonical_category: "ROAD",
    status: "SUBMITTED",
    priority: null,
    address: "Test address",
    latitude,
    longitude,
    created_at: new Date("2026-10-27T10:00:00Z"),
    cluster_id: clusterId,
    distance_meters: 10,
  };
}

const options = {
  latitude: 10.78,
  longitude: 78.67,
  radiusMeters: 5000,
  clusterDistanceMeters: 100,
  minClusterSize: 2,
};

describe("clusterComplaints", () => {
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
});
