const copilotRepository = require("../../repositories/copilot.repository");
const agentOrchestrator = require("../intelligence/agents/agent-orchestrator.service");
const infrastructureService = require("../intelligence/infrastructure/infrastructure.service");
const graphService = require("../intelligence/graph/graph.service");
const hotspotService = require("../intelligence/spatial/hotspot.service");
const { NON_CAUSAL_LABEL } = require("../intelligence/agents/grounding.validator");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getTimeGreeting(officerName) {
  const hour = new Date().getHours();
  const prefix =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return officerName ? `${prefix}, ${officerName}` : prefix;
}

function detectQuestionIntent(question = "") {
  const q = String(question || "").toLowerCase();
  if (
    /\b(inspect|before|repair|pre-repair|prevent|sequence|first|action|recommend|fix|steps?)\b/.test(
      q,
    )
  ) {
    return "PRE_REPAIR_STEPS";
  }
  if (/\b(why|cause|causal|repeat|repeatedly|recurring|reason|happening|contributing)\b/.test(q)) {
    return "WHY_REPEATED";
  }
  if (/\b(similar|pattern|ward|hotspot|cluster|overlap|nearby)\b/.test(q)) {
    return "SIMILAR_PATTERNS";
  }
  if (/\b(attention|priority|today|digest|worst|critical|urgent|backlog)\b/.test(q)) {
    return "DAILY_PRIORITY";
  }
  if (/\b(evidence|proof|score|breakdown|maintenance|complaint|ticket|history)\b/.test(q)) {
    return "EVIDENCE_BREAKDOWN";
  }
  return "GENERAL";
}

function serializeSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    officerId: row.officer_id,
    officerName: row.officer_name || null,
    officerEmail: row.officer_email || null,
    title: row.title,
    city: row.city || null,
    targetType: row.target_type || null,
    targetId: row.target_id || null,
    messageCount: row.message_count != null ? Number(row.message_count) : undefined,
    lastMessagePreview: row.last_message_preview || null,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeMessage(row, recommendations = []) {
  if (!row) return null;
  const payload =
    row.structured_payload && typeof row.structured_payload === "object"
      ? row.structured_payload
      : {};
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    agentRunId: row.agent_run_id || null,
    latencyMs: Number(row.latency_ms || 0),
    structuredPayload: payload,
    recommendations,
    createdAt: row.created_at,
  };
}

function deriveSessionTitle(question, resolvedTarget) {
  if (resolvedTarget?.targetId && resolvedTarget?.targetType === "ASSET") {
    return `Investigate ${resolvedTarget.targetId}`;
  }
  if (resolvedTarget?.targetId && resolvedTarget?.targetType === "COMPLAINT") {
    return `Complaint ${resolvedTarget.targetId}`;
  }
  const cleaned = String(question || "").trim().replace(/\s+/g, " ");
  return cleaned.length > 72 ? `${cleaned.slice(0, 69)}...` : cleaned || "Copilot Investigation";
}

