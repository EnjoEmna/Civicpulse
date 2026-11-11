import type {
  AiFeedbackPayload,
  AssignedOfficerInfo,
  BackgroundJobsResponse,
  Complaint,
  ComplaintIntelligence,
  CurrentUserProfile,
  DashboardStats,
  EvidenceFile,
  Layer1MetricsResponse,
  OfficerDirectoryUser,
  SemanticSearchResponse,
  SimilarComplaintsResponse,
  TimelineEvent,
} from "../types/complaint";
import type {
  ActiveCitiesResponse,
  GeocodeResponse,
  HotspotDetectResponse,
  HotspotListResponse,
  PersistedHotspot,
  PersistedHotspotStatus,
  SpatialAnalysisRequest,
  SpatialAnalysisResult,
  SpatialClusteringRequest,
  SpatialClusteringResult,
  WardAnalyticsResponse,
} from "../types/spatial";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api/v1";
const API_ORIGIN = BASE_URL.replace(/\/api\/v1\/?$/, "");

interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

interface RawEvidencePayload {
  id: string;
  url: string;
  type: "image" | "video" | "document";
  originalName?: string;
  mimeType?: string;
  fileSize?: number;
  uploadedAt: string;
}

interface RawTimelinePayload {
  id: string;
  fromStatus?: string | null;
  status: string;
  actor: string;
  actorRole?: string;
  note?: string;
  timestamp: string;
}

