# CivicPulse

CivicPulse is an AI-powered civic complaint & infrastructure intelligence platform spanning:
- **Layer 1 — Complaint Understanding**: AI triage, categorization, summaries, hybrid duplicate detection, and semantic search.
- **Layer 2 — Spatial Intelligence**: Multi-city hotspot clustering, cross-category overlap alerts, ward analytics, and interactive maps.
- **Layer 3 — Infrastructure Health Scores**: Deterministic 0–100 physical asset condition scoring, trend snapshots, sensitivity diagnostics, and maintenance tracking.
- **Layer 4 — Civic Knowledge Graph**: PostgreSQL-backed multi-hop entity & relationship graph linking complaints, assets, hotspots, maintenance events, wards, and departments with explicit provenance and non-causal guardrails.
- **Layer 5 — Multi-Agent AI**: 7-agent orchestrated investigation pipeline (`Priority`, `Investigation`, `Infrastructure`, `Spatial`, `Complaint`, `Recommendation`, `Report`) with read-only tool guardrails, zero-hallucination verification, non-causal framing, and human-in-the-loop recommendation confirmation.

## Prerequisites
- Node.js 20+
- PostgreSQL running locally (optional `pgvector` and `postgis` extensions are used automatically when installed; falls back cleanly when absent)

## Quick Start

### 1. Backend API — `http://localhost:5000`
```bash
cd backend
npm install
cp .env.example .env   # Configure DATABASE_URL, JWT_SECRET, and optional GEMINI_API_KEY
node setup-db.js       # Creates DB, applies migrations 000-016, seeds demo data, health snapshots & knowledge graph
npm start              # Or npm run dev
```

### 2. Citizen Portal — `http://localhost:5173` (separate terminal)
```bash
cd frontend/citizen-portal
npm install
cp .env.example .env
npm run dev
```

### 3. Officer Dashboard — `http://localhost:5174` (separate terminal)
```bash
cd frontend/officer-dashboard
npm install
cp .env.example .env
npm run dev
```

## Demo Login Credentials (Seeded by `backend/setup-db.js`)
- **Officer Dashboard** (`http://localhost:5174/login`): `officer@civicpulse.org` / `Officer@123`
- **Citizen Portal** (`http://localhost:5173/login`): `citizen@civicpulse.org` / `Citizen@123`
