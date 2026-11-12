const pool = require("../../../config/database");
const agentRepository = require("../../../repositories/agent.repository");
const aiFeedbackRepository = require("../../../repositories/ai-feedback.repository");
const { createGroundingTrace } = require("./grounding.validator");
const { listToolSchemas } = require("./agent-tools");
const {
  runPriorityAgent,
  runInvestigationAgent,
  runInfrastructureAgent,
  runSpatialAgent,
  runComplaintAgent,
  runRecommendationAgent,
  runReportAgent,
} = require("./specialist-agents");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function serializeAgentRun(row) {
  if (!row) return null;
  const toolCallsCount = Number(row.tool_calls_count || 0);
  const validToolCallsCount = Number(row.valid_tool_calls_count || 0);
  return {
    id: row.id,
    parentRunId: row.parent_run_id || null,
    stepOrder: Number(row.step_order || 0),
    runType: row.run_type,
    agentName: row.agent_name,
    queryText: row.query_text || null,
    targetType: row.target_type || null,
    targetId: row.target_id || null,
    city: row.city || null,
    status: row.status,
    inputs: row.inputs || {},
    toolsUsed: Array.isArray(row.tools_used) ? row.tools_used : [],
    toolCallsCount,
    validToolCallsCount,
    toolAccuracyPercent:
      toolCallsCount > 0
        ? Number(((validToolCallsCount / toolCallsCount) * 100).toFixed(1))
        : 100,
    outputs: row.outputs || {},
    groundingReport: row.grounding_report || {},
    unsupportedClaimCount: Number(row.unsupported_claim_count || 0),
    modelName: row.model_name,
    modelVersion: row.model_version,
    durationMs: Number(row.duration_ms || 0),
    initiatedBy: row.initiated_by || null,
    initiatedByName: row.initiated_by_name || null,
    initiatedByEmail: row.initiated_by_email || null,
    stepCount: row.step_count != null ? Number(row.step_count) : undefined,
    recommendationCount:
      row.recommendation_count != null ? Number(row.recommendation_count) : undefined,
    errorMessage: row.error_message || null,
    createdAt: row.created_at,
  };
}

