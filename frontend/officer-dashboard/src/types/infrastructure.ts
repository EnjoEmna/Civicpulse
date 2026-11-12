export type AssetType =
  | "ROAD_SEGMENT"
  | "WATER_PIPELINE"
  | "DRAINAGE"
  | "STREETLIGHT_CLUSTER"
  | "WASTE_POINT";

export type HealthGrade = "GOOD" | "FAIR" | "POOR" | "CRITICAL";

export type HealthTrend = "IMPROVING" | "STABLE" | "DETERIORATING";

export type MaintenanceEventType =
  | "INSPECTION"
  | "REPAIR"
  | "RESURFACING"
  | "REPLACEMENT"
  | "CLEANING"
  | "PREVENTIVE_MAINTENANCE";

export type MaintenanceOutcome =
  | "COMPLETED"
  | "PARTIAL"
  | "DEFERRED"
  | "FAILED_INSPECTION";

export interface ScoreBreakdown {
  baseScore?: number;
  complaintImpactPenalty?: number;
  recurrencePenalty?: number;
  severityPenalty?: number;
  unresolvedDurationPenalty?: number;
  maintenanceAgePenalty?: number;
  totalPenalty?: number;
  caps?: {
    complaintImpact: number;
    recurrence: number;
    severity: number;
    unresolvedDuration: number;
    maintenanceAge: number;
  };
  factors?: {
    directCount: number;
    crossImpactCount: number;
    openCount: number;
    resolvedActiveCount: number;
    recent30dCount: number;
    upvoteTotal: number;
    maxOpenAgeDays: number;
    avgOpenAgeDays: number;
    maintenanceAgeMonths: number;
    inActiveHotspot: boolean;
  };
}

export interface InfrastructureAsset {
  id: string;
  assetCode: string;
  name: string;
  assetType: AssetType;
  assetTypeLabel: string;
  city: string | null;
  ward: string | null;
  zone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  catchmentRadiusMeters: number;
  department: string;
  installDate: string | null;
  lastMaintainedAt: string | null;
  maintenanceAgeMonths: number | null;
  healthScore: number;
  healthGrade: HealthGrade;
  trend: HealthTrend;
  complaintCount: number;
  openComplaintCount: number;
  recurrenceCount: number;
  maintenanceEventCount?: number;
  scoreBreakdown: ScoreBreakdown;
  lastScoredAt: string | null;
  createdAt: string;
  updatedAt: string;
  linkType?: "DIRECT" | "CROSS_IMPACT" | "MANUAL";
  linkConfidence?: number | null;
  linkReason?: string | null;
  distanceMeters?: number | null;
}

export interface WardWorstAsset {
  id: string;
  assetCode: string;
  name: string;
  assetType: AssetType;
  healthScore: number;
  healthGrade: HealthGrade;
}

export interface WardHealthItem {
  city: string;
  ward: string;
  zone: string;
  healthScore: number;
  healthGrade: HealthGrade;
  assetCount: number;
  criticalOrPoorAssets: number;
  deterioratingCount: number;
  totalComplaints: number;
  openComplaints: number;
  highOrCriticalCount: number;
  worstAsset: WardWorstAsset | null;
}

export interface InfrastructureOverviewResponse {
  filters: {
    city: string | null;
    ward: string | null;
    assetType: string | null;
    grade: string | null;
  };
  summary: {
    totalAssets: number;
    avgHealthScore: number | null;
    avgHealthGrade: HealthGrade;
    gradeCounts: Record<HealthGrade, number>;
    openLinkedComplaints: number;
    maintenanceOverdueCount: number;
    deterioratingCount: number;
  };
  formula: {
    expression: string;
    weights: {
      complaintImpactMax: number;
      recurrenceMax: number;
      severityMax: number;
      unresolvedDurationMax: number;
      maintenanceAgeMax: number;
    };
  };
  assets: InfrastructureAsset[];
  wards: WardHealthItem[];
}

export interface WardHealthResponse {
  city: string | null;
  totalWards: number;
  wards: WardHealthItem[];
}

export interface LinkedAssetComplaint {
  id: string;
  referenceId: string | null;
  title: string;
  category: string;
  priority: string | null;
  status: string;
  city: string | null;
  ward: string | null;
  address: string | null;
  linkType: "DIRECT" | "CROSS_IMPACT" | "MANUAL";
  linkConfidence: number | null;
  linkReason: string | null;
  distanceMeters: number | null;
  upvoteCount: number;
  createdAt: string;
}

export interface MaintenanceEvent {
  id: string;
  assetId: string;
  eventType: MaintenanceEventType;
  outcome: MaintenanceOutcome;
  performedBy: string;
  actorId: string | null;
  notes: string | null;
  performedAt: string;
  createdAt: string;
}

export interface HealthHistoryPoint {
  id: string;
  healthScore: number;
  healthGrade: HealthGrade;
  complaintCount: number;
  openComplaintCount: number;
  recordedAt: string;
}

export interface AssetDetailsResponse {
  asset: InfrastructureAsset;
  linkedComplaints: LinkedAssetComplaint[];
  maintenanceEvents: MaintenanceEvent[];
  healthHistory: HealthHistoryPoint[];
}

export interface CreateAssetPayload {
  assetCode: string;
  name: string;
  assetType: AssetType;
  city?: string | null;
  ward?: string | null;
  zone?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
  catchmentRadiusMeters?: number;
  department?: string;
  installDate?: string | null;
  lastMaintainedAt?: string | null;
}

export interface LogMaintenancePayload {
  eventType: MaintenanceEventType;
  outcome?: MaintenanceOutcome;
  performedBy?: string | null;
  notes?: string | null;
  performedAt?: string | null;
}

export interface InfrastructureMetricsResponse {
  city: string | null;
  totalAssets: number;
  avgHealthScore: number | null;
  gradeDistribution: Record<HealthGrade, number>;
  trendDistribution: Record<HealthTrend, number>;
  averagePenalties: {
    complaintImpactPenalty: number;
    recurrencePenalty: number;
    severityPenalty: number;
    unresolvedDurationPenalty: number;
    maintenanceAgePenalty: number;
    totalPenalty: number;
  };
  labelAlignment: {
    overdueMaintenanceCount: number;
    overdueSubHealthyCount: number;
    maintenanceAlignmentPercent: number | null;
    poorOrCriticalCount: number;
    poorOrCriticalOverdueCount: number;
    crossImpactExposedAssets: number;
  };
  sensitivityAnalysis: {
    baselineAvgHealth: number | null;
    whatIfResolveAllOpenAvgHealth: number | null;
    deltaResolveOpenPts: number;
    whatIfCompleteMaintenanceAvgHealth: number | null;
    deltaCompleteMaintenancePts: number;
    whatIfEliminateOverlapAvgHealth: number | null;
    deltaEliminateOverlapPts: number;
  };
  generatedAt: string;
}
