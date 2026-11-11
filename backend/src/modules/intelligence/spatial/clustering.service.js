const { findClusters } = require("./clustering.repository");
const { haversineMeters, resolveWardAndZone } = require("./ward.resolver");

const CLOSED_STATUSES = new Set(["RESOLVED", "REJECTED"]);

function formatCategoryLabel(category) {
  return String(category || "OTHER")
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function analyzeCrossCategoryOverlap(categoryCounts, radiusMeters) {
  const issueCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat);

  const hasCrossCategoryOverlap = issueCategories.length >= 2;
  if (!hasCrossCategoryOverlap) {
    return {
      hasCrossCategoryOverlap: false,
      overlapCategories: [],
      overlapSummary: null,
    };
  }

  let overlapSummary = `Overlapping multi-category reports (${issueCategories.map(formatCategoryLabel).join(" + ")}) concentrated within ${Math.round(radiusMeters)}m.`;

  if (categoryCounts.ROAD && categoryCounts.WATER_SUPPLY) {
    overlapSummary =
      "Water Supply leakage and Road damage reports co-occur in the same hotspot footprint — subsurface leakage may be undermining road stability; inspect pipelines prior to resurfacing.";
  } else if (categoryCounts.ELECTRICITY && categoryCounts.PUBLIC_SAFETY) {
    overlapSummary =
      "Streetlight / electrical faults overlap Public Safety reports in this hotspot — schedule coordinated night lighting & safety verification.";
  } else if (categoryCounts.SANITATION && categoryCounts.WATER_SUPPLY) {
    overlapSummary =
      "Sanitation accumulation overlaps water/drainage incidents here — inspect for drain obstruction and water contamination risk.";
  }

  return {
    hasCrossCategoryOverlap: true,
    overlapCategories: issueCategories,
    overlapSummary,
  };
}

function computeRecurrenceAndSeverity(complaints, hasCrossCategoryOverlap) {
  const count = complaints.length;
  const openCount = complaints.filter(
    (c) => !CLOSED_STATUSES.has(String(c.status || "").toUpperCase()),
  ).length;

  const timestamps = complaints
    .map((c) => (c.createdAt ? new Date(c.createdAt).getTime() : NaN))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  const firstReportedAt = timestamps.length
    ? new Date(timestamps[0]).toISOString()
    : null;
  const lastReportedAt = timestamps.length
    ? new Date(timestamps[timestamps.length - 1]).toISOString()
    : null;

  const spanDays =
    timestamps.length >= 2
      ? (timestamps[timestamps.length - 1] - timestamps[0]) / 86400000
      : 0;

  const volumeScore = Math.min(0.45, Math.max(0, count - 1) * 0.12);
  const openScore = count > 0 ? (openCount / count) * 0.25 : 0;
  const temporalPersistence =
    spanDays >= 1
      ? Math.min(0.3, 0.12 + Math.log2(spanDays + 1) * 0.06)
      : 0.14;

  const recurrenceScore = Number(
    Math.min(1, volumeScore + openScore + temporalPersistence).toFixed(2),
  );

  const priorities = complaints.map((c) =>
    String(c.priority || c.aiPriority || "").toUpperCase(),
  );
  const criticalCount = priorities.filter((p) => p === "CRITICAL").length;
  const highCount = priorities.filter((p) => p === "HIGH").length;

  let severity = "MEDIUM";
  if (
    criticalCount > 0 ||
    (count >= 4 && hasCrossCategoryOverlap && openCount >= 2) ||
    (highCount >= 2 && openCount >= 3)
  ) {
    severity = "CRITICAL";
  } else if (hasCrossCategoryOverlap || highCount >= 1 || count >= 3) {
    severity = "HIGH";
  } else if (openCount === 0) {
    severity = "LOW";
  }

  return {
    openCount,
    recurrenceScore,
    severity,
    firstReportedAt,
    lastReportedAt,
  };
}

