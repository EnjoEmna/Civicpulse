# Layer 3 — Infrastructure Health & Asset Intelligence API Contract

> **Status**: Implemented & Active  
> **Mount Prefix**: `/api/v1/intelligence/infrastructure`  
> **Consumers**: Officer Dashboard (`/officer/infrastructure-health`, `ComplaintReview`, `Dashboard`) & Layer 6 Officer Copilot (read-only context enrichment).

---

## 1. Domain Concepts

### Asset Types (`assetType`)
- `ROAD_SEGMENT` — Roads, junctions, culverts, asphalt stretches
- `WATER_PIPELINE` — Treated water supply mains & distribution lines
- `DRAINAGE` — Stormwater drains, flood-prone culverts
- `STREETLIGHT_CLUSTER` — Municipal street lighting feeders & pole clusters
- `WASTE_POINT` — Collection stations, transfer hubs & civic bins

### Health Grades (`healthGrade`) & Score Scale (`0` to `100`)
| Score Range | Grade | Operational Meaning |
| --- | --- | --- |
| `80 – 100` | `GOOD` | Healthy; routine preventive monitoring |
| `60 – 79` | `FAIR` | Minor stress or aging maintenance cycle |
| `40 – 59` | `POOR` | Recurring failures / overdue maintenance; schedule intervention |
| `0 – 39` | `CRITICAL` | Severe degradation or cross-system failure; urgent escalation |

### Health Score Formula (Deterministic & Explainable)
$$\text{Health Score} = \max\Big(0, \min\Big(100, \text{round}\big(100 - (\text{complaintImpactPenalty} + \text{recurrencePenalty} + \text{severityPenalty} + \text{unresolvedDurationPenalty} + \text{maintenanceAgePenalty})\big)\Big)\Big)$$

| Penalty Component | Max Cap | Signals Measured |
| --- | --- | --- |
| `complaintImpactPenalty` | `28` | Open linked complaints (`DIRECT` = `1.0x`, `CROSS_IMPACT` = `0.6x`), recent resolved carry-over, community upvotes |
| `recurrencePenalty` | `22` | Repeat reports in last 30 days, active open `CROSS_IMPACT` overlap (e.g. water seepage eroding roads), active spatial hotspot membership |
| `severityPenalty` | `20` | Open complaint effective priority weights (`CRITICAL: 7.5`, `HIGH: 4.8`, `MEDIUM: 2.2`, `LOW: 0.9`) |
| `unresolvedDurationPenalty` | `15` | Weighted blend (`0.6 * maxOpenAgeDays + 0.4 * avgOpenAgeDays`) of unresolved complaints |
| `maintenanceAgePenalty` | `15` | Months elapsed since last completed maintenance work (`REPAIR`, `RESURFACING`, `REPLACEMENT`, `CLEANING`, `PREVENTIVE_MAINTENANCE`) or asset install date (`1.25 pts/month`, baseline `10 mo` if unknown) |

### Complaint-to-Asset Link Types (`linkType`)
- `DIRECT` — Complaint primary/canonical category maps directly to this asset type within catchment radius / ward
- `CROSS_IMPACT` — Secondary systemic impact (e.g., `WATER_SUPPLY` seepage within 220m of a `ROAD_SEGMENT`)
- `MANUAL` — Manually curated link preserved across automated re-scoring

### Trends (`trend`)
- `IMPROVING` — Score improved `>= +3` vs previous scored snapshot, or recently maintained (`<= 30d`) with zero open complaints
- `DETERIORATING` — Score dropped `<= -3`, or `>= 2` open linked complaints, or active cross-impact dragging score `< 65`
- `STABLE` — Otherwise

---

## 2. Endpoints

All routes require `Authorization: Bearer <officer_jwt>` and `COMPLAINT_READ_DEPARTMENT` (write mutations require `COMPLAINT_UPDATE_STATUS`).

### 2.1 `GET /api/v1/intelligence/infrastructure/health`
Returns scored infrastructure assets, summary metrics, formula metadata, and ward-level rollups.

**Query Params (optional)**:
- `city` (string, e.g. `Hyderabad`, `Thiruvananthapuram`, `Bengaluru`)
- `ward` (string)
- `assetType` (`ROAD_SEGMENT | WATER_PIPELINE | DRAINAGE | STREETLIGHT_CLUSTER | WASTE_POINT`)
- `grade` (`CRITICAL | POOR | FAIR | GOOD`)
- `sortBy` (`lowest_health | highest_health | most_complaints | oldest_maintenance | ward`, default `lowest_health`)
- `limit` (integer `1..250`, default `100`)

**Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "filters": { "city": null, "ward": null, "assetType": null, "grade": null },
    "summary": {
      "totalAssets": 12,
      "avgHealthScore": 69,
      "avgHealthGrade": "FAIR",
      "gradeCounts": { "CRITICAL": 2, "POOR": 3, "FAIR": 3, "GOOD": 4 },
      "openLinkedComplaints": 14,
      "maintenanceOverdueCount": 8,
      "deterioratingCount": 4
    },
    "formula": {
      "expression": "Health Score = 100 - (Complaint Impact + Recurrence & Overlap + Severity + Unresolved Duration + Maintenance Age)",
      "weights": {
        "complaintImpactMax": 28,
        "recurrenceMax": 22,
        "severityMax": 20,
        "unresolvedDurationMax": 15,
        "maintenanceAgeMax": 15
      }
    },
    "assets": [
      {
        "id": "uuid",
        "assetCode": "RD-HYD-1024",
        "name": "4th Cross Rd & Bus Shelter Segment",
        "assetType": "ROAD_SEGMENT",
        "assetTypeLabel": "Road Segment",
        "city": "Hyderabad",
        "ward": "Ward 12 · Banjara Hills",
        "zone": "Central Zone",
        "address": "4th Cross Rd, Banjara Hills, Hyderabad",
        "latitude": 17.4156,
        "longitude": 78.4357,
        "catchmentRadiusMeters": 280,
        "department": "Roads & Public Works",
        "installDate": "2019-06-15",
        "lastMaintainedAt": "2024-11-10T00:00:00.000Z",
        "maintenanceAgeMonths": 24.0,
        "healthScore": 37,
        "healthGrade": "CRITICAL",
        "trend": "DETERIORATING",
        "complaintCount": 4,
        "openComplaintCount": 4,
        "recurrenceCount": 3,
        "maintenanceEventCount": 1,
        "scoreBreakdown": {
          "baseScore": 100,
          "complaintImpactPenalty": 21.6,
          "recurrencePenalty": 21.4,
          "severityPenalty": 20,
          "unresolvedDurationPenalty": 0.4,
          "maintenanceAgePenalty": 15,
          "totalPenalty": 63,
          "caps": {
            "complaintImpact": 28,
            "recurrence": 22,
            "severity": 20,
            "unresolvedDuration": 15,
            "maintenanceAge": 15
          },
          "factors": {
            "directCount": 3,
            "crossImpactCount": 1,
            "openCount": 4,
            "resolvedActiveCount": 0,
            "recent30dCount": 4,
            "upvoteTotal": 0,
            "maxOpenAgeDays": 1.2,
            "avgOpenAgeDays": 0.8,
            "maintenanceAgeMonths": 24,
            "inActiveHotspot": true
          }
        },
        "lastScoredAt": "2026-11-11T08:00:00.000Z",
        "createdAt": "2026-11-11T08:00:00.000Z",
        "updatedAt": "2026-11-11T08:00:00.000Z"
      }
    ],
    "wards": []
  }
}
```

### 2.2 `GET /api/v1/intelligence/infrastructure/wards`
Aggregates ward-level infrastructure health (`0.75 * avg(assetScores) + 0.25 * min(assetScore)` when assets exist; synthetic complaint backlog decay for wards without registered assets yet).

**Query Params**: `city` (optional)  
**Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "city": null,
    "totalWards": 5,
    "wards": [
      {
        "city": "Thiruvananthapuram",
        "ward": "Kalambalam Ward",
        "zone": "Thiruvananthapuram Rural Zone",
        "healthScore": 44,
        "healthGrade": "POOR",
        "assetCount": 3,
        "criticalOrPoorAssets": 2,
        "deterioratingCount": 2,
        "totalComplaints": 6,
        "openComplaints": 5,
        "highOrCriticalCount": 2,
        "worstAsset": {
          "id": "uuid",
          "assetCode": "RD-TVM-066",
          "name": "NH-66 Kalambalam Junction Carriageway",
          "assetType": "ROAD_SEGMENT",
          "healthScore": 36,
          "healthGrade": "CRITICAL"
        }
      }
    ]
  }
}
```

### 2.3 `GET /api/v1/intelligence/infrastructure/assets/:id`
Returns full asset record, explainable breakdown, linked complaints (`DIRECT` + `CROSS_IMPACT`), `maintenanceEvents`, and `healthHistory` snapshots.

### 2.4 `POST /api/v1/intelligence/infrastructure/assets`
Registers a new civic asset, auto-links existing complaints within catchment/ward, computes initial score, and returns full asset details (`201 Created`).  
Required fields: `assetCode`, `name`, `assetType`, `latitude`, `longitude`.  
Optional fields: `city`, `ward`, `zone`, `address`, `catchmentRadiusMeters` (`50..5000`), `department`, `installDate`, `lastMaintainedAt`.

### 2.5 `POST /api/v1/intelligence/infrastructure/assets/:id/maintenance`
Logs a maintenance or inspection event (`INSPECTION | REPAIR | RESURFACING | REPLACEMENT | CLEANING | PREVENTIVE_MAINTENANCE` with outcome `COMPLETED | PARTIAL | DEFERRED | FAILED_INSPECTION`). When `outcome === "COMPLETED"` for restorative work, `last_maintained_at` updates automatically and health score recalculates (`201 Created`).

### 2.6 `POST /api/v1/intelligence/infrastructure/recompute`
Forces recomputation across all assets (optionally scoped by `{ "city": "..." }`) and appends a history snapshot.

### 2.7 `GET /api/v1/intelligence/infrastructure/complaints/:complaintId`
Returns all `infrastructure_assets` linked (`DIRECT` / `CROSS_IMPACT` / `MANUAL`) to a specific complaint, including `linkType`, `linkConfidence`, `linkReason`, and `distanceMeters`.

### 2.8 `GET /api/v1/intelligence/infrastructure/metrics`
Returns evaluation & sensitivity diagnostics (Plan Section 15):
- `gradeDistribution` & `trendDistribution` (`IMPROVING`, `STABLE`, `DETERIORATING`)
- `averagePenalties` (mean contribution across the 5 deterministic penalty components)
- `labelAlignment` (fraction of overdue-maintenance assets scoring `< 80`, plus cross-impact exposure)
- `sensitivityAnalysis` (counterfactual delta if open backlog is resolved, maintenance completed, or cross-category overlap removed)

---

## 3. Automatic Re-Scoring Hooks
- Triggered automatically (non-blocking) when a complaint is created, status-updated, or assigned in `complaint.service.js`.
- Also executed during background sweeper cycles in `retry.job.js`.
