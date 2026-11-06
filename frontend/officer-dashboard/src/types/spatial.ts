export interface SpatialAnalysisRequest {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  maxResults: number;
  category?: string;
}

export interface SpatialClusteringRequest {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  clusterDistanceMeters: number;
  minClusterSize: number;
  category?: string;
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
  returnedCount: number;
  maxResults: number;
  categoryCounts: Record<string, number>;
  complaints: SpatialComplaint[];
}

export interface SpatialCluster {
  clusterId: string;
  complaintCount: number;
  centroid: {
    latitude: number;
    longitude: number;
  };
  categoryCounts: Record<string, number>;
  complaints: SpatialComplaint[];
}

export interface SpatialClusteringResult {
  center: {
    latitude: number;
    longitude: number;
  };
  radiusMeters: number;
  clusterDistanceMeters: number;
  minClusterSize: number;
  totalComplaintsAnalyzed: number;
  clusterCount: number;
  clusteredComplaintCount: number;
  excludedComplaintCount: number;
  clusters: SpatialCluster[];
}
