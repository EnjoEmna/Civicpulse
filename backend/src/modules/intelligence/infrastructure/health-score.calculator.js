const CLOSED_STATUSES = new Set(["RESOLVED", "REJECTED"]);

const ASSET_CATEGORY_RULES = {
  ROAD_SEGMENT: {
    label: "Road Segment",
    defaultDepartment: "Roads & Public Works",
    directCategories: ["ROAD"],
    crossImpactCategories: ["WATER_SUPPLY", "DRAINAGE"],
    keywords: ["road", "pothole", "asphalt", "pavement", "culvert", "junction", "bus stop", "crater"],
  },
  WATER_PIPELINE: {
    label: "Water Pipeline",
    defaultDepartment: "Water Supply & Drainage",
    directCategories: ["WATER_SUPPLY"],
    crossImpactCategories: ["ROAD"],
    keywords: ["water", "pipeline", "pipe", "leak", "leakage", "seepage", "pressure", "burst"],
  },
  DRAINAGE: {
    label: "Drainage Asset",
    defaultDepartment: "Water Supply & Drainage",
    directCategories: ["WATER_SUPPLY", "DRAINAGE"],
    crossImpactCategories: ["SANITATION", "ROAD"],
    keywords: ["drain", "drainage", "stormwater", "culvert", "waterlogging", "flood", "sewer"],
  },
  STREETLIGHT_CLUSTER: {
    label: "Streetlight Cluster",
    defaultDepartment: "Electricity & Street Lighting",
    directCategories: ["ELECTRICITY"],
    crossImpactCategories: ["PUBLIC_SAFETY"],
    keywords: ["streetlight", "street light", "lamp", "electric pole", "light", "dark", "outage"],
  },
  WASTE_POINT: {
    label: "Garbage Collection Point",
    defaultDepartment: "Sanitation & Solid Waste",
    directCategories: ["SANITATION"],
    crossImpactCategories: ["PUBLIC_SAFETY"],
    keywords: ["garbage", "waste", "trash", "bin", "dump", "sanitation", "overflow"],
  },
};

const PENALTY_CAPS = {
  complaintImpact: 28,
  recurrence: 22,
  severity: 20,
  unresolvedDuration: 15,
  maintenanceAge: 15,
};