function buildConversationalResponse({
  question,
  orchestration,
}) {
  const report = orchestration.report || {};
  const asset = report.infrastructureSummary || null;
  const upstream = Array.isArray(report.upstreamContributingAssets)
    ? report.upstreamContributingAssets
    : [];
  const hotspots = report.spatialSummary?.focalHotspots || [];
  const focalComplaint = report.complaintSummary?.focalComplaint || null;
  const complaints = report.complaintSummary?.keyCitizenReports || [];
  const recs = orchestration.recommendations || [];
  const stepRuns = orchestration.stepRuns || [];
  const grounding = orchestration.groundingReport || {
    passed: true,
    checkedFactCount: 0,
    groundedFactCount: 0,
    unsupportedClaimCount: 0,
    groundingScore: 1,
    unsupportedClaims: [],
  };

  const intent = detectQuestionIntent(question);
  const paragraphs = [];

  if (intent === "PRE_REPAIR_STEPS" && asset) {
    if (upstream.length > 0) {
      const up = upstream[0];
      paragraphs.push(
        `Before scheduling permanent resurfacing or repair on **${asset.assetCode}** (${asset.name}), inspect **${up.assetCode}** (${up.name}) located ${up.distanceMeters != null ? `${up.distanceMeters}m` : "nearby"} (${up.healthScore ?? "N/A"}/100, ${up.upstreamOpenComplaints || 0} open report(s)). Graph analysis identifies this co-located asset as a **${NON_CAUSAL_LABEL}**.`,
      );
    } else {
      paragraphs.push(
        `For **${asset.assetCode}** (${asset.healthScore}/100 · ${asset.healthGrade}), perform an on-site engineering inspection across all ${asset.openComplaintCount} open complaint location(s) before closing the maintenance work order (last serviced ${asset.maintenanceAgeMonths != null ? `${asset.maintenanceAgeMonths} months ago` : "date unrecorded"}).`,
      );
    }
    if (recs.length > 0) {
      paragraphs.push(
        `Recommended action plan (${recs.length} proposal(s) queued for your confirmation): ${recs
          .slice(0, 2)
          .map((r) => `**${r.actionTitle}**`)
          .join("; ")}.`,
      );
    }
  } else if (intent === "SIMILAR_PATTERNS" && (hotspots.length > 0 || asset)) {
    if (hotspots.length > 0) {
      const hs = hotspots[0];
      paragraphs.push(
        `**Spatial Pattern Alert**: Active cluster **"${hs.title}"** in ${hs.ward || report.resolvedTarget?.city || "this ward"} concentrates **${hs.complaintCount} citizen reports** (${hs.openCount} open, ${hs.densityPerSqKm} reports/sq.km)${hs.hasCrossCategoryOverlap ? ` with cross-category overlap across ${(hs.overlapCategories || []).join(", ")}` : ""}.`,
      );
    }
    if (upstream.length > 0) {
      paragraphs.push(
        `Co-located infrastructure overlap includes **${upstream[0].assetCode}** tagged as **${NON_CAUSAL_LABEL}** (${upstream[0].distanceMeters ?? "co-located"}m proximity).`,
      );
    } else if (report.executiveSummary) {
      paragraphs.push(report.executiveSummary);
    }
  } else {
    if (report.executiveSummary) {
      paragraphs.push(report.executiveSummary);
    }
    if (
      asset &&
      asset.scoreBreakdown &&
      (intent === "WHY_REPEATED" || intent === "EVIDENCE_BREAKDOWN")
    ) {
      const b = asset.scoreBreakdown;
      paragraphs.push(
        `Deterministic health factors for **${asset.assetCode}** (**${asset.healthScore}/100 · ${asset.healthGrade}**, trend ${asset.trend}): Complaint impact penalty **-${b.complaintImpactPenalty ?? 0}**, recurrence/overlap **-${b.recurrencePenalty ?? 0}**, severity **-${b.severityPenalty ?? 0}**, unresolved duration **-${b.unresolvedDurationPenalty ?? 0}**, and maintenance age **-${b.maintenanceAgePenalty ?? 0}** (last maintenance ${asset.maintenanceAgeMonths != null ? `${asset.maintenanceAgeMonths} months ago` : "unrecorded"}).`,
      );
    }
    if (recs.length > 0) {
      paragraphs.push(
        `Prepared **${recs.length} grounded action proposal(s)** awaiting officer confirmation below (Accept / Modify / Reject).`,
      );
    }
  }

  if (paragraphs.length === 0) {
    paragraphs.push(
      "Investigation completed using deterministic infrastructure, spatial, complaint, and knowledge-graph tools.",
    );
  }

  const focusLabel =
    asset?.assetCode ||
    focalComplaint?.referenceId ||
    report.resolvedTarget?.city ||
    "this zone";

  const suggestedFollowUps = [];
  if (asset) {
    if (upstream.length > 0) {
      suggestedFollowUps.push(
        `What pre-repair checks are needed on ${upstream[0].assetCode} before repairing ${asset.assetCode}?`,
      );
    }
    suggestedFollowUps.push(
      `Show maintenance history and penalty breakdown for ${asset.assetCode}`,
    );
    suggestedFollowUps.push(
      `Which citizen complaints and hotspots affect ${asset.ward || asset.city}?`,
    );
  } else if (focalComplaint) {
    suggestedFollowUps.push(
      `What infrastructure assets and hotspots are connected to ${focalComplaint.referenceId}?`,
    );
    suggestedFollowUps.push(
      `Find similar recurring complaints in ${focalComplaint.city || "this city"}`,
    );
    suggestedFollowUps.push("What needs highest priority attention today?");
  } else {
    suggestedFollowUps.push(`What needs highest priority attention in ${focusLabel}?`);
    suggestedFollowUps.push("Why is RD-HYD-1024 repeatedly receiving complaints?");
    suggestedFollowUps.push("Which wards show cross-category spatial overlaps?");
  }

  const explainability = {
    headline: report.headline || "Copilot Investigation",
    intent,
    resolvedTarget: report.resolvedTarget || null,
    keyFindings: Array.isArray(report.keyFindings) ? report.keyFindings : [],
    primaryAsset: asset
      ? {
          id: asset.id,
          assetCode: asset.assetCode,
          name: asset.name,
          assetType: asset.assetType,
          city: asset.city,
          ward: asset.ward,
          department: asset.department,
          healthScore: asset.healthScore,
          healthGrade: asset.healthGrade,
          trend: asset.trend,
          openComplaintCount: asset.openComplaintCount,
          complaintCount: asset.complaintCount,
          maintenanceAgeMonths: asset.maintenanceAgeMonths,
          scoreBreakdown: asset.scoreBreakdown || null,
        }
      : null,
    healthTrajectory: asset?.healthTrajectory || [],
    maintenanceHistory: asset?.maintenanceEvents || [],
    potentialContributingAssets: upstream,
    evidenceChains: Array.isArray(report.evidenceChains) ? report.evidenceChains : [],
    shortestPathExample: report.shortestPathExample || null,
    supportingComplaints: complaints.slice(0, 6),
    focalComplaint,
    spatialHotspots: hotspots,
    prioritySummary: report.prioritySummary || null,
    guardrails: report.guardrails || {
      deterministicMathOnly: true,
      readOnlyToolsOnly: true,
      humanConfirmationRequired: true,
      nonCausalInferenceEnforced: true,
    },
    groundingReport: grounding,
    stepRunsSummary: stepRuns.map((s) => ({
      stepOrder: s.stepOrder,
      agentName: s.agentName,
      status: s.status,
      durationMs: s.durationMs,
      toolCallsCount: s.toolCallsCount,
      validToolCallsCount: s.validToolCallsCount,
      modelName: s.modelName,
    })),
  };

  return {
    answerMarkdown: paragraphs.join("\n\n"),
    suggestedFollowUps: suggestedFollowUps.slice(0, 3),
    explainability,
  };
}

