export type GraphEntityType =
  | "COMPLAINT"
  | "INFRASTRUCTURE_ASSET"
  | "HOTSPOT"
  | "MAINTENANCE_EVENT"
  | "WARD"
  | "DEPARTMENT"
  | "OFFICER"
  | "CATEGORY";

export type GraphRelationType =
  | "AFFECTS"
  | "CROSS_IMPACTS"
  | "POTENTIALLY_IMPACTS"
  | "IN_HOTSPOT"
  | "LOCATED_IN"
  | "MAINTAINED_BY"
  | "ROUTED_TO"
  | "ASSIGNED_TO"
  | "HAS_CATEGORY"
  | "HAS_MAINTENANCE"
  | "PERFORMED_BY"
  | "SIMILAR_TO";

export interface GraphProvenance {
  model?: string;
  version?: string;
  sourceTable?: string;
  sourceRecordIds?: string[];
  confidence?: number;
  isInferred?: boolean;
  evidenceSummary?: string;
  disclaimer?: string;
  generatedAt?: string;
}

export interface GraphNode {
  id: string;
  nodeKey: string;
  entityType: GraphEntityType;
  externalId: string | null;
  label: string;
  city: string | null;
  ward: string | null;
  properties: Record<string, unknown>;
  provenance: GraphProvenance;
  createdAt?: string;
  updatedAt?: string;
}

export interface GraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: GraphRelationType;
  weight: number;
  confidence: number;
  isInferred: boolean;
  evidence: string | null;
  provenance: GraphProvenance;
  properties?: Record<string, unknown>;
  traversalDirection?: "OUTGOING" | "INCOMING";
  createdAt?: string;
  updatedAt?: string;
}

export interface GraphMetricsResponse {
  city: string | null;
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<string, number>;
  edgesByRelation: Record<string, number>;
  factualEdgesCount: number;
  inferredEdgesCount: number;
  crossInfrastructurePotentialLinks: number;
  provenanceCompletenessPercent: number;
  relationshipCoverage: {
    complaintCount: number;
    connectedComplaints: number;
    complaintConnectivityPercent: number;
    assetCount: number;
    connectedAssets: number;
    assetConnectivityPercent: number;
  };
  lastSyncedAt: string | null;
}

export interface FlagshipTarget {
  nodeKey: string;
  assetCode: string;
  label: string;
  city: string | null;
  ward: string | null;
  healthScore: number | null;
  healthGrade: string | null;
}

export interface GraphOverviewResponse {
  filters: {
    city: string | null;
    entityType: string | null;
    q: string | null;
  };
  metrics: GraphMetricsResponse;
  flagshipTargets: FlagshipTarget[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  guardrailNotice: string;
}

export interface EvidenceChainStep {
  nodeKey: string;
  entityType: GraphEntityType;
  label: string;
  edgeLabelAfter: string | null;
  isInferred: boolean;
}

export interface EvidenceChain {
  id: string;
  chainType: string;
  title: string;
  isInferred: boolean;
  confidence: number;
  summary: string | null;
  disclaimer: string | null;
  provenance: GraphProvenance;
  steps: EvidenceChainStep[];
}

export interface PotentialContributingAsset {
  assetNodeId: string;
  nodeKey: string;
  assetCode: string;
  name: string;
  assetType?: string;
  healthScore?: number;
  healthGrade?: string;
  relationshipLabel: string;
  distanceMeters: number | null;
  confidence: number;
  evidence: string | null;
  disclaimer: string;
  upstreamOpenComplaints: number;
  upstreamComplaints: Array<{
    nodeKey: string;
    externalId: string | null;
    referenceId?: string | null;
    title?: string;
    status?: string;
  }>;
}

export interface NodeNeighborhoodResponse {
  centerNode: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  depth: number;
  includeInferred: boolean;
  neighborCountsByType: Record<string, number>;
  guardrailNotice: string;
}

export interface AssetInvestigationResponse {
  centerNode: GraphNode;
  asset: Record<string, unknown>;
  nodes: GraphNode[];
  edges: GraphEdge[];
  evidenceChains: EvidenceChain[];
  potentialContributingAssets: PotentialContributingAsset[];
  directComplaints: Array<GraphNode & { edgeConfidence?: number; evidence?: string | null }>;
  crossImpactComplaints: Array<GraphNode & { edgeConfidence?: number; evidence?: string | null }>;
  hotspots: GraphNode[];
  maintenanceEvents: GraphNode[];
  departments: GraphNode[];
  wards: GraphNode[];
  investigationSummary: string;
  guardrailNotice: string;
}

export interface ComplaintInvestigationResponse {
  centerNode: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  evidenceChains: EvidenceChain[];
  potentialContributingAssets: PotentialContributingAsset[];
  investigationSummary: string;
  guardrailNotice: string;
}

export interface ShortestPathResponse {
  found: boolean;
  hopCount: number | null;
  containsInferredEdge: boolean;
  pathNodes: GraphNode[];
  pathEdges: GraphEdge[];
  narrativeSteps: string[];
  guardrailNotice: string;
}

export interface RebuildGraphResponse {
  city: string | null;
  nodesSynced: number;
  edgesSynced: number;
  inferredEdgesCount: number;
  durationMs: number;
  generatedAt: string;
}
