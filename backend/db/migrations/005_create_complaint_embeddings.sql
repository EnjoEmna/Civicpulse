CREATE TABLE complaint_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    complaint_id UUID NOT NULL UNIQUE,

    embedding vector(768) NOT NULL,

    model_name VARCHAR(100) NOT NULL,

    model_version VARCHAR(100),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT complaint_embeddings_complaint_fk
        FOREIGN KEY (complaint_id)
        REFERENCES complaints(id)
        ON DELETE CASCADE
);