CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(100) NOT NULL,

    email VARCHAR(255) NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    role VARCHAR(20) NOT NULL DEFAULT 'CITIZEN',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_role_check
        CHECK (role IN ('CITIZEN', 'OFFICER', 'ADMIN'))
);


CREATE TABLE complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    citizen_id UUID NOT NULL,

    description TEXT NOT NULL,

    category VARCHAR(50),

    status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',

    priority VARCHAR(20),

    latitude DOUBLE PRECISION,

    longitude DOUBLE PRECISION,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT complaints_citizen_fk
        FOREIGN KEY (citizen_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT complaints_status_check
        CHECK (
            status IN (
                'SUBMITTED',
                'UNDER_REVIEW',
                'ASSIGNED',
                'IN_PROGRESS',
                'RESOLVED',
                'REJECTED',
                'NEEDS_INFORMATION',
                'DUPLICATE_SUSPECTED'
            )
        ),

    CONSTRAINT complaints_priority_check
        CHECK (
            priority IS NULL
            OR priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
        ),

    CONSTRAINT complaints_latitude_check
        CHECK (
            latitude IS NULL
            OR latitude BETWEEN -90 AND 90
        ),

    CONSTRAINT complaints_longitude_check
        CHECK (
            longitude IS NULL
            OR longitude BETWEEN -180 AND 180
        )
);


CREATE INDEX idx_complaints_citizen_id
    ON complaints(citizen_id);

CREATE INDEX idx_complaints_status
    ON complaints(status);

CREATE INDEX idx_complaints_category
    ON complaints(category);

CREATE INDEX idx_complaints_created_at
    ON complaints(created_at);
