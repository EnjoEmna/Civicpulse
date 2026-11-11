CREATE TABLE IF NOT EXISTS complaint_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL,
    uploaded_by UUID NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    storage_key VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_type VARCHAR(20) NOT NULL,
    file_size BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT complaint_evidence_complaint_fk
        FOREIGN KEY (complaint_id)
        REFERENCES complaints(id)
        ON DELETE CASCADE,

    CONSTRAINT complaint_evidence_user_fk
        FOREIGN KEY (uploaded_by)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT complaint_evidence_type_check
        CHECK (file_type IN ('image', 'video', 'document'))
);

CREATE INDEX IF NOT EXISTS idx_complaint_evidence_complaint_id
    ON complaint_evidence(complaint_id);