function resolveClusterWard(complaints, centroid) {
  const wardCounts = new Map();
  const cityCounts = new Map();
  let chosenZone = null;

  for (const c of complaints) {
    if (c.city) {
      cityCounts.set(c.city, (cityCounts.get(c.city) || 0) + 1);
    }
    if (c.ward) {
      const prev = wardCounts.get(c.ward) || { count: 0, zone: c.zone, city: c.city };
      wardCounts.set(c.ward, {
        count: prev.count + 1,
        zone: prev.zone || c.zone,
        city: prev.city || c.city,
      });
    }
  }

  let majorityCity = null;
  let bestCityCount = -1;
  for (const [cityName, count] of cityCounts.entries()) {
    if (count > bestCityCount) {
      bestCityCount = count;
      majorityCity = cityName;
    }
  }

  const fallback = resolveWardAndZone({
    latitude: centroid.latitude,
    longitude: centroid.longitude,
    address: complaints[0]?.address || "",
  });

  if (wardCounts.size > 0) {
    let bestWard = null;
    let bestCount = -1;
    let wardCity = null;
    for (const [wardName, info] of wardCounts.entries()) {
      if (info.count > bestCount) {
        bestCount = info.count;
        bestWard = wardName;
        chosenZone = info.zone || null;
        wardCity = info.city || null;
      }
    }
    return {
      city: majorityCity || wardCity || fallback.city,
      ward: bestWard,
      zone: chosenZone || fallback.zone || "Municipal Zone",
    };
  }

  return {
    city: majorityCity || fallback.city,
    ward: fallback.ward,
    zone: fallback.zone,
  };
}