function serializeRecommendation(row) {
  if (!row) return null;
  return {
    id: row.id,
    agentRunId: row.agent_run_id,
    targetType: row.target_type,
    targetId: row.target_id || null,
    assetId: row.asset_id || null,
    complaintId: row.complaint_id || null,
    hotspotId: row.hotspot_id || null,
    city: row.city || null,
    ward: row.ward || null,
    category: row.category,
    priority: row.priority,
    actionTitle: row.action_title,
    proposedAction: row.proposed_action,
    rationale: row.rationale,
    evidenceCitations: Array.isArray(row.evidence_citations)
      ? row.evidence_citations
      : [],
    confidence: Number(row.confidence ?? 0.85),
    requiresHumanConfirmation: Boolean(row.requires_human_confirmation),
    isNonCausalInferred: Boolean(row.is_non_causal_inferred),
    decisionStatus: row.decision_status,
    decidedBy: row.decided_by || null,
    decidedByName: row.decided_by_name || null,
    decidedByEmail: row.decided_by_email || null,
    modifiedAction: row.modified_action || null,
    decisionNote: row.decision_note || null,
    decidedAt: row.decided_at || null,
    sourceQueryText: row.source_query_text || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sliceStepToolStats(trace, startIndex) {
  const stepCalls = trace.toolCalls.slice(startIndex);
  const validCalls = stepCalls.filter(
    (c) => c.validArgs && (c.status === "SUCCESS" || c.status === "FAILED"),
  );
  return {
    stepCalls,
    toolCallsCount: stepCalls.length,
    validToolCallsCount: validCalls.length,
  };
}

async function orchestrateInvestigation({
  question = null,
  targetType = null,
  targetId = null,
  assetCode = null,
  complaintId = null,
  city = null,
  ward = null,
  includeInferred = true,
  useGemini = false,
  initiatedBy = null,
} = {}) {
  const startedAt = Date.now();
  const trace = createGroundingTrace();

  const effectiveQuestion =
    question ||
    (assetCode
      ? `Investigate infrastructure asset ${assetCode} and repeated complaints`
      : complaintId
        ? `Investigate complaint ${complaintId} and upstream infrastructure context`
        : city
          ? `Prioritize and investigate highest-risk civic infrastructure in ${city}`
          : "Identify highest-priority civic infrastructure risk and actionable next steps");

  const inputPayload = {
    question: effectiveQuestion,
    targetType,
    targetId,
    assetCode,
    complaintId,
    city,
    ward,
    includeInferred,
    useGemini,
  };

  const stepRecords = [];

  // Step 1: Priority Agent
  let toolCursor = trace.toolCalls.length;
  const priorityRes = await runPriorityAgent({ input: inputPayload, trace });
  let stepTools = sliceStepToolStats(trace, toolCursor);
  stepRecords.push({ stepOrder: 1, ...priorityRes, ...stepTools });

  // Step 2: Investigation Agent (Knowledge Graph)
  toolCursor = trace.toolCalls.length;
  const investigationRes = await runInvestigationAgent({
    priorityOutput: priorityRes,
    includeInferred,
    trace,
  });
  stepTools = sliceStepToolStats(trace, toolCursor);
  stepRecords.push({ stepOrder: 2, ...investigationRes, ...stepTools });

  // Step 3: Infrastructure Agent (Layer 3 Health Score)
  toolCursor = trace.toolCalls.length;
  const infrastructureRes = await runInfrastructureAgent({
    priorityOutput: priorityRes,
    investigationOutput: investigationRes,
    trace,
  });
  stepTools = sliceStepToolStats(trace, toolCursor);
  stepRecords.push({ stepOrder: 3, ...infrastructureRes, ...stepTools });

  // Step 4: Spatial Agent (Layer 2 Hotspots & Ward Analytics)
  toolCursor = trace.toolCalls.length;
  const spatialRes = await runSpatialAgent({
    priorityOutput: priorityRes,
    infrastructureOutput: infrastructureRes,
    trace,
  });
  stepTools = sliceStepToolStats(trace, toolCursor);
  stepRecords.push({ stepOrder: 4, ...spatialRes, ...stepTools });

  // Step 5: Complaint Agent (Layer 1 Semantics & Triage)
  toolCursor = trace.toolCalls.length;
  const complaintRes = await runComplaintAgent({
    priorityOutput: priorityRes,
    infrastructureOutput: infrastructureRes,
    trace,
  });
  stepTools = sliceStepToolStats(trace, toolCursor);
  stepRecords.push({ stepOrder: 5, ...complaintRes, ...stepTools });

  // Step 6: Recommendation Agent (Evidence-grounded action planning + non-causal guardrail)
  toolCursor = trace.toolCalls.length;
  const recommendationRes = await runRecommendationAgent({
    priorityOutput: priorityRes,
    investigationOutput: investigationRes,
    infrastructureOutput: infrastructureRes,
    spatialOutput: spatialRes,
    complaintOutput: complaintRes,
    trace,
  });
  stepTools = sliceStepToolStats(trace, toolCursor);
  stepRecords.push({ stepOrder: 6, ...recommendationRes, ...stepTools });

  // Step 7: Report Agent (Structured executive brief + strict hallucination check)
  toolCursor = trace.toolCalls.length;
  const reportRes = await runReportAgent({
    question: effectiveQuestion,
    priorityOutput: priorityRes,
    investigationOutput: investigationRes,
    infrastructureOutput: infrastructureRes,
    spatialOutput: spatialRes,
    complaintOutput: complaintRes,
    recommendationOutput: recommendationRes,
    preferGemini: Boolean(useGemini),
    trace,
  });
  stepTools = sliceStepToolStats(trace, toolCursor);
  stepRecords.push({ stepOrder: 7, ...reportRes, ...stepTools });

  const resolvedScope = priorityRes.outputs.resolvedScope || {};
  const resolvedCity =
    infrastructureRes.outputs.primaryAsset?.city ||
    complaintRes.outputs.focalComplaint?.city ||
    resolvedScope.city ||
    city ||
    null;
  const resolvedTargetType = resolvedScope.selectedMode || resolvedScope.targetType || "GENERAL";
  const resolvedTargetId =
    infrastructureRes.outputs.primaryAsset?.assetCode ||
    complaintRes.outputs.focalComplaint?.referenceId ||
    resolvedScope.targetId ||
    resolvedCity ||
    null;

  const totalToolCallsCount = trace.toolCalls.length;
  const validToolCallsCount = trace.toolCalls.filter(
    (t) => t.validArgs && (t.status === "SUCCESS" || t.status === "FAILED"),
  ).length;
  const groundingReport = reportRes.outputs.groundingReport || {
    passed: true,
    unsupportedClaimCount: 0,
  };
  const unsupportedClaimCount = Number(groundingReport.unsupportedClaimCount || 0);
  const totalDurationMs = Math.max(1, Date.now() - startedAt);

  const reportPayload = {
    headline: reportRes.outputs.headline,
    executiveSummary: reportRes.outputs.executiveSummary,
    keyFindings: reportRes.outputs.keyFindings,
    resolvedTarget: {
      targetType: resolvedTargetType,
      targetId: resolvedTargetId,
      city: resolvedCity,
      ward:
        infrastructureRes.outputs.primaryAsset?.ward ||
        complaintRes.outputs.focalComplaint?.ward ||
        resolvedScope.ward ||
        null,
    },
    prioritySummary: {
      topRankedAssets: priorityRes.outputs.topRankedAssets,
      topRankedWards: priorityRes.outputs.topRankedWards,
      rationale: priorityRes.outputs.priorityRationale,
    },
    infrastructureSummary: infrastructureRes.outputs.primaryAsset,
    upstreamContributingAssets: investigationRes.outputs.potentialContributingAssets,
    evidenceChains: investigationRes.outputs.evidenceChains,
    shortestPathExample: investigationRes.outputs.shortestPathExample,
    spatialSummary: {
      activeHotspots: spatialRes.outputs.activeHotspots,
      crossCategoryOverlapCount: spatialRes.outputs.crossCategoryOverlapCount,
      focalHotspots: spatialRes.outputs.focalHotspots,
      focalWardAnalytics: spatialRes.outputs.focalWardAnalytics,
    },
    complaintSummary: {
      focalComplaint: complaintRes.outputs.focalComplaint,
      scopedComplaintCount: complaintRes.outputs.scopedComplaintCount,
      statusCounts: complaintRes.outputs.statusCounts,
      categoryCounts: complaintRes.outputs.categoryCounts,
      keyCitizenReports: complaintRes.outputs.keyCitizenReports,
    },
    guardrails: reportRes.outputs.guardrails,
  };

  // Persist Orchestration Run + 7 Agent Step Runs + Recommendations atomically
  const client = await pool.connect();
  let savedParentRun;
  let savedStepRuns = [];
  let savedRecommendations = [];

  try {
    await client.query("BEGIN");

    savedParentRun = await agentRepository.createAgentRun(
      {
        parentRunId: null,
        stepOrder: 0,
        runType: "ORCHESTRATION",
        agentName: "Orchestrator",
        queryText: effectiveQuestion,
        targetType: resolvedTargetType,
        targetId: resolvedTargetId,
        city: resolvedCity,
        status: "COMPLETED",
        inputs: inputPayload,
        toolsUsed: trace.toolCalls,
        toolCallsCount: totalToolCallsCount,
        validToolCallsCount,
        outputs: reportPayload,
        groundingReport,
        unsupportedClaimCount,
        modelName: reportRes.modelName,
        modelVersion: "1.0.0",
        durationMs: totalDurationMs,
        initiatedBy,
      },
      client,
    );

    for (const s of stepRecords) {
      const stepRow = await agentRepository.createAgentRun(
        {
          parentRunId: savedParentRun.id,
          stepOrder: s.stepOrder,
          runType: "AGENT_STEP",
          agentName: s.agentName,
          queryText: effectiveQuestion,
          targetType: resolvedTargetType,
          targetId: resolvedTargetId,
          city: resolvedCity,
          status: s.status || "COMPLETED",
          inputs: s.inputs || {},
          toolsUsed: s.stepCalls || [],
          toolCallsCount: s.toolCallsCount || 0,
          validToolCallsCount: s.validToolCallsCount || 0,
          outputs: s.outputs || {},
          groundingReport: s.agentName === "ReportAgent" ? groundingReport : {},
          unsupportedClaimCount:
            s.agentName === "ReportAgent" ? unsupportedClaimCount : 0,
          modelName: s.modelName,
          modelVersion: s.modelVersion || "1.0.0",
          durationMs: s.durationMs || 0,
          initiatedBy,
        },
        client,
      );
      savedStepRuns.push(stepRow);
    }

    const recInputs = (recommendationRes.outputs.recommendations || []).map((r) => ({
      ...r,
      agentRunId: savedParentRun.id,
    }));
    savedRecommendations = await agentRepository.createRecommendations(recInputs, client);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return {
    run: serializeAgentRun({
      ...savedParentRun,
      step_count: savedStepRuns.length,
      recommendation_count: savedRecommendations.length,
    }),
    report: reportPayload,
    recommendations: savedRecommendations.map(serializeRecommendation),
    stepRuns: savedStepRuns.map(serializeAgentRun),
    groundingReport,
    registeredToolsCount: listToolSchemas().length,
  };
}

async function listOrchestrationRuns(filters = {}) {
  const rows = await agentRepository.listOrchestrationRuns(filters);
  return {
    total: rows.length,
    runs: rows.map(serializeAgentRun),
  };
}

async function getOrchestrationRunDetails(runId) {
  if (!UUID_REGEX.test(runId)) {
    const err = new Error("Agent run not found");
    err.statusCode = 404;
    err.code = "AGENT_RUN_NOT_FOUND";
    throw err;
  }

  const found = await agentRepository.findOrchestrationRunById(runId);
  if (!found) {
    const err = new Error("Agent run not found");
    err.statusCode = 404;
    err.code = "AGENT_RUN_NOT_FOUND";
    throw err;
  }

  return {
    run: serializeAgentRun({
      ...found.run,
      step_count: found.steps.length,
      recommendation_count: found.recommendations.length,
    }),
    stepRuns: found.steps.map(serializeAgentRun),
    recommendations: found.recommendations.map(serializeRecommendation),
  };
}

async function listRecommendations(filters = {}) {
  const rows = await agentRepository.listRecommendations(filters);
  const serialized = rows.map(serializeRecommendation);
  return {
    total: serialized.length,
    pendingCount: serialized.filter((r) => r.decisionStatus === "PENDING").length,
    recommendations: serialized,
  };
}

async function decideRecommendation(
  recommendationId,
  { decision, modifiedAction = null, decisionNote = null },
  officer = null,
) {
  if (!UUID_REGEX.test(recommendationId)) {
    const err = new Error("Agent recommendation not found");
    err.statusCode = 404;
    err.code = "RECOMMENDATION_NOT_FOUND";
    throw err;
  }

  const existing = await agentRepository.findRecommendationById(recommendationId);
  if (!existing) {
    const err = new Error("Agent recommendation not found");
    err.statusCode = 404;
    err.code = "RECOMMENDATION_NOT_FOUND";
    throw err;
  }

  const updated = await agentRepository.updateRecommendationDecision(recommendationId, {
    decision,
    decidedBy: officer?.id || null,
    modifiedAction: decision === "MODIFIED" ? modifiedAction : null,
    decisionNote: decisionNote || null,
  });

  // Non-blocking audit log in shared ai_feedback_events telemetry table
  aiFeedbackRepository
    .recordFeedback({
      eventType: "AGENT_RECOMMENDATION",
      action: decision,
      complaintId: existing.complaint_id || null,
      actorId: officer?.id || null,
      actorRole: officer?.role || "OFFICER",
      suggestedValue: existing.proposed_action,
      finalValue:
        decision === "MODIFIED"
          ? modifiedAction
          : decision === "ACCEPTED"
            ? existing.proposed_action
            : "REJECTED",
      metadata: {
        recommendationId: existing.id,
        agentRunId: existing.agent_run_id,
        targetType: existing.target_type,
        targetId: existing.target_id,
        decisionNote: decisionNote || null,
      },
    })
    .catch(() => {});

  const refreshed = await agentRepository.findRecommendationById(recommendationId);
  return serializeRecommendation(refreshed || updated);
}

async function getAgentEvaluationMetrics({ city = null } = {}) {
  const raw = await agentRepository.getEvaluationStats({ city });
  const o = raw.orchestrations || {};
  const rec = raw.recommendations || {};

  const totalOrch = Number(o.total_orchestrations || 0);
  const completedOrch = Number(o.completed_count || 0);
  const totalTools = Number(o.total_tool_calls || 0);
  const validTools = Number(o.valid_tool_calls || 0);
  const unsupportedClaims = Number(o.total_unsupported_claims || 0);
  const zeroHallucinationRuns = Number(o.zero_hallucination_runs || 0);
  const withProvenance = Number(o.runs_with_provenance || 0);

  const totalRecs = Number(rec.total_recommendations || 0);
  const accepted = Number(rec.accepted_count || 0);
  const rejected = Number(rec.rejected_count || 0);
  const modified = Number(rec.modified_count || 0);
  const decidedCount = accepted + rejected + modified;

  return {
    city: city && city !== "all" ? city : null,
    totalOrchestrations: totalOrch,
    taskSuccessRatePercent:
      totalOrch > 0 ? Number(((completedOrch / totalOrch) * 100).toFixed(1)) : 100,
    toolCallsTotal: totalTools,
    validToolCallsTotal: validTools,
    toolUseAccuracyPercent:
      totalTools > 0 ? Number(((validTools / totalTools) * 100).toFixed(1)) : 100,
    totalUnsupportedClaims: unsupportedClaims,
    unsupportedClaimRatePercent:
      totalOrch > 0
        ? Number(((1 - zeroHallucinationRuns / totalOrch) * 100).toFixed(1))
        : 0,
    zeroHallucinationRunPercent:
      totalOrch > 0
        ? Number(((zeroHallucinationRuns / totalOrch) * 100).toFixed(1))
        : 100,
    provenanceCompletenessPercent:
      totalOrch > 0
        ? Number(((withProvenance / totalOrch) * 100).toFixed(1))
        : 100,
    avgDurationMs: o.avg_duration_ms != null ? Number(o.avg_duration_ms) : 0,
    agentBreakdown: (raw.stepsByAgent || []).map((row) => ({
      agentName: row.agent_name,
      totalSteps: Number(row.total_steps || 0),
      completedSteps: Number(row.completed_steps || 0),
      toolCalls: Number(row.tool_calls || 0),
      validToolCalls: Number(row.valid_tool_calls || 0),
      unsupportedClaims: Number(row.unsupported_claims || 0),
      avgDurationMs: row.avg_duration_ms != null ? Number(row.avg_duration_ms) : 0,
    })),
    recommendationLifecycle: {
      total: totalRecs,
      pending: Number(rec.pending_count || 0),
      accepted,
      rejected,
      modified,
      decidedCount,
      nonCausalFlaggedCount: Number(rec.non_causal_count || 0),
      avgConfidence: rec.avg_confidence != null ? Number(rec.avg_confidence) : null,
      acceptanceRatePercent:
        decidedCount > 0
          ? Number((((accepted + modified) / decidedCount) * 100).toFixed(1))
          : null,
    },
    registeredToolsCount: listToolSchemas().length,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  serializeAgentRun,
  serializeRecommendation,
  orchestrateInvestigation,
  listOrchestrationRuns,
  getOrchestrationRunDetails,
  listRecommendations,
  decideRecommendation,
  getAgentEvaluationMetrics,
};
