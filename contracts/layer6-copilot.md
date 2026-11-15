# Layer 6 — Officer Copilot API Contract

> **Status**: Implemented & Active  
> **Mount Prefix**: `/api/v1/copilot`  
> **Storage**: PostgreSQL (`copilot_sessions`, `copilot_messages` via migration `017_create_officer_copilot.sql`) linked to Layer 5 (`agent_runs`, `agent_recommendations`).  
> **Consumers**: Officer Dashboard (`/officer/copilot`, Dashboard Morning Digest widget, contextual "Ask Copilot" links across Infrastructure Health and Civic Knowledge Graph).

---

## 1. Purpose & Guardrails

The **Officer Copilot** wraps Layer 1–5 intelligence into an operational command workspace where municipal officers:
1. Receive a **Morning Digest** ranking urgent infrastructure risks, active spatial hotspots, and pending recommendations.
2. Conduct multi-turn **Conversational Investigations** grounded by the Layer 5 7-agent orchestrator (`PriorityAgent` -> `InvestigationAgent` -> `InfrastructureAgent` -> `SpatialAgent` -> `ComplaintAgent` -> `RecommendationAgent` -> `ReportAgent`).
3. Inspect full **Explainability** (`scoreBreakdown`, Knowledge Graph evidence chains, citizen tickets, maintenance logs, and zero-hallucination verification `groundingReport`).
4. Exercise **Human-in-the-Loop Confirmation** (`ACCEPTED | REJECTED | MODIFIED`) before any proposed municipal action proceeds.

### Non-Negotiable Engineering Guardrails
- **Deterministic Math Only**: Health scores, penalties, distances, and rankings come directly from Layer 2/3 deterministic calculators.
- **Zero-Hallucination Grounding**: Every numeric score, entity code, and ticket citation is verified against tool outputs (`unsupportedClaimCount`).
- **Non-Causal Framing**: Cross-infrastructure links (such as co-located water pipelines affecting adjacent roads) are explicitly tagged `"Potential Relationship (Non-Causal)"`.
- **RBAC Protection**: All Copilot query endpoints require `COPILOT_QUERY` (`OFFICER` / `ADMIN`), and recommendation decisions require `RECOMMENDATION_DECIDE` (`OFFICER` / `ADMIN`). Citizen tokens receive `403 Forbidden`.

---

## 2. Endpoints

### 2.1 `GET /api/v1/copilot/digest`
Returns the Officer Morning Digest summarizing urgent assets, potential non-causal contributing infrastructure, active hotspots, and pending recommendations.  
Permission: `COPILOT_QUERY`.  
**Query Params**: `city` (optional), `limit` (`1..10`, default `5`).

### 2.2 `POST /api/v1/copilot/ask`
Submits a natural-language Copilot question (creating a new `copilot_sessions` thread or appending to `sessionId`), runs the Layer 5 7-agent orchestrator, persists `USER` and `COPILOT` turns in `copilot_messages`, and returns conversational prose, structured explainability, suggested follow-ups, and persisted action recommendations.  
Permission: `COPILOT_QUERY`.  
**Request Body**:
```json
{
  "question": "Why is Road RD-HYD-1024 repeatedly receiving complaints?",
  "sessionId": null,
  "assetCode": "RD-HYD-1024",
  "city": "Hyderabad",
  "includeInferred": true,
  "useGemini": false
}
```
**Response `200 OK`**:
- `session`: `CopilotSession` metadata (`id`, `title`, `city`, `targetType`, `targetId`, `lastMessageAt`).
- `userMessage`: persisted officer turn.
- `assistantMessage`: persisted Copilot reply (`content`, `agentRunId`, `latencyMs`, `structuredPayload.explainability`, `structuredPayload.suggestedFollowUps`, `recommendations[]`).
- `recommendations`: live persisted `agent_recommendations` requiring officer confirmation.
- `agentRun`: parent Layer 5 `ORCHESTRATION` run summary.

### 2.3 `GET /api/v1/copilot/sessions`
Lists recent Copilot conversation threads for the authenticated officer (or all sessions for `ADMIN`).  
Permission: `COPILOT_QUERY`.  
**Query Params**: `city` (optional), `limit` (default `20`).

### 2.4 `GET /api/v1/copilot/sessions/:id`
Loads full chronological message history for a Copilot session along with hydrated live `decisionStatus` values for every linked recommendation. Enforces session ownership (`403 Forbidden` for non-owners).  
Permission: `COPILOT_QUERY`.

### 2.5 `PATCH /api/v1/copilot/recommendations/:id/decision`
Records explicit human-in-the-loop confirmation (`ACCEPTED | REJECTED | MODIFIED`) for a Copilot/Agent recommendation and emits an audit event to `ai_feedback_events`.  
Permission: `RECOMMENDATION_DECIDE`.  
**Request Body**:
```json
{
  "decision": "MODIFIED",
  "modifiedAction": "Inspect WP-HYD-204 joint valve pressure first, then resurface RD-HYD-1024",
  "decisionNote": "Assigned combined Roads + Water field crew for 08:00 AM sweep."
}
```

### 2.6 `GET /api/v1/copilot/metrics`
Returns combined Layer 5 & Layer 6 evaluation telemetry (`taskSuccessRatePercent`, `toolUseAccuracyPercent`, `unsupportedClaimRatePercent`, `zeroHallucinationRunPercent`, `recommendationLifecycle`, and `copilotUsage` stats: `totalSessions`, `activeSessions24h`, `userQueriesCount`, `avgCopilotLatencyMs`).  
Permission: `COPILOT_QUERY`.