async function clusterComplaints(options) {
  const rows = await findClusters(options);

  const clustersById = new Map();

  for (const row of rows) {
    let cluster = clustersById.get(row.cluster_id);

    if (!cluster) {
      cluster = {
        clusterId: row.cluster_id,
        complaints: [],
        categoryCounts: {},
        latitudeTotal: 0,
        longitudeTotal: 0,
      };

      clustersById.set(row.cluster_id, cluster);
    }

    const complaint = {
      id: row.id,
      referenceId: row.reference_id,
      title: row.title,
      description: row.description,
      category: row.category,
      canonicalCategory: row.canonical_category,
      status: row.status,
      priority: row.priority,
      aiCategory: row.ai_category || null,
      aiPriority: row.ai_priority || null,
      address: row.address,
      city: row.city || null,
      ward: row.ward || null,
      zone: row.zone || null,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      distanceMeters: Number(row.distance_meters || 0),
      createdAt: row.created_at,
    };

    cluster.complaints.push(complaint);

    cluster.categoryCounts[complaint.canonicalCategory] =
      (cluster.categoryCounts[complaint.canonicalCategory] || 0) + 1;

    cluster.latitudeTotal += complaint.latitude;
    cluster.longitudeTotal += complaint.longitude;
  }

  const allClusters = Array.from(clustersById.values());
  const minClusterSize = options.minClusterSize ?? 2;
  const clusterDistanceMeters = options.clusterDistanceMeters ?? 150;

  const clusters = allClusters
    .filter((cluster) => cluster.complaints.length >= minClusterSize)
    .map((cluster) => {
      const complaintCount = cluster.complaints.length;
      const centroid = {
        latitude: Number((cluster.latitudeTotal / complaintCount).toFixed(6)),
        longitude: Number((cluster.longitudeTotal / complaintCount).toFixed(6)),
      };

      let maxSpread = 0;
      let totalDist = 0;
      for (const c of cluster.complaints) {
        const d = haversineMeters(
          centroid.latitude,
          centroid.longitude,
          c.latitude,
          c.longitude,
        );
        if (d !== null) {
          totalDist += d;
          if (d > maxSpread) maxSpread = d;
        }
      }

      const hotspotRadiusMeters = Math.max(
        50,
        Math.round(maxSpread + Math.min(40, clusterDistanceMeters * 0.25)),
      );
      const areaSqKm = Math.PI * (hotspotRadiusMeters / 1000) ** 2;
      const densityPerSqKm =
        areaSqKm > 0 ? Number((complaintCount / areaSqKm).toFixed(1)) : 0;

      const sortedCategories = Object.entries(cluster.categoryCounts).sort(
        (a, b) => b[1] - a[1],
      );
      const dominantCategory = sortedCategories[0]?.[0] || "OTHER";
      const issueCategories = sortedCategories.map(([cat]) => cat);

      const overlap = analyzeCrossCategoryOverlap(
        cluster.categoryCounts,
        hotspotRadiusMeters,
      );
      const metrics = computeRecurrenceAndSeverity(
        cluster.complaints,
        overlap.hasCrossCategoryOverlap,
      );

      const { city, ward, zone } = resolveClusterWard(cluster.complaints, centroid);

      const avgSpread = complaintCount > 0 ? totalDist / complaintCount : 0;
      const compactnessBonus =
        clusterDistanceMeters > 0
          ? Math.max(0, 1 - avgSpread / Math.max(1, clusterDistanceMeters)) * 0.14
          : 0.08;
      const countBonus = Math.min(0.18, (complaintCount - 1) * 0.055);
      const confidence = Number(
        Math.min(0.98, 0.64 + compactnessBonus + countBonus).toFixed(2),
      );

      const shortWard = String(ward || "Municipal Sector").split(" - ")[0];
      const title = overlap.hasCrossCategoryOverlap
        ? `${shortWard}: ${overlap.overlapCategories.slice(0, 2).map(formatCategoryLabel).join(" + ")} Overlap`
        : `${shortWard}: ${formatCategoryLabel(dominantCategory)} Cluster`;

      return {
        clusterId: cluster.clusterId,
        title,
        city,
        ward,
        zone,
        complaintCount,
        openCount: metrics.openCount,
        centroid,
        radiusMeters: hotspotRadiusMeters,
        densityPerSqKm,
        dominantCategory,
        issueCategories,
        categoryCounts: cluster.categoryCounts,
        recurrenceScore: metrics.recurrenceScore,
        confidence,
        severity: metrics.severity,
        hasCrossCategoryOverlap: overlap.hasCrossCategoryOverlap,
        overlapCategories: overlap.overlapCategories,
        overlapSummary: overlap.overlapSummary,
        firstReportedAt: metrics.firstReportedAt,
        lastReportedAt: metrics.lastReportedAt,
        complaints: cluster.complaints,
      };
    })
    .sort((a, b) => {
      if (b.hasCrossCategoryOverlap !== a.hasCrossCategoryOverlap) {
        return Number(b.hasCrossCategoryOverlap) - Number(a.hasCrossCategoryOverlap);
      }
      return b.complaintCount - a.complaintCount;
    });

  const crossCategoryOverlaps = clusters
    .filter((c) => c.hasCrossCategoryOverlap)
    .map((c) => ({
      clusterId: c.clusterId,
      title: c.title,
      city: c.city,
      ward: c.ward,
      overlapCategories: c.overlapCategories,
      overlapSummary: c.overlapSummary,
      complaintCount: c.complaintCount,
      severity: c.severity,
      centroid: c.centroid,
    }));

  const clusteredComplaintCount = clusters.reduce(
    (total, cluster) => total + cluster.complaintCount,
    0,
  );

  return {
    center:
      options.latitude != null && options.longitude != null
        ? {
            latitude: options.latitude,
            longitude: options.longitude,
          }
        : null,
    radiusMeters: options.radiusMeters ?? null,
    clusterDistanceMeters,
    minClusterSize,
    timeWindowDays: options.timeWindowDays ?? null,
    totalComplaintsAnalyzed: rows.length,
    clusterCount: clusters.length,
    clusteredComplaintCount,
    excludedComplaintCount: rows.length - clusteredComplaintCount,
    crossCategoryOverlapCount: crossCategoryOverlaps.length,
    crossCategoryOverlaps,
    clusters,
  };
}

module.exports = {
  clusterComplaints,
  analyzeCrossCategoryOverlap,
};
