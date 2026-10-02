CREATE TABLE complaint_upvotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    complaint_id UUID NOT NULL,

    user_id UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT complaint_upvotes_complaint_fk
        FOREIGN KEY (complaint_id)
        REFERENCES complaints(id)
        ON DELETE CASCADE,

    CONSTRAINT complaint_upvotes_user_fk
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT complaint_upvotes_unique
        UNIQUE (complaint_id, user_id)
);

CREATE INDEX complaint_upvotes_complaint_idx
    ON complaint_upvotes (complaint_id);

CREATE INDEX complaint_upvotes_user_idx
    ON complaint_upvotes (user_id);