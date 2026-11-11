# CivicPulse

CivicPulse is an AI-powered civic complaint platform with complaint understanding (AI triage, categorization, summaries, hybrid duplicate detection, and semantic search) and spatial intelligence (multi-city hotspot clustering, cross-category overlap alerts, ward analytics, and interactive maps).

## Prerequisites
- Node.js 20+
- PostgreSQL running locally (optional `pgvector` and `postgis` extensions are used automatically when installed; falls back cleanly when absent)

## Quick Start

### 1. Backend API — `http://localhost:5000`
```bash
cd backend
npm install
cp .env.example .env   # Configure DATABASE_URL, JWT_SECRET, and optional GEMINI_API_KEY
node setup-db.js       # Creates DB, applies migrations 000-013, seeds demo data & hotspots
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
