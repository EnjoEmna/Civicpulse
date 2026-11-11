BEGIN;

-- Multi-city support across complaints and persisted hotspots
ALTER TABLE complaints
    ADD COLUMN IF NOT EXISTS city VARCHAR(100),
    ADD COLUMN IF NOT EXISTS possible_duplicate_of_id UUID REFERENCES complaints(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_complaints_city
    ON complaints(city);

CREATE INDEX IF NOT EXISTS idx_complaints_possible_duplicate_of
    ON complaints(possible_duplicate_of_id)
    WHERE possible_duplicate_of_id IS NOT NULL;

ALTER TABLE hotspots
    ADD COLUMN IF NOT EXISTS city VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_hotspots_city
    ON hotspots(city);

COMMIT;
