export interface SpatialAnalysisRequest {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  maxResults: number;
  category?: string;
  timeWindowDays?: number;
  city?: string;
  ward?: string;
}

export interface SpatialClusteringRequest {
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  clusterDistanceMeters: number;
  minClusterSize: number;
  category?: string;
  timeWindowDays?: number;
  city?: string;
  ward?: string;
  cityWide?: boolean;
}

export interface SpatialComplaint {
  id: string;
  referenceId: string;
  title: string;
  description: string;
  category: string;
  canonicalCategory: string;
  status: string;
  priority: string | null;
  address: string;
  city?: string | null;
  ward?: string | null;
  zone?: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  createdAt: string;
}

export interface SpatialAnalysisResult {
  center: {
    latitude: number;
    longitude: number;
  };
  radiusMeters: number;
  timeWindowDays: number | null;
  returnedCount: number;
  openCount: number;
  maxResults: number;
  densityPerSqKm: number;
  areaSqKm: number;
  categoryCounts: Record<string, number>;
  wardBreakdown: Record<string, number>;
  cityBreakdown?: Record<string, number>;
  hasCrossCategoryOverlap: boolean;
  overlapAlert: string | null;
  complaints: SpatialComplaint[];
}

export interface SpatialCluster {
  clusterId: string;
  title: string;
  city?: string | null;
  ward: string | null;
  zone: string | null;
  complaintCount: number;
  openCount: number;
  centroid: {
    latitude: number;
    longitude: number;
  };
  radiusMeters: number;
  densityPerSqKm: number;
  dominantCategory: string;
  issueCategories: string[];
  categoryCounts: Record<string, number>;
  recurrenceScore: number;
  confidence: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;
  hasCrossCategoryOverlap: boolean;
  overlapCategories: string[];
  overlapSummary: string | null;
  firstReportedAt: string | null;
  lastReportedAt: string | null;
  complaints: SpatialComplaint[];
}

export interface CrossCategoryOverlapAlert {
  clusterId: string;
  title: string;
  city?: string | null;
  ward: string | null;
  overlapCategories: string[];
  overlapSummary: string | null;
  complaintCount: number;
  severity: string;
  centroid: {
    latitude: number;
    longitude: number;
  };
}

export interface SpatialClusteringResult {
  center: {
    latitude: number;
    longitude: number;
  } | null;
  radiusMeters: number | null;
  clusterDistanceMeters: number;
  minClusterSize: number;
  timeWindowDays: number | null;
  totalComplaintsAnalyzed: number;
  clusterCount: number;
  clusteredComplaintCount: number;
  excludedComplaintCount: number;
  crossCategoryOverlapCount: number;
  crossCategoryOverlaps: CrossCategoryOverlapAlert[];
  clusters: SpatialCluster[];
}

export type PersistedHotspotStatus = "ACTIVE" | "MONITORING" | "RESOLVED";

export interface PersistedHotspot {
  id: string;
  hotspotKey: string;
  title: string;
  city?: string | null;
  ward: string | null;
  zone: string | null;
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
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;
  hasCrossCategoryOverlap: boolean;
  overlapCategories: string[];
  overlapSummary: string | null;
  timeWindowDays: number | null;
  firstReportedAt: string | null;
  lastReportedAt: string | null;
  status: PersistedHotspotStatus | string;
  metadata: Record<string, unknown>;
  detectedAt: string;
  updatedAt: string;
  complaints: SpatialComplaint[];
}

export interface HotspotListResponse {
  total: number;
  activeCount: number;
  crossCategoryOverlapCount: number;
  hotspots: PersistedHotspot[];
}

export interface HotspotDetectResponse {
  detectedCount: number;
  persistedCount: number;
  totalComplaintsAnalyzed: number;
  crossCategoryOverlapCount: number;
  hotspots: PersistedHotspot[];
}

export interface WardAnalyticItem {
  city?: string | null;
  ward: string;
  zone: string;
  areaSqKm: number;
  totalComplaints: number;
  openComplaints: number;
  resolvedComplaints: number;
  highOrCriticalCount: number;
  densityPerSqKm: number;
  dominantCategory: string;
  categoryCounts: Record<string, number>;
  activeHotspots: number;
  overlapHotspots: number;
  center: {
    latitude: number;
    longitude: number;
  } | null;
}

export interface WardAnalyticsResponse {
  city?: string | null;
  timeWindowDays: number | null;
  totalWards: number;
  totalComplaints: number;
  wards: WardAnalyticItem[];
}

export interface ActiveCitySummary {
  city: string;
  complaintCount: number;
  openCount: number;
  hotspotCount: number;
  overlapCount: number;
  center: {
    latitude: number;
    longitude: number;
  } | null;
}

export interface CityDirectoryItem {
  city: string;
  state: string;
  country: string;
  center: {
    latitude: number;
    longitude: number;
  };
  hasComplaints: boolean;
}

export interface ActiveCitiesResponse {
  totalCities: number;
  cities: ActiveCitySummary[];
  directory: CityDirectoryItem[];
}

export interface GeocodePlaceResult {
  label: string;
  city: string;
  ward?: string | null;
  zone?: string | null;
  state?: string | null;
  country?: string | null;
  latitude: number;
  longitude: number;
  complaintCount?: number;
  source: string;
}

export interface GeocodeResponse {
  query: string;
  results: GeocodePlaceResult[];
}