async function getMorningDigest({ city = null, limit = 5, officer = null } = {}) {
  const cleanCity = city && city !== "all" ? city : null;
  const maxItems = Math.min(Math.max(Number(limit) || 5, 1), 10);

  const [infraOverview, hotspotsRes, recsRes] = await Promise.all([
    infrastructureService.getInfrastructureOverview({
      city: cleanCity,
      sortBy: "lowest_health",
      limit: 25,
    }),
    hotspotService.listSavedHotspots({
      city: cleanCity,
      status: "ACTIVE",
      limit: 15,
    }),
    agentOrchestrator.listRecommendations({
      city: cleanCity,
      limit: 40,
    }),
  ]);

  const allAssets = infraOverview?.assets || [];
  const activeHotspots = hotspotsRes?.hotspots || [];
  const allRecs = recsRes?.recommendations || [];
  const pendingRecs = allRecs.filter((r) => r.decisionStatus === "PENDING");

  const priorityCandidates = allAssets.filter(
    (a) =>
      a.healthGrade === "CRITICAL" ||
      a.healthGrade === "POOR" ||
      a.openComplaintCount > 0 ||
      (a.maintenanceAgeMonths ?? 0) >= 6,
  );
  const selectedAssets = (
    priorityCandidates.length > 0 ? priorityCandidates : allAssets
  ).slice(0, maxItems);

  const priorityItems = await Promise.all(
    selectedAssets.map(async (asset, idx) => {
      let graphInvestigation = null;
      try {
        graphInvestigation = await graphService.investigateAsset(asset.assetCode, {
          includeInferred: true,
        });
      } catch {
        graphInvestigation = null;
      }

      const contributingAssets = (
        graphInvestigation?.potentialContributingAssets || []
      )
        .slice(0, 2)
        .map((up) => ({
          assetCode: up.assetCode,
          name: up.name,
          assetType: up.assetType,
          healthScore: up.healthScore,
          healthGrade: up.healthGrade,
          distanceMeters:
            up.distanceMeters != null ? Math.round(up.distanceMeters) : null,
          confidence: up.confidence,
          relationshipLabel: NON_CAUSAL_LABEL,
          disclaimer:
            up.disclaimer ||
            "Potential co-located contributor; inspect upstream asset before repair.",
        }));

      const matchingHotspot =
        activeHotspots.find(
          (h) =>
            h.ward &&
            asset.ward &&
            h.ward.toLowerCase() === asset.ward.toLowerCase(),
        ) || null;

      const linkedRec =
        pendingRecs.find(
          (r) =>
            r.assetId === asset.id ||
            (r.targetId &&
              r.targetId.toUpperCase() === String(asset.assetCode || "").toUpperCase()),
        ) || null;

      const reasons = [];
      if (asset.healthGrade === "CRITICAL" || asset.healthGrade === "POOR") {
        reasons.push(`Health ${asset.healthScore}/100 (${asset.healthGrade})`);
      }
      if (asset.openComplaintCount > 0) {
        reasons.push(`${asset.openComplaintCount} open complaint(s)`);
      }
      if ((asset.maintenanceAgeMonths ?? 0) >= 6) {
        reasons.push(`Maintenance overdue (${asset.maintenanceAgeMonths} mo)`);
      }
      if (contributingAssets.length > 0) {
        reasons.push(
          `${NON_CAUSAL_LABEL}: ${contributingAssets[0].assetCode}`,
        );
      }

      return {
        rank: idx + 1,
        assetId: asset.id,
        assetCode: asset.assetCode,
        name: asset.name,
        assetType: asset.assetType,
        city: asset.city,
        ward: asset.ward,
        department: asset.department,
        healthScore: asset.healthScore,
        healthGrade: asset.healthGrade,
        trend: asset.trend,
        openComplaintCount: asset.openComplaintCount,
        recurrenceCount: asset.recurrenceCount,
        maintenanceAgeMonths: asset.maintenanceAgeMonths,
        scoreBreakdown: asset.scoreBreakdown || null,
        whyItNeedsAttention:
          reasons.join(" · ") ||
          `Priority asset scoring ${asset.healthScore}/100 in ${asset.ward || asset.city}`,
        potentialContributingAssets: contributingAssets,
        matchingHotspot: matchingHotspot
          ? {
              id: matchingHotspot.id,
              hotspotKey: matchingHotspot.hotspotKey,
              title: matchingHotspot.title,
              complaintCount: matchingHotspot.complaintCount,
              openCount: matchingHotspot.openCount,
              hasCrossCategoryOverlap: matchingHotspot.hasCrossCategoryOverlap,
              overlapCategories: matchingHotspot.overlapCategories || [],
            }
          : null,
        pendingRecommendation: linkedRec,
        suggestedPrompt:
          contributingAssets.length > 0
            ? `Why is ${asset.assetCode} repeatedly receiving complaints and what should be checked on ${contributingAssets[0].assetCode}?`
            : `Why is ${asset.assetCode} showing ${asset.healthGrade} health and what actions are recommended?`,
      };
    }),
  );

  const summary = {
    totalAssetsMonitored: infraOverview?.summary?.totalAssets ?? allAssets.length,
    criticalCount: infraOverview?.summary?.gradeCounts?.CRITICAL ?? 0,
    poorCount: infraOverview?.summary?.gradeCounts?.POOR ?? 0,
    overdueMaintenanceCount:
      infraOverview?.summary?.maintenanceOverdueCount ?? 0,
    activeHotspotsCount: hotspotsRes?.activeCount ?? activeHotspots.length,
    crossCategoryOverlapCount: hotspotsRes?.crossCategoryOverlapCount ?? 0,
    pendingRecommendationsCount: pendingRecs.length,
  };

  return {
    greeting: getTimeGreeting(officer?.name),
    dateLabel: new Date().toISOString().slice(0, 10),
    city: cleanCity,
    attentionCount: priorityItems.length,
    digestSummary:
      priorityItems.length > 0
        ? `${priorityItems.length} priority infrastructure zone(s) need attention today (${summary.criticalCount} critical, ${summary.poorCount} poor, ${summary.pendingRecommendationsCount} pending AI proposal(s)).`
        : "No critical infrastructure alerts require immediate triage right now.",
    nonCausalGuardrail:
      "Cross-infrastructure connections are flagged as Potential Relationship (Non-Causal) and require field inspection before civil work.",
    summary,
    priorityItems,
    pendingRecommendations: pendingRecs.slice(0, 10),
    generatedAt: new Date().toISOString(),
  };
}

