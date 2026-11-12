BEGIN;

-- Layer 3: Infrastructure Health Score assets, maintenance events, complaint links, and score history
CREATE TABLE IF NOT EXISTS infrastructure_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    asset_type VARCHAR(40) NOT NULL,
    city VARCHAR(100),
    ward VARCHAR(100),
    zone VARCHAR(100),
    address VARCHAR(255),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    catchment_radius_meters DOUBLE PRECISION NOT NULL DEFAULT 250,
    department VARCHAR(120) NOT NULL DEFAULT 'Municipal Engineering',
    install_date DATE,
    last_maintained_at TIMESTAMPTZ,
    health_score DOUBLE PRECISION NOT NULL DEFAULT 100,
    health_grade VARCHAR(20) NOT NULL DEFAULT 'GOOD',
    trend VARCHAR(20) NOT NULL DEFAULT 'STABLE',
    complaint_count INT NOT NULL DEFAULT 0,
    open_complaint_count INT NOT NULL DEFAULT 0,
    recurrence_count INT NOT NULL DEFAULT 0,
    score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_scored_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT infrastructure_assets_type_check
        CHECK (
            asset_type IN (
                'ROAD_SEGMENT',
                'WATER_PIPELINE',
                'DRAINAGE',
                'STREETLIGHT_CLUSTER',
                'WASTE_POINT'
            )
        ),

    CONSTRAINT infrastructure_assets_grade_check
        CHECK (health_grade IN ('GOOD', 'FAIR', 'POOR', 'CRITICAL')),

    CONSTRAINT infrastructure_assets_trend_check
        CHECK (trend IN ('IMPROVING', 'STABLE', 'DETERIORATING')),

    CONSTRAINT infrastructure_assets_score_check
        CHECK (health_score >= 0 AND health_score <= 100)
);

CREATE INDEX IF NOT EXISTS idx_infrastructure_assets_city_ward
    ON infrastructure_assets(city, ward);

CREATE INDEX IF NOT EXISTS idx_infrastructure_assets_type_grade
    ON infrastructure_assets(asset_type, health_grade, health_score ASC);

CREATE TABLE IF NOT EXISTS maintenance_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES infrastructure_assets(id) ON DELETE CASCADE,
    event_type VARCHAR(40) NOT NULL,
    outcome VARCHAR(30) NOT NULL DEFAULT 'COMPLETED',
    performed_by VARCHAR(140),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT maintenance_events_type_check
        CHECK (
            event_type IN (
                'INSPECTION',
                'REPAIR',
                'RESURFACING',
                'REPLACEMENT',
                'CLEANING',
                'PREVENTIVE_MAINTENANCE'
            )
        ),

    CONSTRAINT maintenance_events_outcome_check
        CHECK (
            outcome IN ('COMPLETED', 'PARTIAL', 'DEFERRED', 'FAILED_INSPECTION')
        )
);

CREATE INDEX IF NOT EXISTS idx_maintenance_events_asset_date
    ON maintenance_events(asset_id, performed_at DESC);

CREATE TABLE IF NOT EXISTS complaint_asset_links (
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES infrastructure_assets(id) ON DELETE CASCADE,
    distance_meters DOUBLE PRECISION,
    link_type VARCHAR(30) NOT NULL DEFAULT 'DIRECT',
    link_confidence DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    link_reason VARCHAR(160),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (complaint_id, asset_id),

    CONSTRAINT complaint_asset_links_type_check
        CHECK (link_type IN ('DIRECT', 'CROSS_IMPACT', 'MANUAL'))
);

CREATE INDEX IF NOT EXISTS idx_complaint_asset_links_asset_id
    ON complaint_asset_links(asset_id);

CREATE TABLE IF NOT EXISTS infrastructure_health_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES infrastructure_assets(id) ON DELETE CASCADE,
    health_score DOUBLE PRECISION NOT NULL,
    health_grade VARCHAR(20) NOT NULL,
    complaint_count INT NOT NULL DEFAULT 0,
    open_complaint_count INT NOT NULL DEFAULT 0,
    score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_infrastructure_health_history_asset_time
    ON infrastructure_health_history(asset_id, recorded_at DESC);

COMMIT;
