BEGIN;

-- Assignment & department routing columns on complaints
ALTER TABLE complaints
    ADD COLUMN IF NOT EXISTS assigned_officer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS department VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_complaints_assigned_officer_id
    ON complaints(assigned_officer_id);

-- Backfill department from existing categories where missing
UPDATE complaints
SET department = CASE
    WHEN UPPER(TRIM(COALESCE(category, ''))) IN ('ROAD', 'ROADS', 'INFRASTRUCTURE')
        THEN 'Roads & Public Works'
    WHEN UPPER(TRIM(COALESCE(category, ''))) IN ('WATER_SUPPLY', 'WATER')
        THEN 'Water Supply & Drainage'
    WHEN UPPER(TRIM(COALESCE(category, ''))) IN ('ELECTRICITY', 'STREET_LIGHT', 'STREETLIGHT')
        THEN 'Electricity & Street Lighting'
    WHEN UPPER(TRIM(COALESCE(category, ''))) IN ('SANITATION', 'GARBAGE')
        THEN 'Sanitation & Solid Waste'
    WHEN UPPER(TRIM(COALESCE(category, ''))) IN ('PUBLIC_SAFETY', 'SAFETY')
        THEN 'Public Safety & Enforcement'
    ELSE 'Municipal General Desk'
END
WHERE department IS NULL;

-- Persisted complaint status & assignment audit history
CREATE TABLE IF NOT EXISTS complaint_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    from_status VARCHAR(30),
    to_status VARCHAR(30) NOT NULL,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_role VARCHAR(20),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_complaint_history_complaint_id
    ON complaint_history(complaint_id, created_at ASC);

-- Backfill initial submission event for complaints that have no history yet
INSERT INTO complaint_history (complaint_id, from_status, to_status, actor_id, actor_role, note, created_at)
SELECT
    c.id,
    NULL,
    'SUBMITTED',
    c.citizen_id,
    'CITIZEN',
    'Complaint submitted by citizen',
    c.created_at
FROM complaints c
WHERE NOT EXISTS (
    SELECT 1 FROM complaint_history ch WHERE ch.complaint_id = c.id
);

-- Backfill current state transition for pre-existing non-SUBMITTED complaints with only the initial row
INSERT INTO complaint_history (complaint_id, from_status, to_status, actor_id, actor_role, note, created_at)
SELECT
    c.id,
    'SUBMITTED',
    c.status,
    NULL,
    'SYSTEM',
    'Status synchronized as ' || c.status,
    c.updated_at
FROM complaints c
WHERE c.status <> 'SUBMITTED'
  AND NOT EXISTS (
      SELECT 1 FROM complaint_history ch
      WHERE ch.complaint_id = c.id AND ch.to_status = c.status
  );

COMMIT;