async function askCopilot({
  question,
  sessionId = null,
  targetType = null,
  targetId = null,
  assetCode = null,
  complaintId = null,
  city = null,
  ward = null,
  includeInferred = true,
  useGemini = false,
  officer = null,
}) {
  const startedAt = Date.now();
  let sessionRow = null;

  if (sessionId) {
    if (!UUID_REGEX.test(sessionId)) {
      const err = new Error("Copilot session not found");
      err.statusCode = 404;
      err.code = "COPILOT_SESSION_NOT_FOUND";
      throw err;
    }
    sessionRow = await copilotRepository.findSessionById(sessionId);
    if (!sessionRow) {
      const err = new Error("Copilot session not found");
      err.statusCode = 404;
      err.code = "COPILOT_SESSION_NOT_FOUND";
      throw err;
    }
    if (
      officer?.role !== "ADMIN" &&
      sessionRow.officer_id &&
      officer?.id &&
      sessionRow.officer_id !== officer.id
    ) {
      const err = new Error("You do not have access to this Copilot session");
      err.statusCode = 403;
      err.code = "FORBIDDEN";
      throw err;
    }
  }

  // Inherit focal context on multi-turn follow-up queries unless overridden
  const effectiveCity =
    city && city !== "all" ? city : sessionRow?.city || null;
  const effectiveAssetCode =
    assetCode ||
    (!complaintId &&
    !targetId &&
    sessionRow?.target_type === "ASSET" &&
    !/\b(?:RD|WP|DR|SL|SN)-[A-Z]{2,5}-\d+\b/i.test(question) &&
    !/\bCP-\d{4}-\d{3,}\b/i.test(question)
      ? sessionRow.target_id
      : null);
  const effectiveComplaintId =
    complaintId ||
    (!effectiveAssetCode &&
    !targetId &&
    sessionRow?.target_type === "COMPLAINT" &&
    !/\b(?:RD|WP|DR|SL|SN)-[A-Z]{2,5}-\d+\b/i.test(question) &&
    !/\bCP-\d{4}-\d{3,}\b/i.test(question)
      ? sessionRow.target_id
      : null);

  if (!sessionRow) {
    sessionRow = await copilotRepository.createSession({
      officerId: officer?.id,
      title: deriveSessionTitle(question, { targetType, targetId: assetCode || complaintId || targetId }),
      city: effectiveCity,
      targetType: targetType || null,
      targetId: effectiveAssetCode || effectiveComplaintId || targetId || null,
    });
  }

  const userMsgRow = await copilotRepository.createMessage({
    sessionId: sessionRow.id,
    role: "USER",
    content: question.trim(),
    structuredPayload: {
      targetType: targetType || null,
      targetId: effectiveAssetCode || effectiveComplaintId || targetId || null,
      city: effectiveCity,
    },
    latencyMs: 0,
  });

  const orchestration = await agentOrchestrator.orchestrateInvestigation({
    question: question.trim(),
    targetType: targetType || undefined,
    targetId: targetId || undefined,
    assetCode: effectiveAssetCode || undefined,
    complaintId: effectiveComplaintId || undefined,
    city: effectiveCity || undefined,
    ward: ward || undefined,
    includeInferred,
    useGemini,
    initiatedBy: officer?.id || null,
  });

  const responsePayload = buildConversationalResponse({
    question,
    orchestration,
  });

  const latencyMs = Math.max(1, Date.now() - startedAt);
  const assistantMsgRow = await copilotRepository.createMessage({
    sessionId: sessionRow.id,
    role: "COPILOT",
    content: responsePayload.answerMarkdown,
    agentRunId: orchestration.run?.id || null,
    structuredPayload: {
      explainability: responsePayload.explainability,
      suggestedFollowUps: responsePayload.suggestedFollowUps,
      agentRunSummary: orchestration.run
        ? {
            id: orchestration.run.id,
            status: orchestration.run.status,
            durationMs: orchestration.run.durationMs,
            toolCallsCount: orchestration.run.toolCallsCount,
            validToolCallsCount: orchestration.run.validToolCallsCount,
            unsupportedClaimCount: orchestration.run.unsupportedClaimCount,
            modelName: orchestration.run.modelName,
          }
        : null,
    },
    latencyMs,
  });

  const resolvedTarget = orchestration.report?.resolvedTarget || {};
  const nextTitle =
    sessionRow.title === "Copilot Investigation" ||
    !sessionRow.target_id
      ? deriveSessionTitle(question, resolvedTarget)
      : sessionRow.title;

  const updatedSessionRow = await copilotRepository.updateSessionMeta(
    sessionRow.id,
    {
      title: nextTitle,
      city: resolvedTarget.city || effectiveCity || null,
      targetType: resolvedTarget.targetType || null,
      targetId: resolvedTarget.targetId || null,
    },
  );

  return {
    session: serializeSession(updatedSessionRow || sessionRow),
    userMessage: serializeMessage(userMsgRow),
    assistantMessage: serializeMessage(
      assistantMsgRow,
      orchestration.recommendations || [],
    ),
    recommendations: orchestration.recommendations || [],
    agentRun: orchestration.run || null,
  };
}

