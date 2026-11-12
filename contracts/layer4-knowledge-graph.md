# Layer 4 — Civic Knowledge Graph API Contract

> **Status**: Implemented & Active  
> **Mount Prefix**: `/api/v1/intelligence/graph`  
> **Storage**: PostgreSQL (`knowledge_graph_nodes`, `knowledge_graph_edges` via migration `015_create_civic_knowledge_graph.sql`)  
> **Consumers**: Officer Dashboard (`/officer/knowledge-graph`, deep links from `InfrastructureHealth` & `ComplaintReview`) and future Layer 5 Multi-Agent / Layer 6 Officer Copilot investigation tools.

---

## 1. Domain Model & Guardrails

### Entity Types (`entityType`)
- `COMPLAINT` — Citizen grievance ticket (`nodeKey`: `complaint:<referenceId|uuid>`)
- `INFRASTRUCTURE_ASSET` — Physical municipal asset (`nodeKey`: `asset:<assetCode>`)
- `HOTSPOT` — Layer 2 spatial cluster (`nodeKey`: `hotspot:<hotspotKey>`)
- `MAINTENANCE_EVENT` — Recorded inspection/repair event (`nodeKey`: `maintenance:<uuid>`)
- `WARD` — City/ward administrative boundary (`nodeKey`: `ward:<city-slug>::<ward-slug>`)
- `DEPARTMENT` — Responsible municipal department (`nodeKey`: `department:<dept-slug>`)
- `OFFICER` — Assigned officer or field actor (`nodeKey`: `officer:<uuid>`)
- `CATEGORY` — Canonical issue taxonomy category (`nodeKey`: `category:<CANONICAL_CATEGORY>`)

### Relationship Types (`relationType`)
| Relation | Direction | `isInferred` | Meaning |
| --- | --- | --- | --- |
| `AFFECTS` | `COMPLAINT → INFRASTRUCTURE_ASSET` | `false` | Complaint falls directly within asset catchment/category |
| `CROSS_IMPACTS` | `COMPLAINT → INFRASTRUCTURE_ASSET` | `true` | Secondary cross-category overlap within proximity radius (e.g., water report near road segment) |
| `POTENTIALLY_IMPACTS` | `INFRASTRUCTURE_ASSET → INFRASTRUCTURE_ASSET` | `true` | Spatial proximity (`<= 250m`) risk rule (e.g., `WATER_PIPELINE` / `DRAINAGE` → `ROAD_SEGMENT`) |
| `IN_HOTSPOT` | `COMPLAINT \| INFRASTRUCTURE_ASSET → HOTSPOT` | `false` | Belongs to or intersects active Layer 2 DBSCAN hotspot |
| `LOCATED_IN` | `COMPLAINT \| INFRASTRUCTURE_ASSET \| HOTSPOT → WARD` | `false` | Administrative ward placement |
| `MAINTAINED_BY` | `INFRASTRUCTURE_ASSET → DEPARTMENT` | `false` | Owning maintenance department |
| `ROUTED_TO` | `COMPLAINT → DEPARTMENT` | `false` | Complaint routing department |
| `ASSIGNED_TO` | `COMPLAINT → OFFICER` | `false` | Assigned case officer |
| `HAS_CATEGORY` | `COMPLAINT → CATEGORY` | `false` | Canonical / AI classification category |
| `HAS_MAINTENANCE` | `INFRASTRUCTURE_ASSET → MAINTENANCE_EVENT` | `false` | Historical repair, resurfacing, or inspection record |
| `PERFORMED_BY` | `MAINTENANCE_EVENT → OFFICER` | `false` | Officer who logged or executed field work |
| `SIMILAR_TO` | `COMPLAINT → COMPLAINT` | `true` | Semantic vector cosine similarity (`>= 0.72`, `>= 0.82` cross-city) |

