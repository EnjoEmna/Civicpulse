BEGIN;

-- Layer 6: Officer Copilot conversation sessions and grounded message history
CREATE TABLE IF NOT EXISTS copilot_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    officer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL DEFAULT 'Copilot Investigation',
    city VARCHAR(100),
    target_type VARCHAR(30),
    target_id VARCHAR(120),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_sessions_officer_recent
    ON copilot_sessions(officer_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_sessions_city
    ON copilot_sessions(city, last_message_at DESC);

CREATE TABLE IF NOT EXISTS copilot_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES copilot_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
    structured_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    latency_ms INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT copilot_messages_role_check
        CHECK (role IN ('USER', 'COPILOT'))
);

CREATE INDEX IF NOT EXISTS idx_copilot_messages_session_order
    ON copilot_messages(session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_copilot_messages_agent_run
    ON copilot_messages(agent_run_id)
    WHERE agent_run_id IS NOT NULL;

COMMIT;
