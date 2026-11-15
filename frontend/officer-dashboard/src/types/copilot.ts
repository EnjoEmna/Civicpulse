export type RecommendationDecisionStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "MODIFIED";

export type RecommendationPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RecommendationEvidenceCitation {
  entityType: string;
  entityCode: string;
  sourceTool: string;
  metric?: string;
}

export interface CopilotRecommendation {
  id: string;
  agentRunId: string;
  targetType: string;
  targetId: string | null;
  assetId: string | null;
  complaintId: string | null;
  hotspotId: string | null;
  city: string | null;
  ward: string | null;
  category: string;
  priority: RecommendationPriority;
  actionTitle: string;
  proposedAction: string;
  rationale: string;
  evidenceCitations: RecommendationEvidenceCitation[];
  confidence: number;
  requiresHumanConfirmation: boolean;
  isNonCausalInferred: boolean;
  decisionStatus: RecommendationDecisionStatus;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedByEmail: string | null;
  modifiedAction: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  sourceQueryText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DigestContributingAsset {
  assetCode: string;
  name: string;
  assetType: string;
  healthScore: number | null;
  healthGrade: string | null;
  distanceMeters: number | null;
  confidence: number;
  relationshipLabel: string;
  disclaimer: string;
}

export interface MorningDigestPriorityItem {
  rank: number;
  assetId: string;
  assetCode: string;
  name: string;
  assetType: string;
  city: string;
  ward: string;
  department: string;
  healthScore: number;
  healthGrade: string;
  trend: string;
  openComplaintCount: number;
  recurrenceCount: number;
  maintenanceAgeMonths: number | null;
  scoreBreakdown: Record<string, unknown> | null;
  whyItNeedsAttention: string;
  potentialContributingAssets: DigestContributingAsset[];
  matchingHotspot: {
    id: string;
    hotspotKey: string;
    title: string;
    complaintCount: number;
    openCount: number;
    hasCrossCategoryOverlap: boolean;
    overlapCategories: string[];
  } | null;
  pendingRecommendation: CopilotRecommendation | null;
  suggestedPrompt: string;
}

export interface MorningDigestResponse {
  greeting: string;
  dateLabel: string;
  city: string | null;
  attentionCount: number;
  digestSummary: string;
  nonCausalGuardrail: string;
  summary: {
    totalAssetsMonitored: number;
    criticalCount: number;
    poorCount: number;
    overdueMaintenanceCount: number;
    activeHotspotsCount: number;
    crossCategoryOverlapCount: number;
    pendingRecommendationsCount: number;
  };
  priorityItems: MorningDigestPriorityItem[];
  pendingRecommendations: CopilotRecommendation[];
  generatedAt: string;
}

export interface CopilotSession {
  id: string;
  officerId: string;
  officerName: string | null;
  officerEmail: string | null;
  title: string;
  city: string | null;
  targetType: string | null;
  targetId: string | null;
  messageCount?: number;
  lastMessagePreview?: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CopilotExplainability {
  headline: string;
  intent: string;
  resolvedTarget: {
    targetType: string;
    targetId: string | null;
    city: string | null;
    ward: string | null;
  } | null;
  keyFindings: string[];
  primaryAsset: {
    id: string;
    assetCode: string;
    name: string;
    assetType: string;
    city: string;
    ward: string;
    department: string;
    healthScore: number;
    healthGrade: string;
    trend: string;
    openComplaintCount: number;
    complaintCount: number;
    maintenanceAgeMonths: number | null;
    scoreBreakdown: {
      complaintImpactPenalty?: number;
      recurrencePenalty?: number;
      severityPenalty?: number;
      unresolvedDurationPenalty?: number;
      maintenanceAgePenalty?: number;
      factors?: Record<string, unknown>;
    } | null;
  } | null;
  healthTrajectory: Array<{
    healthScore: number;
    healthGrade: string;
    recordedAt: string;
  }>;
  maintenanceHistory: Array<{
    id: string;
    eventType: string;
    outcome: string;
    performedBy: string;
    notes: string | null;
    performedAt: string;
  }>;
  potentialContributingAssets: Array<{
    assetCode: string;
    name: string;
    assetType: string;
    healthScore: number | null;
    healthGrade: string | null;
    distanceMeters: number | null;
    confidence: number;
    relationshipLabel: string;
    upstreamOpenComplaints: number;
    disclaimer: string;
    evidence: string;
  }>;
  evidenceChains: Array<{
    id: string;
    chainType: string;
    title: string;
    isInferred: boolean;
    relationshipLabel: string;
    confidence: number;
    summary: string;
    disclaimer: string | null;
    steps: Array<{
      nodeKey: string;
      entityType: string;
      label: string;
      edgeLabelAfter: string | null;
      isInferred: boolean;
    }>;
  }>;
  shortestPathExample: {
    hopCount: number;
    containsInferredEdge: boolean;
    narrativeSteps: string[];
  } | null;
  supportingComplaints: Array<{
    id: string;
    referenceId: string;
    title: string;
    category: string;
    priority: string;
    status: string;
    ward: string;
    aiSummary: string | null;
    createdAt: string;
  }>;
  focalComplaint: Record<string, unknown> | null;
  spatialHotspots: Array<{
    id: string;
    hotspotKey: string;
    title: string;
    ward: string;
    severity: string;
    status: string;
    complaintCount: number;
    openCount: number;
    densityPerSqKm: number;
    hasCrossCategoryOverlap: boolean;
    overlapCategories: string[];
    overlapSummary: string | null;
  }>;
  guardrails: {
    deterministicMathOnly: boolean;
    readOnlyToolsOnly: boolean;
    humanConfirmationRequired: boolean;
    nonCausalInferenceEnforced: boolean;
    geminiDraftBlockedForHallucination?: boolean;
  };
  groundingReport: {
    passed: boolean;
    checkedFactCount: number;
    groundedFactCount: number;
    unsupportedClaimCount: number;
    groundingScore: number;
    unsupportedClaims: string[];
  };
  stepRunsSummary: Array<{
    stepOrder: number;
    agentName: string;
    status: string;
    durationMs: number;
    toolCallsCount: number;
    validToolCallsCount: number;
    modelName: string;
  }>;
}

export interface CopilotMessage {
  id: string;
  sessionId: string;
  role: "USER" | "COPILOT";
  content: string;
  agentRunId: string | null;
  latencyMs: number;
  structuredPayload: {
    explainability?: CopilotExplainability;
    suggestedFollowUps?: string[];
    agentRunSummary?: {
      id: string;
      status: string;
      durationMs: number;
      toolCallsCount: number;
      validToolCallsCount: number;
      unsupportedClaimCount: number;
      modelName: string;
    } | null;
  };
  recommendations: CopilotRecommendation[];
  createdAt: string;
}

export interface AskCopilotResponse {
  session: CopilotSession;
  userMessage: CopilotMessage;
  assistantMessage: CopilotMessage;
  recommendations: CopilotRecommendation[];
  agentRun: {
    id: string;
    status: string;
    durationMs: number;
    toolCallsCount: number;
    validToolCallsCount: number;
    unsupportedClaimCount: number;
    modelName: string;
  } | null;
}

export interface CopilotMetricsResponse {
  city: string | null;
  totalOrchestrations: number;
  taskSuccessRatePercent: number;
  toolCallsTotal: number;
  validToolCallsTotal: number;
  toolUseAccuracyPercent: number;
  totalUnsupportedClaims: number;
  unsupportedClaimRatePercent: number;
  zeroHallucinationRunPercent: number;
  provenanceCompletenessPercent: number;
  avgDurationMs: number;
  agentBreakdown: Array<{
    agentName: string;
    totalSteps: number;
    completedSteps: number;
    toolCalls: number;
    validToolCalls: number;
    unsupportedClaims: number;
    avgDurationMs: number;
  }>;
  recommendationLifecycle: {
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
    modified: number;
    decidedCount: number;
    nonCausalFlaggedCount: number;
    avgConfidence: number | null;
    acceptanceRatePercent: number | null;
  };
  registeredToolsCount: number;
  copilotUsage: {
    totalSessions: number;
    activeSessions24h: number;
    totalMessages: number;
    userQueriesCount: number;
    copilotRepliesCount: number;
    avgCopilotLatencyMs: number;
  };
  generatedAt: string;
}
