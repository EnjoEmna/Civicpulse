export type BackendComplaintStatus =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "REJECTED"
  | "NEEDS_INFORMATION"
  | "DUPLICATE_SUSPECTED";

export type ComplaintStatus =
  | BackendComplaintStatus
  | "open"
  | "in_progress"
  | "resolved"
  | "rejected"
  | string;

export type ComplaintCategory =
  | "roads"
  | "water_supply"
  | "electricity"
  | "sanitation"
  | "public_safety"
  | "other"
  | string;

export type ComplaintPriority = "low" | "medium" | "high" | "urgent" | "critical" | string;

export interface EvidenceFile {
  id: string;
  url: string;
  type: "image" | "video" | "document";
  originalName?: string;
  mimeType?: string;
  fileSize?: number;
  uploadedAt: string;
}

export interface TimelineEvent {
  id: string;
  fromStatus?: ComplaintStatus | null;
  status: ComplaintStatus;
  note?: string;
  actor: string;
  actorRole?: string;
  timestamp: string;
}

export interface AssignedOfficerInfo {
  id: string;
  name: string;
  email?: string | null;
}

export interface ComplaintIntelligenceProvenance {
  source?: string;
  modelName?: string | null;
  modelVersion?: string | null;
  timestamp?: string;
}

export interface ComplaintIntelligenceMetadata {
  department?: string | null;
  rationale?: string | null;
  keyPoints?: string[];
  recommendedAction?: string | null;
  classificationProvenance?: ComplaintIntelligenceProvenance | null;
  summarizationProvenance?: ComplaintIntelligenceProvenance | null;
  analyzedAt?: string | null;
}

export interface ComplaintIntelligence {
  aiCategory: string | null;
  aiPriority: string | null;
  aiSummary: string | null;
  aiConfidence: number | null;
  aiTags: string[];
  aiMetadata: ComplaintIntelligenceMetadata | null;
  enrichmentStatus: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | string;
  enrichedAt: string | null;
}

export interface Complaint {
  id: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  department?: string | null;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  createdAt: string;
  updatedAt: string;
  citizenName?: string;
  location: {
    address: string;
    city?: string | null;
    ward: string;
    zone?: string | null;
    lat: number;
    lng: number;
  };
  possibleDuplicateOfId?: string | null;
  evidence: EvidenceFile[];
  timeline: TimelineEvent[];
  assignedOfficer?: AssignedOfficerInfo | null;
  intelligence?: ComplaintIntelligence | null;
  referenceId?: string;
}

export interface DashboardStats {
  total: number;
  open: number;
  pending: number;
  submitted: number;
  underReview: number;
  assigned: number;
  inProgress: number;
  activeInProgress: number;
  needsInformation: number;
  duplicateSuspected: number;
  resolved: number;
  resolvedLast30Days: number;
  rejected: number;
  overdue: number;
  createdToday: number;
}

export interface OfficerDirectoryUser {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at?: string;
}

export interface Officer {
  id: string;
  name: string;
  email: string;
  department: string;
  ward: string;
}

export interface CurrentUserProfile {
  id: string;
  name: string;
  email: string;
  role: "CITIZEN" | "OFFICER" | "ADMIN" | string;
  created_at: string;
}

export interface BackgroundJobStats {
  total: number;
  pending: number;
  processing: number;
  retry_scheduled: number;
  completed: number;
  failed: number;
}

export interface BackgroundJobItem {
  id: string;
  jobType: string;
  complaintId: string;
  referenceId?: string | null;
  complaintTitle?: string | null;
  enrichmentStatus?: string | null;
  status: string;
  attempts: number;
  maxAttempts: number;
  result?: Record<string, unknown> | null;
  lastError?: string | null;
  nextRunAt?: string | null;
  completedAt?: string | null;
  updatedAt: string;
}

export interface BackgroundJobsResponse {
  stats: BackgroundJobStats;
  jobs: BackgroundJobItem[];
}

export interface Layer1MetricsResponse {
  classification: {
    totalComplaints: number;
    enrichedComplaints: number;
    enrichmentRatePercent: number;
    categoryAgreementPercent: number | null;
    avgConfidence: number | null;
    avgInferenceLatencyMs: number | null;
  };
  embeddings: {
    totalComplaints: number;
    indexedComplaints: number;
    coveragePercent: number;
    backend?: string;
  };
  jobs: BackgroundJobStats;
  feedback: {
    totalEvents: number;
    accepted: number;
    modified: number;
    rejected: number;
    acceptanceRatePercent: number | null;
    duplicateSuggestions: {
      total: number;
      accepted: number;
      rejected: number;
    };
  };
}

export interface AiFeedbackPayload {
  eventType:
    | "DUPLICATE_SUGGESTION"
    | "CLASSIFICATION_SUGGESTION"
    | "PRIORITY_SUGGESTION"
    | "TRIAGE_SUMMARY";
  action: "ACCEPTED" | "MODIFIED" | "REJECTED";
  complaintId?: string | null;
  targetComplaintId?: string | null;
  suggestedValue?: string | null;
  finalValue?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SemanticSearchResult {
  id: string;
  referenceId?: string | null;
  title: string;
  description: string;
  category: string;
  canonicalCategory?: string | null;
  department?: string | null;
  status: string;
  priority: string;
  address: string;
  city?: string | null;
  ward?: string | null;
  zone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  aiSummary?: string | null;
  aiConfidence?: number | null;
  aiTags: string[];
  upvoteCount: number;
  similarity: number;
  keywordBoost: number;
  relevanceScore: number;
  matchedConcepts: string[];
  matchType: string;
  createdAt: string;
}

export interface SemanticSearchResponse {
  query: string;
  normalizedQuery: string;
  expandedTokens: string[];
  detectedConcepts: string[];
  languageHint: string;
  embeddingSource: string;
  total: number;
  results: SemanticSearchResult[];
}

export interface SimilarComplaintItem {
  complaintId: string;
  referenceId?: string | null;
  title: string;
  description: string;
  aiSummary?: string | null;
  category: string;
  canonicalCategory?: string | null;
  status: string;
  priority: string;
  address: string;
  city?: string | null;
  ward?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  upvoteCount: number;
  similarity: number;
  distanceMeters: number | null;
  daysApart: number | null;
  categoryMatch: boolean;
  matchReasons: string[];
  isLikelyDuplicate?: boolean;
  combinedScore: number;
  semanticMatch?: boolean;
  spatialMatch?: boolean;
  temporalMatch?: boolean;
  createdAt: string;
}

export interface ComplaintHotspotItem {
  id: string;
  hotspotKey: string;
  title: string;
  city?: string | null;
  ward?: string | null;
  zone?: string | null;
  centroid: {
    latitude: number;
    longitude: number;
  };
  radiusMeters: number;
  dominantCategory: string;
  issueCategories: string[];
  categoryCounts: Record<string, number>;
  complaintCount: number;
  openCount: number;
  densityPerSqKm: number;
  recurrenceScore: number;
  confidence: number;
  severity: string;
  hasCrossCategoryOverlap: boolean;
  overlapCategories: string[];
  overlapSummary?: string | null;
  status: string;
  distanceFromCenterMeters?: number | null;
}

export interface SimilarComplaintsResponse {
  complaintId: string;
  referenceId?: string | null;
  city?: string | null;
  ward?: string | null;
  zone?: string | null;
  hotspots: ComplaintHotspotItem[];
  similarComplaints: SimilarComplaintItem[];
}