interface RawComplaintPayload {
  id: string;
  referenceId?: string;
  title: string;
  description: string;
  category: string;
  department?: string | null;
  assignedOfficer?: AssignedOfficerInfo | null;
  address: string;
  city?: string | null;
  ward?: string | null;
  zone?: string | null;
  status: string;
  priority?: string | null;
  latitude: number | null;
  longitude: number | null;
  possibleDuplicateOfId?: string | null;
  evidence?: RawEvidencePayload[];
  timeline?: RawTimelinePayload[];
  intelligence?: ComplaintIntelligence | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnrichComplaintResponse {
  complaintId: string;
  aiCategory: string | null;
  aiPriority: string | null;
  aiSummary: string | null;
  aiConfidence: number | null;
  aiTags: string[];
  aiMetadata: ComplaintIntelligence["aiMetadata"];
  priority: string | null;
  department: string | null;
  enrichmentStatus: string;
  enrichedAt: string | null;
  embedding?: {
    status: string;
    reason?: string;
  } | null;
}

export function resolveAssetUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `${API_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("cp_officer_token");
  const isFormData = options?.body instanceof FormData;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      body.error?.message ?? body.message ?? `Request failed: ${res.status}`,
    );
  }

  return body;
}

function normalizePriority(raw?: string | null): Complaint["priority"] {
  if (!raw) return "medium";
  const lower = raw.toLowerCase().trim();
  if (["low", "medium", "high", "urgent", "critical"].includes(lower)) {
    return lower as Complaint["priority"];
  }
  return "medium";
}

function mapEvidence(items?: RawEvidencePayload[]): EvidenceFile[] {
  if (!Array.isArray(items)) return [];

  return items.map((e) => ({
    id: e.id,
    url: resolveAssetUrl(e.url),
    type: e.type || "document",
    originalName: e.originalName,
    mimeType: e.mimeType,
    fileSize: e.fileSize,
    uploadedAt: e.uploadedAt,
  }));
}

function mapTimeline(
  item: RawComplaintPayload,
  includeFallbackTimeline: boolean,
): TimelineEvent[] {
  if (Array.isArray(item.timeline) && item.timeline.length > 0) {
    return item.timeline.map((event) => ({
      id: event.id,
      fromStatus: event.fromStatus ?? null,
      status: event.status,
      actor: event.actor || "System",
      actorRole: event.actorRole,
      note: event.note || `Status transitioned to ${event.status}`,
      timestamp: event.timestamp,
    }));
  }

  if (!includeFallbackTimeline) {
    return [];
  }

  return [
    {
      id: "t-init",
      status: item.status,
      actor: "System",
      note: "Civic complaint logged into system",
      timestamp: item.createdAt,
    },
    ...(item.updatedAt !== item.createdAt
      ? [
          {
            id: "t-latest",
            status: item.status,
            actor: "Officer / System",
            note: `Status synchronized as ${item.status}`,
            timestamp: item.updatedAt,
          },
        ]
      : []),
  ];
}

function mapComplaint(item: RawComplaintPayload, includeTimeline = false): Complaint {
  return {
    id: item.id,
    referenceId: item.referenceId,
    title: item.title,
    description: item.description,
    category: item.category as Complaint["category"],
    department: item.department ?? null,
    assignedOfficer: item.assignedOfficer ?? null,
    status: item.status,
    priority: normalizePriority(item.priority),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    location: {
      address: item.address || "Address not provided",
      city: item.city ?? null,
      ward: item.ward || item.department || "Jurisdiction Ward",
      zone: item.zone ?? null,
      lat: item.latitude ?? 0,
      lng: item.longitude ?? 0,
    },
    possibleDuplicateOfId: item.possibleDuplicateOfId ?? null,
    evidence: mapEvidence(item.evidence),
    timeline: mapTimeline(item, includeTimeline),
    intelligence: item.intelligence ?? null,
  };
}

export const api = {
  login: (email: string, password: string) =>
    request<{ data: LoginResponse }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  getProfile: () => request<{ data: CurrentUserProfile }>("/users/me"),

  getOfficers: async (): Promise<OfficerDirectoryUser[]> => {
    const response = await request<{ data: OfficerDirectoryUser[] }>("/users/officers");
    return response.data;
  },

  getQueue: async (params?: {
    status?: string;
    category?: string;
    city?: string;
    query?: string;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();

    if (params?.status && params.status !== "all") {
      searchParams.set("status", params.status);
    }

    if (params?.category && params.category !== "all") {
      searchParams.set("category", params.category);
    }

    if (params?.city && params.city !== "all") {
      searchParams.set("city", params.city);
    }

    if (params?.query?.trim()) {
      searchParams.set("query", params.query.trim());
    }

    if (params?.limit !== undefined && params.limit > 0) {
      searchParams.set("limit", String(params.limit));
    }

    const qs = searchParams.toString();
    const response = await request<{
      data: RawComplaintPayload[];
    }>(`/complaints${qs ? `?${qs}` : ""}`);

    return response.data.map((item) => mapComplaint(item));
  },

  getComplaint: async (id: string): Promise<Complaint> => {
    const response = await request<{
      data: RawComplaintPayload;
    }>(`/complaints/${encodeURIComponent(id)}`);

    return mapComplaint(response.data, true);
  },

  updateStatus: async (
    id: string,
    status: string,
    note?: string,
    assignedOfficerId?: string | null,
    possibleDuplicateOfId?: string | null,
  ): Promise<Complaint> => {
    const payload: {
      status: string;
      note?: string;
      assignedOfficerId?: string | null;
      possibleDuplicateOfId?: string | null;
    } = { status };

    if (note && note.trim()) {
      payload.note = note.trim();
    }
    if (assignedOfficerId !== undefined) {
      payload.assignedOfficerId = assignedOfficerId;
    }
    if (possibleDuplicateOfId !== undefined) {
      payload.possibleDuplicateOfId = possibleDuplicateOfId;
    }

    const response = await request<{ data: RawComplaintPayload }>(
      `/complaints/${encodeURIComponent(id)}/status`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );
    return mapComplaint(response.data, true);
  },

  assignOfficer: async (
    id: string,
    assignedOfficerId: string | null,
    note?: string,
  ): Promise<Complaint> => {
    const response = await request<{ data: RawComplaintPayload }>(
      `/complaints/${encodeURIComponent(id)}/assign`,
      {
        method: "PATCH",
        body: JSON.stringify({
          assignedOfficerId,
          ...(note && note.trim() ? { note: note.trim() } : {}),
        }),
      },
    );
    return mapComplaint(response.data, true);
  },

  uploadEvidence: async (
    complaintId: string,
    files: File[],
  ): Promise<EvidenceFile[]> => {
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }

    const response = await request<{ data: RawEvidencePayload[] }>(
      `/complaints/${encodeURIComponent(complaintId)}/evidence`,
      {
        method: "POST",
        body: formData,
      },
    );

    return mapEvidence(response.data);
  },

  deleteEvidence: (complaintId: string, evidenceId: string) =>
    request<{ data: { id: string; deleted: boolean } }>(
      `/complaints/${encodeURIComponent(complaintId)}/evidence/${encodeURIComponent(evidenceId)}`,
      { method: "DELETE" },
    ),

  getDashboardStats: async (): Promise<DashboardStats> => {
    const response = await request<{ data: DashboardStats }>("/complaints/stats");
    return response.data;
  },

  getMapComplaints: async (params?: {
    status?: string;
    category?: string;
    city?: string;
  }): Promise<Complaint[]> => {
    const searchParams = new URLSearchParams();

    if (params?.status && params.status !== "all") {
      searchParams.set("status", params.status);
    }

    if (params?.category && params.category !== "all") {
      searchParams.set("category", params.category);
    }

    if (params?.city && params.city !== "all") {
      searchParams.set("city", params.city);
    }

    const qs = searchParams.toString();
    const response = await request<{ data: RawComplaintPayload[] }>(
      `/complaints/map${qs ? `?${qs}` : ""}`,
    );

    return response.data.map((item) => mapComplaint(item));
  },

  enrichComplaint: async (id: string): Promise<EnrichComplaintResponse> => {
    const response = await request<{ data: EnrichComplaintResponse }>(
      `/intelligence/complaints/${encodeURIComponent(id)}/enrich`,
      { method: "POST" },
    );
    return response.data;
  },

  getIntelligenceJobs: async (limit = 10): Promise<BackgroundJobsResponse> => {
    const response = await request<{ data: BackgroundJobsResponse }>(
      `/intelligence/jobs?limit=${encodeURIComponent(limit)}`,
    );
    return response.data;
  },

  retryIntelligenceJobs: async (): Promise<{
    backfill: { enqueued: number; processed: number; succeeded: number; failed: number };
    due: { processed: number; succeeded: number; failed: number };
  }> => {
    const response = await request<{
      data: {
        backfill: { enqueued: number; processed: number; succeeded: number; failed: number };
        due: { processed: number; succeeded: number; failed: number };
      };
    }>("/intelligence/jobs/retry", { method: "POST" });
    return response.data;
  },

  analyzeSpatialArea: (payload: SpatialAnalysisRequest) =>
    request<{ success: boolean; data: SpatialAnalysisResult }>(
      "/spatial/analyze",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  analyzeSpatialClusters: (payload: SpatialClusteringRequest) =>
    request<{ success: boolean; data: SpatialClusteringResult }>(
      "/spatial/clusters",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  getHotspots: async (params?: {
    city?: string;
    status?: string;
    ward?: string;
    overlapOnly?: boolean;
    limit?: number;
  }): Promise<HotspotListResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.city && params.city !== "all") searchParams.set("city", params.city);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.ward) searchParams.set("ward", params.ward);
    if (params?.overlapOnly) searchParams.set("overlapOnly", "true");
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    const response = await request<{ success: boolean; data: HotspotListResponse }>(
      `/spatial/hotspots${qs ? `?${qs}` : ""}`,
    );
    return response.data;
  },

  detectHotspots: async (payload?: {
    clusterDistanceMeters?: number;
    minClusterSize?: number;
    timeWindowDays?: number | null;
    city?: string;
    ward?: string;
    category?: string;
    cityWide?: boolean;
    latitude?: number;
    longitude?: number;
    radiusMeters?: number;
  }): Promise<HotspotDetectResponse> => {
    const response = await request<{ success: boolean; data: HotspotDetectResponse }>(
      "/spatial/hotspots/detect",
      {
        method: "POST",
        body: JSON.stringify(payload || { cityWide: true }),
      },
    );
    return response.data;
  },

  updateHotspotStatus: async (
    id: string,
    status: PersistedHotspotStatus,
  ): Promise<PersistedHotspot> => {
    const response = await request<{ success: boolean; data: PersistedHotspot }>(
      `/spatial/hotspots/${encodeURIComponent(id)}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status }),
      },
    );
    return response.data;
  },

  getWardAnalytics: async (params?: {
    city?: string;
    timeWindowDays?: number;
    category?: string;
  }): Promise<WardAnalyticsResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.city && params.city !== "all") {
      searchParams.set("city", params.city);
    }
    if (params?.timeWindowDays) {
      searchParams.set("timeWindowDays", String(params.timeWindowDays));
    }
    if (params?.category && params.category !== "all") {
      searchParams.set("category", params.category);
    }
    const qs = searchParams.toString();
    const response = await request<{ success: boolean; data: WardAnalyticsResponse }>(
      `/spatial/wards${qs ? `?${qs}` : ""}`,
    );
    return response.data;
  },

  getSpatialCities: async (): Promise<ActiveCitiesResponse> => {
    const response = await request<{ success: boolean; data: ActiveCitiesResponse }>(
      "/spatial/cities",
    );
    return response.data;
  },

  geocodePlace: async (query: string): Promise<GeocodeResponse> => {
    const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    const response = await request<{ success: boolean; data: GeocodeResponse }>(
      `/spatial/geocode${qs}`,
    );
    return response.data;
  },

  semanticSearchComplaints: async (payload: {
    query: string;
    city?: string;
    category?: string;
    status?: string;
    limit?: number;
  }): Promise<SemanticSearchResponse> => {
    const response = await request<{ data: SemanticSearchResponse }>(
      "/intelligence/search",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    return response.data;
  },

  getSimilarComplaintsAndHotspots: async (
    complaintId: string,
    limit = 6,
  ): Promise<SimilarComplaintsResponse> => {
    const response = await request<{ data: SimilarComplaintsResponse }>(
      `/intelligence/complaints/${encodeURIComponent(complaintId)}/similar?limit=${encodeURIComponent(limit)}`,
    );
    return response.data;
  },

  getIntelligenceMetrics: async (): Promise<Layer1MetricsResponse> => {
    const response = await request<{ data: Layer1MetricsResponse }>(
      "/intelligence/metrics",
    );
    return response.data;
  },

  submitAiFeedback: async (payload: AiFeedbackPayload) => {
    return request<{ data: unknown }>("/intelligence/feedback", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