### Engineering Guardrails
1. **Non-Causal Inference Rule (Plan Sections 7 & 16)**: Every inferred edge (`isInferred: true`, including `POTENTIALLY_IMPACTS`, `CROSS_IMPACTS`, `SIMILAR_TO`) is surfaced as a **"Potential Relationship (Non-Causal)"** with an explicit `provenance.disclaimer` requiring officer/engineering verification before action.
2. **Full Provenance Metadata (Plan Section 12)**: Every node and edge carries `provenance`:
   ```json
   {
     "model": "civicpulse-kg-builder",
     "version": "1.0.0",
     "sourceTable": "infrastructure_assets",
     "sourceRecordIds": ["uuid-1", "uuid-2"],
     "confidence": 0.88,
     "isInferred": true,
     "evidenceSummary": "WP-HYD-204 (water pipeline) lies 62m from RD-HYD-1024 (road segment) — potential seepage/subsurface risk",
     "disclaimer": "Potential relationship inferred from spatial proximity between co-located infrastructure assets; NOT confirmed causation without field inspection.",
     "generatedAt": "2026-11-12T00:00:00.000Z"
   }
   ```

---

## 2. Endpoints

All endpoints require `Authorization: Bearer <officer_jwt>` (`COMPLAINT_READ_DEPARTMENT` permission). Citizen JWTs receive `403 Forbidden`.

### 2.1 `GET /api/v1/intelligence/graph/overview`
Returns filtered nodes, edges between them, flagship degraded asset quick targets, evaluation metrics, and guardrail notice.

**Query Params (optional)**: `city`, `entityType`, `q` (search), `limit` (`1..400`, default `120`).

### 2.2 `GET /api/v1/intelligence/graph/investigate/asset/:assetIdOrCode`
Flagship asset investigation query (e.g., `RD-HYD-1024`, `asset:RD-HYD-1024`, or asset UUID). Returns `depth=2` ego-subgraph plus structured:
- `evidenceChains`: Ordered multi-hop chains (`POTENTIAL_CROSS_INFRASTRUCTURE`, `CROSS_IMPACT_REPORT`, `DIRECT_COMPLAINT`, `MAINTENANCE_HISTORY`)
- `potentialContributingAssets`: Upstream co-located assets (`relationshipLabel: "Potential Relationship (Non-Causal)"`, distance, confidence, disclaimer, upstream complaints)
- `investigationSummary` & `guardrailNotice`

**Query Params (optional)**: `includeInferred` (`true | false`, default `true`).

### 2.3 `GET /api/v1/intelligence/graph/investigate/complaint/:complaintId`
Accepts complaint UUID, `#CP-...`, `CP-...`, or `complaint:...` node key. Returns connected assets, potential upstream contributors, semantic peers, and evidence chains.

### 2.4 `GET /api/v1/intelligence/graph/nodes/:nodeKey`
Expands k-hop neighborhood (`depth` `1..3`, default `2`; `maxNodes` `10..150`, default `75`; `includeInferred` boolean) around any entity node (`asset:...`, `complaint:...`, `hotspot:...`, `ward:...`, `department:...`, `officer:...`, `category:...`, `maintenance:...`).

### 2.5 `GET /api/v1/intelligence/graph/path`
Bidirectional/BFS shortest path finder between any two resolvable graph entities (`from` and `to` required, optional `maxDepth` `1..6`, default `5`, and `includeInferred`). Returns `found`, `hopCount`, `containsInferredEdge`, `pathNodes`, `pathEdges`, `narrativeSteps`, and `guardrailNotice`.

### 2.6 `GET /api/v1/intelligence/graph/metrics`
Returns Plan Section 15 Knowledge Graph metrics (optionally scoped by `?city=...`):
- `totalNodes`, `totalEdges`, `nodesByType`, `edgesByRelation`
- `factualEdgesCount`, `inferredEdgesCount`, `crossInfrastructurePotentialLinks`
- `provenanceCompletenessPercent`
- `relationshipCoverage`: `complaintConnectivityPercent`, `assetConnectivityPercent`

### 2.7 `POST /api/v1/intelligence/graph/rebuild`
Rebuilds and reconciles the Knowledge Graph deterministically from live PostgreSQL records (optional `{ "city": "..." }` body; full rebuild prunes stale builder edges).

---

## 3. Automatic Sync Triggers
- Initial & idempotent startup build: `backend/setup-db.js` and `backend/src/jobs/retry.job.js` (`startJobRunner`).
- Event-driven non-blocking incremental syncs: `complaint.service.js` (create/status/assign), `infrastructure.service.js` (register/maintenance/recompute), and `hotspot.service.js` (detect/status).