async function listSessions({ officer = null, city = null, limit = 20 } = {}) {
  const officerScope = officer?.role === "ADMIN" ? null : officer?.id || null;
  const rows = await copilotRepository.listSessionsByOfficer({
    officerId: officerScope,
    city: city && city !== "all" ? city : null,
    limit,
  });

  return {
    total: rows.length,
    sessions: rows.map(serializeSession),
  };
}

async function getSessionDetails(sessionId, { officer = null } = {}) {
  if (!UUID_REGEX.test(sessionId)) {
    const err = new Error("Copilot session not found");
    err.statusCode = 404;
    err.code = "COPILOT_SESSION_NOT_FOUND";
    throw err;
  }

  const session = await copilotRepository.findSessionById(sessionId);
  if (!session) {
    const err = new Error("Copilot session not found");
    err.statusCode = 404;
    err.code = "COPILOT_SESSION_NOT_FOUND";
    throw err;
  }

  if (
    officer?.role !== "ADMIN" &&
    session.officer_id &&
    officer?.id &&
    session.officer_id !== officer.id
  ) {
    const err = new Error("You do not have access to this Copilot session");
    err.statusCode = 403;
    err.code = "FORBIDDEN";
    throw err;
  }

  const msgRows = await copilotRepository.listMessagesBySession(session.id);

  // Hydrate live recommendation statuses for all agent_run_ids present in this thread
  const runIds = [
    ...new Set(msgRows.map((m) => m.agent_run_id).filter(Boolean)),
  ];
  const recsByRunId = new Map();
  await Promise.all(
    runIds.map(async (runId) => {
      try {
        const res = await agentOrchestrator.listRecommendations({
          agentRunId: runId,
          limit: 20,
        });
        recsByRunId.set(runId, res.recommendations || []);
      } catch {
        recsByRunId.set(runId, []);
      }
    }),
  );

  const messages = msgRows.map((m) =>
    serializeMessage(
      m,
      m.agent_run_id ? recsByRunId.get(m.agent_run_id) || [] : [],
    ),
  );

  return {
    session: serializeSession({
      ...session,
      message_count: messages.length,
    }),
    messages,
  };
}

