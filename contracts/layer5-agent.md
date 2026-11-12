# Layer 5 — Multi-Agent AI Orchestration API Contract

> **Status**: Implemented & Active  
> **Mount Prefix**: `/api/v1/intelligence/agents`  
> **Storage**: PostgreSQL (`agent_runs`, `agent_recommendations` via migration `016_create_multi_agent_ai.sql`)  
> **Consumers**: Layer 6 Officer Copilot (`Morning Digest`, `Conversational Investigation`, `Action Confirmation`) & Officer Telemetry.  
> **Boundary**: Layer 6 Copilot UI/routes (`/api/v1/copilot`) remain strictly separate from this layer.

---

## 1. Architecture Overview

### Seven Specialized Agents (Sequential Pipeline)
1. **`PriorityAgent`** — Ranks highest-risk assets/wards/complaints deterministically (`healthDeficit`, `openComplaintCount`, `recurrence`, `inActiveHotspot`, `maintenanceAgeMonths >= 6`, `DETERIORATING` trend) and resolves natural-language queries (asset code, complaint ref, city, or ward).
2. **`InvestigationAgent`** — Queries Layer 4 Civic Knowledge Graph (`investigate_asset_graph`, `investigate_complaint_graph`, `find_graph_path`) to extract multi-hop evidence chains and upstream co-located risk contributors.
3. **`InfrastructureAgent`** — Retrieves Layer 3 Infrastructure Health details (`get_asset_details`, `get_infrastructure_overview`) including the 5 deterministic penalties, maintenance history, and health trajectory.
4. **`SpatialAgent`** — Queries Layer 2 spatial hotspots & ward analytics (`list_hotspots`, `get_ward_analytics`, `analyze_nearby_complaints`) for geographic density and cross-category overlap signals.
5. **`ComplaintAgent`** — Inspects complaints, AI triage summaries, and semantic matches (`fetch_complaints`, `fetch_complaint_detail`, `semantic_search_complaints`, `find_related_complaints`).
6. **`RecommendationAgent`** — Generates 1–4 evidence-grounded actions (`JOINT_INSPECTION`, `PREVENTIVE_REHABILITATION`, `SPATIAL_HOTSPOT_SWEEP`, `COMPLAINT_TRIAGE`) requiring explicit officer confirmation (`requiresHumanConfirmation: true`).
7. **`ReportAgent`** — Compiles the structured executive brief (`headline`, `executiveSummary`, `keyFindings`, `guardrails`, `groundingReport`) and enforces post-generation grounding validation (optional Gemini prose polish only when `useGemini: true`, automatically rejected if any unverified entity code or numeric claim appears).

### Engineering Guardrails
- **Deterministic Math Only**: All priorities, health scores, distances, and counts come from Layer 1–4 software services, never LLM arithmetic.
- **Read-Only Tool Registry (`14` tools)**: Agents cannot mutate complaint/asset state directly; schema-checked args + role-per-agent access control (`TOOL_PERMISSION_DENIED` otherwise).
- **Non-Causal Inference Guardrail**: Any inferred upstream or cross-category link (`POTENTIALLY_IMPACTS`, `CROSS_IMPACTS`, `SIMILAR_TO`) is flagged `isNonCausalInferred: true` and framed as `"Potential Relationship (Non-Causal)"`.
- **Human-in-the-Loop Confirmation**: Every recommendation persists with `decisionStatus: "PENDING"` and `requiresHumanConfirmation: true`, requiring explicit `ACCEPTED | REJECTED | MODIFIED` action by an authorized officer (`RECOMMENDATION_DECIDE` permission).
- **Zero-Hallucination Grounding Validator**: Extracts entity codes (`RD-*`, `WP-*`, `DR-*`, `SL-*`, `SN-*`, `CP-*`), scores (`X/100`), distances (`Xm`), and percentages (`X%`) from outputs and checks them against verified tool payloads, reporting `unsupportedClaimCount` and `groundingScore`.

---

## 2. Endpoints

All endpoints require `Authorization: Bearer <officer_jwt>`. Citizens receive `403 Forbidden`.

### 2.1 `POST /api/v1/intelligence/agents/investigate`
Executes the 7-agent orchestrated pipeline, persists the parent `ORCHESTRATION` run, 7 `AGENT_STEP` child runs, and `agent_recommendations`, and returns the grounded executive brief.  
Permission: `COMPLAINT_READ_DEPARTMENT`.

