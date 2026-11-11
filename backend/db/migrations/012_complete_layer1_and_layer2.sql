BEGIN;

-- Layer 1: Standard PostgreSQL semantic embeddings (works with or without pgvector)
CREATE TABLE IF NOT EXISTS complaint_semantic_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL UNIQUE REFERENCES complaints(id) ON DELETE CASCADE,
    embedding DOUBLE PRECISION[] NOT NULL,
    dimensions INT NOT NULL,
    normalized_text TEXT,
    concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
    model_name VARCHAR(100) NOT NULL,
    model_version VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_complaint_semantic_embeddings_complaint_id
    ON complaint_semantic_embeddings(complaint_id);

-- Layer 1: Human-in-the-loop AI suggestion feedback (evaluation & acceptance rate)
CREATE TABLE IF NOT EXISTS ai_feedback_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    action VARCHAR(30) NOT NULL,
    complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE,
    target_complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_role VARCHAR(20),
    suggested_value VARCHAR(100),
    final_value VARCHAR(100),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ai_feedback_events_action_check
        CHECK (action IN ('ACCEPTED', 'MODIFIED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_type_action
    ON ai_feedback_events(event_type, action, created_at DESC);

-- Layer 2: Ward & Zone classification columns on complaints
ALTER TABLE complaints
    ADD COLUMN IF NOT EXISTS ward VARCHAR(100),
    ADD COLUMN IF NOT EXISTS zone VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_complaints_ward
    ON complaints(ward);

CREATE INDEX IF NOT EXISTS idx_complaints_lat_lng
    ON complaints(latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Layer 2: Structured Hotspot persistence (Plan Section 5 & Section 12)
CREATE TABLE IF NOT EXISTS hotspots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotspot_key VARCHAR(160) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    ward VARCHAR(100),
    zone VARCHAR(100),
    center_latitude DOUBLE PRECISION NOT NULL,
    center_longitude DOUBLE PRECISION NOT NULL,
    radius_meters DOUBLE PRECISION NOT NULL DEFAULT 100,
    dominant_category VARCHAR(50) NOT NULL,
    issue_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
    category_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    complaint_count INT NOT NULL DEFAULT 0,
    open_count INT NOT NULL DEFAULT 0,
    density_per_sq_km DOUBLE PRECISION NOT NULL DEFAULT 0,
    recurrence_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
    severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    has_cross_category_overlap BOOLEAN NOT NULL DEFAULT FALSE,
    overlap_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
    overlap_summary TEXT,
    time_window_days INT,
    first_reported_at TIMESTAMPTZ,
    last_reported_at TIMESTAMPTZ,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT hotspots_status_check
        CHECK (status IN ('ACTIVE', 'MONITORING', 'RESOLVED')),

    CONSTRAINT hotspots_severity_check
        CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

CREATE INDEX IF NOT EXISTS idx_hotspots_status_severity
    ON hotspots(status, severity, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_hotspots_ward
    ON hotspots(ward);

CREATE TABLE IF NOT EXISTS hotspot_complaints (
    hotspot_id UUID NOT NULL REFERENCES hotspots(id) ON DELETE CASCADE,
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    distance_from_center_meters DOUBLE PRECISION,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (hotspot_id, complaint_id)
);

CREATE INDEX IF NOT EXISTS idx_hotspot_complaints_complaint_id
    ON hotspot_complaints(complaint_id);

COMMIT;
