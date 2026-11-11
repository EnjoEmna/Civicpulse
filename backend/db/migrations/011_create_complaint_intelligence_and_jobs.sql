BEGIN;

-- Phase 2 intelligence enrichment columns on complaints
ALTER TABLE complaints
    ADD COLUMN IF NOT EXISTS ai_category VARCHAR(50),
    ADD COLUMN IF NOT EXISTS ai_priority VARCHAR(20),
    ADD COLUMN IF NOT EXISTS ai_summary TEXT,
    ADD COLUMN IF NOT EXISTS ai_confidence DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS ai_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS ai_metadata JSONB,
    ADD COLUMN IF NOT EXISTS enrichment_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_complaints_enrichment_status
    ON complaints(enrichment_status);

-- Durable background job queue for complaint enrichment & embeddings
CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(50) NOT NULL,
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB,
    last_error TEXT,
    next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT background_jobs_type_complaint_unique
        UNIQUE (job_type, complaint_id),

    CONSTRAINT background_jobs_status_check
        CHECK (status IN ('PENDING', 'PROCESSING', 'RETRY_SCHEDULED', 'COMPLETED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_due
    ON background_jobs (status, next_run_at);

COMMIT;