**Request Body (all fields optional; provide at least one or defaults to highest-priority risk scan)**:
```json
{
  "question": "Why is Road RD-HYD-1024 repeatedly receiving complaints?",
  "targetType": "ASSET",
  "targetId": "RD-HYD-1024",
  "assetCode": "RD-HYD-1024",
  "complaintId": null,
  "city": "Hyderabad",
  "ward": null,
  "includeInferred": true,
  "useGemini": false
}
```

**Response `200 OK`**:
- `run`: Parent `AgentRun` (`id`, `status`, `targetType`, `targetId`, `city`, `toolCallsCount`, `validToolCallsCount`, `toolAccuracyPercent`, `unsupportedClaimCount`, `modelName`, `modelVersion`, `durationMs`, `stepCount`, `recommendationCount`).
- `report`: Structured investigation report (`headline`, `executiveSummary`, `keyFindings`, `resolvedTarget`, `prioritySummary`, `infrastructureSummary`, `upstreamContributingAssets`, `evidenceChains`, `shortestPathExample`, `spatialSummary`, `complaintSummary`, `guardrails`).
- `recommendations`: Array of persisted `Recommendation` items (`id`, `category`, `priority`, `actionTitle`, `proposedAction`, `rationale`, `evidenceCitations`, `confidence`, `requiresHumanConfirmation`, `isNonCausalInferred`, `decisionStatus`).
- `stepRuns`: Ordered array of all 7 `AGENT_STEP` trace records (`stepOrder: 1..7`).
- `groundingReport`: `{ passed, checkedFactCount, groundedFactCount, unsupportedClaimCount, groundingScore, unsupportedClaims }`.

---

### 2.2 `GET /api/v1/intelligence/agents/runs`
Lists recent multi-agent orchestration runs.  
Permission: `COMPLAINT_READ_DEPARTMENT`.  
**Query Params**: `city`, `status` (`RUNNING | COMPLETED | PARTIAL | FAILED`), `targetType`, `limit` (`1..100`, default `20`).

### 2.3 `GET /api/v1/intelligence/agents/runs/:id`
Returns a single orchestration trace with all 7 `stepRuns` and linked `recommendations`.  
Permission: `COMPLAINT_READ_DEPARTMENT`.

### 2.4 `GET /api/v1/intelligence/agents/recommendations`
Lists persisted agent recommendations ordered by pending status & priority.  
Permission: `COMPLAINT_READ_DEPARTMENT`.  
**Query Params**: `status` (`PENDING | ACCEPTED | REJECTED | MODIFIED`), `city`, `priority` (`LOW | MEDIUM | HIGH | CRITICAL`), `runId`, `limit`.

### 2.5 `PATCH /api/v1/intelligence/agents/recommendations/:id/decision`
Records officer human-in-the-loop confirmation (`ACCEPTED`, `REJECTED`, or `MODIFIED`). Also emits an audit entry to `ai_feedback_events`.  
Permission: `RECOMMENDATION_DECIDE`.

**Request Body**:
```json
{
  "decision": "ACCEPTED",
  "modifiedAction": null,
  "decisionNote": "Scheduled joint Roads + Water team pressure check for tomorrow morning."
}
```
> Note: `modifiedAction` (minimum 5 characters) is **required** when `decision === "MODIFIED"`.

### 2.6 `GET /api/v1/intelligence/agents/metrics`
Returns Plan Section 15 Agentic AI evaluation metrics (optionally scoped by `?city=...`):
- `totalOrchestrations`, `taskSuccessRatePercent`
- `toolCallsTotal`, `validToolCallsTotal`, `toolUseAccuracyPercent`
- `totalUnsupportedClaims`, `unsupportedClaimRatePercent`, `zeroHallucinationRunPercent`
- `provenanceCompletenessPercent`, `avgDurationMs`
- `agentBreakdown[]` (per-agent step counts, tool usage, latency)
- `recommendationLifecycle` (`total`, `pending`, `accepted`, `rejected`, `modified`, `decidedCount`, `nonCausalFlaggedCount`, `avgConfidence`, `acceptanceRatePercent`)

### 2.7 `GET /api/v1/intelligence/agents/tools`
Returns the declarative list of registered read-only agent tools, target layers, and agent permissions.  
Permission: `COMPLAINT_READ_DEPARTMENT`.
