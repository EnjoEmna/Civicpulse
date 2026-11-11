const spatialRepository = require("./spatial.repository");

const CLOSED_STATUSES = new Set(["RESOLVED", "REJECTED"]);

async function analyzeNearbyComplaints({
  latitude,
  longitude,
  radiusMeters = 2000,
  maxResults = 100,
  category,
  timeWindowDays,
  city,
  ward,
}) {
  const complaints = await spatialRepository.findNearbyComplaints({
    latitude,
    longitude,
    radiusMeters,
    maxResults,
    category,
    timeWindowDays,
    city,
    ward,
  });

  const categoryCounts = {};
  const wardBreakdown = {};
  const cityBreakdown = {};
  let openCount = 0;

  for (const complaint of complaints) {
    const key = complaint.canonical_category || "UNCATEGORIZED";
    categoryCounts[key] = (categoryCounts[key] || 0) + 1;

    const wardName = complaint.ward || "Unassigned Ward";
    wardBreakdown[wardName] = (wardBreakdown[wardName] || 0) + 1;

    const cityName = complaint.city || "General Jurisdiction";
    cityBreakdown[cityName] = (cityBreakdown[cityName] || 0) + 1;

    if (!CLOSED_STATUSES.has(String(complaint.status || "").toUpperCase())) {
      openCount += 1;
    }
  }

  const areaSqKm = Math.PI * (radiusMeters / 1000) ** 2;
  const densityPerSqKm =
    areaSqKm > 0 ? Number((complaints.length / areaSqKm).toFixed(2)) : 0;

  const presentCategories = Object.keys(categoryCounts);
  const hasCrossCategoryOverlap = presentCategories.length >= 2;
  const overlapAlert =
    categoryCounts.ROAD && categoryCounts.WATER_SUPPLY
      ? "Road damage and Water Supply reports co-occur in this search zone — check for subsurface pipeline leaks before resurfacing."
      : hasCrossCategoryOverlap
        ? `Multiple infrastructure categories (${presentCategories.join(", ")}) overlap within this radius.`
        : null;

  return {
    center: {
      latitude,
      longitude,
    },
    radiusMeters,
    timeWindowDays: timeWindowDays ?? null,
    returnedCount: complaints.length,
    openCount,
    maxResults,
    densityPerSqKm,
    areaSqKm: Number(areaSqKm.toFixed(3)),
    categoryCounts,
    wardBreakdown,
    cityBreakdown,
    hasCrossCategoryOverlap,
    overlapAlert,
    complaints: complaints.map((complaint) => ({
      id: complaint.id,
      referenceId: complaint.reference_id,
      title: complaint.title,
      description: complaint.description,
      category: complaint.category,
      canonicalCategory: complaint.canonical_category,
      status: complaint.status,
      priority: complaint.priority,
      address: complaint.address,
      city: complaint.city || null,
      ward: complaint.ward || null,
      zone: complaint.zone || null,
      latitude: complaint.latitude,
      longitude: complaint.longitude,
      distanceMeters: Number(complaint.distance_meters),
      createdAt: complaint.created_at,
    })),
  };
}

module.exports = {
  analyzeNearbyComplaints,
};