const PRIORITY_WEIGHTS = {
  CRITICAL: 7.5,
  HIGH: 4.8,
  MEDIUM: 2.2,
  LOW: 0.9,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function deriveHealthGrade(score) {
  if (score >= 80) return "GOOD";
  if (score >= 60) return "FAIR";
  if (score >= 40) return "POOR";
  return "CRITICAL";
}

function evaluateComplaintAssetMatch(asset, complaint, distanceMeters) {
  const rules = ASSET_CATEGORY_RULES[asset.asset_type] || ASSET_CATEGORY_RULES.ROAD_SEGMENT;
  const maxRadius = Number(asset.catchment_radius_meters || 250);
  const canonicalCat = String(complaint.canonical_category || complaint.category || "OTHER").toUpperCase();
  const rawCat = String(complaint.category || canonicalCat).toUpperCase();
  const textBlob = `${complaint.title || ""} ${complaint.description || ""} ${complaint.address || ""}`.toLowerCase();

  const cityMismatch =
    asset.city &&
    complaint.city &&
    asset.city.toLowerCase() !== "general jurisdiction" &&
    complaint.city.toLowerCase() !== "general jurisdiction" &&
    asset.city.toLowerCase() !== complaint.city.toLowerCase();

  if (cityMismatch) {
    return null;
  }

  const sameWard =
    Boolean(asset.ward && complaint.ward) &&
    asset.ward.toLowerCase() === complaint.ward.toLowerCase();

  const hasCoordDistance = distanceMeters !== null && Number.isFinite(distanceMeters);
  const effectiveWardRadius = Math.max(maxRadius, 1200);

  if (hasCoordDistance) {
    if (distanceMeters > (sameWard ? effectiveWardRadius : maxRadius)) {
      return null;
    }
  } else if (!sameWard) {
    return null;
  }

  const hasKeywordMatch = rules.keywords.some((kw) => textBlob.includes(kw));

  // If a complaint originated under a cross-impact category (e.g., water seepage affecting a road),
  // surface that synergy clearly as CROSS_IMPACT on the road asset rather than hiding the water signal.
  const crossMatchedCat =
    rules.crossImpactCategories.find((c) => c === rawCat) ||
    rules.crossImpactCategories.find((c) => c === canonicalCat) ||
    null;

  if (
    asset.asset_type === "ROAD_SEGMENT" &&
    rawCat === "WATER_SUPPLY" &&
    crossMatchedCat
  ) {
    const crossLimit = Math.min(220, maxRadius);
    if (hasCoordDistance && distanceMeters <= crossLimit) {
      return {
        linkType: "CROSS_IMPACT",
        distanceMeters: round1(distanceMeters),
        confidence: Number(clamp(0.9 - distanceMeters / (crossLimit * 2), 0.6, 0.94).toFixed(2)),
        reason: `Nearby ${rawCat.toLowerCase().replace(/_/g, " ")} impact within ${Math.round(distanceMeters)}m`,
      };
    }
  }

  const directCat =
    rules.directCategories.find((c) => c === canonicalCat) ||
    rules.directCategories.find((c) => c === rawCat) ||
    null;

  if (directCat) {
    // Disambiguate WATER_PIPELINE vs DRAINAGE when both share WATER_SUPPLY category
    if (directCat === "WATER_SUPPLY" && asset.asset_type === "DRAINAGE") {
      const drainageSignal = /(drain|stormwater|culvert|waterlogging|flood|sewer|clog)/i.test(textBlob);
      if (!drainageSignal && hasCoordDistance && distanceMeters > 120) {
        return null;
      }
    }
    if (directCat === "WATER_SUPPLY" && asset.asset_type === "WATER_PIPELINE") {
      const drainOnlySignal =
        /(stormwater|culvert|drain overflow)/i.test(textBlob) &&
        !/(pipe|pipeline|drinking water|water supply|leak)/i.test(textBlob);
      if (drainOnlySignal && hasCoordDistance && distanceMeters > 120) {
        return null;
      }
    }

    const baseConf = hasCoordDistance
      ? clamp(1 - distanceMeters / Math.max(effectiveWardRadius * 1.4, 350), 0.55, 0.98)
      : 0.72;
    const confidence = round1(hasKeywordMatch ? Math.min(0.99, baseConf + 0.08) : baseConf);

    return {
      linkType: "DIRECT",
      distanceMeters: hasCoordDistance ? round1(distanceMeters) : null,
      confidence: Number(confidence.toFixed(2)),
      reason: `Matched ${rules.label.toLowerCase()} direct issue (${directCat.toLowerCase().replace(/_/g, " ")})`,
    };
  }

  if (crossMatchedCat) {
    const crossLimit = Math.min(220, maxRadius);
    if (hasCoordDistance && distanceMeters <= crossLimit) {
      return {
        linkType: "CROSS_IMPACT",
        distanceMeters: round1(distanceMeters),
        confidence: Number(clamp(0.88 - distanceMeters / (crossLimit * 2), 0.55, 0.92).toFixed(2)),
        reason: `Nearby ${crossMatchedCat.toLowerCase().replace(/_/g, " ")} impact within ${Math.round(distanceMeters)}m`,
      };
    }
  }

  return null;
}

function computeAssetHealthScore({
  asset,
  linkedComplaints = [],
  maintenanceEvents = [],
  inActiveHotspot = false,
  previousScore = null,
  now = new Date(),
}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const monthMs = 30 * dayMs;

  const directComplaints = linkedComplaints.filter(
    (c) => (c.link_type || c.linkType || "DIRECT") !== "CROSS_IMPACT",
  );
  const crossImpactComplaints = linkedComplaints.filter(
    (c) => (c.link_type || c.linkType) === "CROSS_IMPACT",
  );

  // Determine most recent effective maintenance timestamp
  const completedMaintenanceDates = maintenanceEvents
    .filter((ev) => String(ev.outcome || "").toUpperCase() === "COMPLETED")
    .filter((ev) =>
      ["REPAIR", "RESURFACING", "REPLACEMENT", "CLEANING", "PREVENTIVE_MAINTENANCE"].includes(
        String(ev.event_type || "").toUpperCase(),
      ),
    )
    .map((ev) => new Date(ev.performed_at || ev.created_at).getTime())
    .filter((ts) => Number.isFinite(ts));

  if (asset.last_maintained_at) {
    const baseMaint = new Date(asset.last_maintained_at).getTime();
    if (Number.isFinite(baseMaint)) completedMaintenanceDates.push(baseMaint);
  }
  if (completedMaintenanceDates.length === 0 && asset.install_date) {
    const installTs = new Date(asset.install_date).getTime();
    if (Number.isFinite(installTs)) completedMaintenanceDates.push(installTs);
  }

  const latestMaintenanceMs =
    completedMaintenanceDates.length > 0 ? Math.max(...completedMaintenanceDates) : null;

  const openLinked = [];
  const resolvedLinked = [];
  let recent30dCount = 0;
  let upvoteTotal = 0;

  for (const c of linkedComplaints) {
    const statusUpper = String(c.status || "").toUpperCase();
    const isCross = (c.link_type || c.linkType) === "CROSS_IMPACT";
    const weightFactor = isCross ? 0.6 : 1.0;

    const createdMs = new Date(c.created_at || c.createdAt || nowMs).getTime();
    const ageDays = Number.isFinite(createdMs) ? Math.max(0, (nowMs - createdMs) / dayMs) : 0;

    // Historical complaints resolved BEFORE the latest resurfacing/replacement do not linger indefinitely
    const resolvedBeforeMaintenance =
      CLOSED_STATUSES.has(statusUpper) &&
      latestMaintenanceMs !== null &&
      Number.isFinite(createdMs) &&
      createdMs < latestMaintenanceMs;

    if (CLOSED_STATUSES.has(statusUpper)) {
      if (!resolvedBeforeMaintenance) {
        resolvedLinked.push({ ...c, weightFactor, ageDays });
      }
    } else {
      openLinked.push({ ...c, weightFactor, ageDays });
    }

    if (ageDays <= 30 && !resolvedBeforeMaintenance) {
      recent30dCount += 1;
    }

    upvoteTotal += Number(c.upvote_count || c.upvotes || 0);
  }

  // 1. Complaint Impact Penalty (max 28)
  const openWeightedSum = openLinked.reduce((acc, c) => acc + 6.0 * c.weightFactor, 0);
  const resolvedWeightedSum = Math.min(
    6,
    resolvedLinked.reduce((acc, c) => acc + 1.0 * c.weightFactor, 0),
  );
  const upvoteBoost = Math.min(4, upvoteTotal * 0.45);
  const complaintImpactPenalty = round1(
    clamp(openWeightedSum + resolvedWeightedSum + upvoteBoost, 0, PENALTY_CAPS.complaintImpact),
  );

  // 2. Recurrence & Overlap Penalty (max 22)
  const repeatIncidents = Math.max(0, recent30dCount - 1);
  const crossOpenCount = crossImpactComplaints.filter(
    (c) => !CLOSED_STATUSES.has(String(c.status || "").toUpperCase()),
  ).length;
  const recurrenceRaw =
    repeatIncidents * 4.8 +
    Math.min(7, crossOpenCount * 3.5) +
    (inActiveHotspot ? 3.5 : 0);
  const recurrencePenalty = round1(clamp(recurrenceRaw, 0, PENALTY_CAPS.recurrence));

  // 3. Severity Penalty (max 20)
  const severityRaw = openLinked.reduce((acc, c) => {
    const prio = String(c.effective_priority || c.ai_priority || c.priority || "MEDIUM").toUpperCase();
    const pts = PRIORITY_WEIGHTS[prio] ?? PRIORITY_WEIGHTS.MEDIUM;
    return acc + pts * c.weightFactor;
  }, 0);
  const severityPenalty = round1(clamp(severityRaw, 0, PENALTY_CAPS.severity));

  // 4. Unresolved Duration Penalty (max 15)
  let maxOpenAgeDays = 0;
  let avgOpenAgeDays = 0;
  let unresolvedDurationPenalty = 0;
  if (openLinked.length > 0) {
    maxOpenAgeDays = Math.max(...openLinked.map((c) => c.ageDays));
    avgOpenAgeDays =
      openLinked.reduce((acc, c) => acc + c.ageDays, 0) / openLinked.length;
    const blendedDays = 0.6 * maxOpenAgeDays + 0.4 * avgOpenAgeDays;
    unresolvedDurationPenalty = round1(
      clamp(blendedDays * 0.75, 0, PENALTY_CAPS.unresolvedDuration),
    );
  }

  // 5. Maintenance Age Penalty (max 15)
  const maintenanceAgeMonths =
    latestMaintenanceMs !== null
      ? Math.max(0, (nowMs - latestMaintenanceMs) / monthMs)
      : 10; // Unknown / unrecorded maintenance defaults to 10 months baseline risk
  const maintenanceAgePenalty = round1(
    clamp(maintenanceAgeMonths * 1.25, 0, PENALTY_CAPS.maintenanceAge),
  );

  const totalPenalty = round1(
    complaintImpactPenalty +
      recurrencePenalty +
      severityPenalty +
      unresolvedDurationPenalty +
      maintenanceAgePenalty,
  );

  const healthScore = clamp(Math.round(100 - totalPenalty), 0, 100);
  const healthGrade = deriveHealthGrade(healthScore);

  let trend = "STABLE";
  const hasPrev = previousScore !== null && Number.isFinite(Number(previousScore));
  const delta = hasPrev ? healthScore - Number(previousScore) : 0;

  if (hasPrev && delta >= 3) {
    trend = "IMPROVING";
  } else if (hasPrev && delta <= -3) {
    trend = "DETERIORATING";
  } else if (
    openLinked.length >= 2 ||
    (crossOpenCount > 0 && healthScore < 65)
  ) {
    trend = "DETERIORATING";
  } else if (
    latestMaintenanceMs !== null &&
    (nowMs - latestMaintenanceMs) / dayMs <= 30 &&
    openLinked.length === 0 &&
    (!hasPrev || delta >= 0)
  ) {
    trend = "IMPROVING";
  }

  return {
    healthScore,
    healthGrade,
    trend,
    complaintCount: linkedComplaints.length,
    directComplaintCount: directComplaints.length,
    crossImpactCount: crossImpactComplaints.length,
    openComplaintCount: openLinked.length,
    recurrenceCount: repeatIncidents,
    scoreBreakdown: {
      baseScore: 100,
      complaintImpactPenalty,
      recurrencePenalty,
      severityPenalty,
      unresolvedDurationPenalty,
      maintenanceAgePenalty,
      totalPenalty,
      caps: PENALTY_CAPS,
      factors: {
        directCount: directComplaints.length,
        crossImpactCount: crossImpactComplaints.length,
        openCount: openLinked.length,
        resolvedActiveCount: resolvedLinked.length,
        recent30dCount,
        upvoteTotal,
        maxOpenAgeDays: round1(maxOpenAgeDays),
        avgOpenAgeDays: round1(avgOpenAgeDays),
        maintenanceAgeMonths: round1(maintenanceAgeMonths),
        inActiveHotspot: Boolean(inActiveHotspot),
      },
    },
  };
}

module.exports = {
  ASSET_CATEGORY_RULES,
  PENALTY_CAPS,
  CLOSED_STATUSES,
  deriveHealthGrade,
  evaluateComplaintAssetMatch,
  computeAssetHealthScore,
};