async function decideRecommendation(recommendationId, payload, officer = null) {
  return agentOrchestrator.decideRecommendation(
    recommendationId,
    payload,
    officer,
  );
}

async function getCopilotMetrics({ city = null } = {}) {
  const cleanCity = city && city !== "all" ? city : null;
  const [agentMetrics, usageRaw] = await Promise.all([
    agentOrchestrator.getAgentEvaluationMetrics({ city: cleanCity }),
    copilotRepository.getCopilotUsageStats({ city: cleanCity }),
  ]);

  const s = usageRaw.sessions || {};
  const m = usageRaw.messages || {};

  return {
    ...agentMetrics,
    copilotUsage: {
      totalSessions: Number(s.total_sessions || 0),
      activeSessions24h: Number(s.active_sessions_24h || 0),
      totalMessages: Number(m.total_messages || 0),
      userQueriesCount: Number(m.user_queries_count || 0),
      copilotRepliesCount: Number(m.copilot_replies_count || 0),
      avgCopilotLatencyMs:
        m.avg_copilot_latency_ms != null ? Number(m.avg_copilot_latency_ms) : 0,
    },
  };
}

module.exports = {
  getMorningDigest,
  askCopilot,
  listSessions,
  getSessionDetails,
  decideRecommendation,
  getCopilotMetrics,
};
