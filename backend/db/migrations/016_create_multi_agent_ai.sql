BEGIN;

-- Layer 5: Multi-Agent AI orchestration trace runs and officer decision recommendations
CREATE TABLE IF NOT EXISTS agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_run_id UUID REFERENCES agent_runs(id) ON DELETE CASCADE,
    step_order INT NOT NULL DEFAULT 0,
    run_type VARCHAR(30) NOT NULL DEFAULT 'ORCHESTRATION',
    agent_name VARCHAR(60) NOT NULL,
    query_text TEXT,
    target_type VARCHAR(30),
    target_id VARCHAR(120),
    city VARCHAR(100),
    status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED',
    inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
    tools_used JSONB NOT NULL DEFAULT '[]'::jsonb,
    tool_calls_count INT NOT NULL DEFAULT 0,
    valid_tool_calls_count INT NOT NULL DEFAULT 0,
    outputs JSONB NOT NULL DEFAULT '{}'::jsonb,
    grounding_report JSONB NOT NULL DEFAULT '{}'::jsonb,
    unsupported_claim_count INT NOT NULL DEFAULT 0,
    model_name VARCHAR(80) NOT NULL DEFAULT 'deterministic-orchestrator',
    model_version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
    duration_ms INT NOT NULL DEFAULT 0,
    initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT agent_runs_type_check
        CHECK (run_type IN ('ORCHESTRATION', 'AGENT_STEP')),

    CONSTRAINT agent_runs_agent_name_check
        CHECK (
            agent_name IN (
                'Orchestrator',
                'PriorityAgent',
                'InvestigationAgent',
                'InfrastructureAgent',
                'SpatialAgent',
                'ComplaintAgent',
                'RecommendationAgent',
                'ReportAgent'
            )
        ),

    CONSTRAINT agent_runs_status_check
        CHECK (status IN ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_parent_step
    ON agent_runs(parent_run_id, step_order ASC)
    WHERE parent_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_runs_top_level_created
    ON agent_runs(run_type, city, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_name
    ON agent_runs(agent_name, status);

CREATE TABLE IF NOT EXISTS agent_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    target_type VARCHAR(30) NOT NULL DEFAULT 'ASSET',
    target_id VARCHAR(120),
    asset_id UUID REFERENCES infrastructure_assets(id) ON DELETE SET NULL,
    complaint_id UUID REFERENCES complaints(id) ON DELETE SET NULL,
    hotspot_id UUID REFERENCES hotspots(id) ON DELETE SET NULL,
    city VARCHAR(100),
    ward VARCHAR(100),
    category VARCHAR(60) NOT NULL DEFAULT 'INFRASTRUCTURE_ACTION',
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    action_title VARCHAR(200) NOT NULL,
    proposed_action TEXT NOT NULL,
    rationale TEXT NOT NULL,
    evidence_citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    requires_human_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
    is_non_causal_inferred BOOLEAN NOT NULL DEFAULT FALSE,
    decision_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
    modified_action TEXT,
    decision_note TEXT,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT agent_recommendations_priority_check
        CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),

    CONSTRAINT agent_recommendations_confidence_check
        CHECK (confidence >= 0 AND confidence <= 1),

    CONSTRAINT agent_recommendations_decision_check
        CHECK (decision_status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'MODIFIED'))
);

CREATE INDEX IF NOT EXISTS idx_agent_recommendations_run
    ON agent_recommendations(agent_run_id);

CREATE INDEX IF NOT EXISTS idx_agent_recommendations_decision_city
    ON agent_recommendations(decision_status, city, created_at DESC);

COMMIT;
