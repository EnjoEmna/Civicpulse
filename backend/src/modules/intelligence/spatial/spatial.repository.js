const pool = require("../../../config/database");

let hasPostGisCache = null;

const CANONICAL_CATEGORY_SQL = `
  CASE
    WHEN UPPER(TRIM(COALESCE(c.category, ''))) IN ('ROAD', 'ROADS', 'INFRASTRUCTURE') THEN 'ROAD'
    WHEN UPPER(TRIM(COALESCE(c.category, ''))) IN ('WATER_SUPPLY', 'WATER') THEN 'WATER_SUPPLY'
    WHEN UPPER(TRIM(COALESCE(c.category, ''))) IN ('ELECTRICITY', 'STREET_LIGHT', 'STREETLIGHT', 'STREETLIGHTS', 'LIGHTING') THEN 'ELECTRICITY'
    WHEN UPPER(TRIM(COALESCE(c.category, ''))) IN ('SANITATION', 'GARBAGE', 'WASTE') THEN 'SANITATION'
    WHEN UPPER(TRIM(COALESCE(c.category, ''))) IN ('PUBLIC_SAFETY', 'SAFETY') THEN 'PUBLIC_SAFETY'
    WHEN TRIM(COALESCE(c.category, '')) = '' THEN 'OTHER'
    ELSE UPPER(TRIM(c.category))
  END
`;

function canonicalCategoryParamSql(paramRef) {
  return `
    CASE
      WHEN UPPER(TRIM(${paramRef})) IN ('ROAD', 'ROADS', 'INFRASTRUCTURE') THEN 'ROAD'
      WHEN UPPER(TRIM(${paramRef})) IN ('WATER_SUPPLY', 'WATER') THEN 'WATER_SUPPLY'
      WHEN UPPER(TRIM(${paramRef})) IN ('ELECTRICITY', 'STREET_LIGHT', 'STREETLIGHT', 'STREETLIGHTS', 'LIGHTING') THEN 'ELECTRICITY'
      WHEN UPPER(TRIM(${paramRef})) IN ('SANITATION', 'GARBAGE', 'WASTE') THEN 'SANITATION'
      WHEN UPPER(TRIM(${paramRef})) IN ('PUBLIC_SAFETY', 'SAFETY') THEN 'PUBLIC_SAFETY'
      ELSE UPPER(TRIM(${paramRef}))
    END
  `;
}

async function supportsPostGisLocation(db = pool) {
  if (hasPostGisCache === true) {
    return true;
  }
  try {
    const res = await db.query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'complaints'
           AND column_name = 'location'
       ) AS has_location`,
    );
    const exists = Boolean(res.rows[0]?.has_location);
    if (exists) {
      hasPostGisCache = true;
    }
    return exists;
  } catch {
    return false;
  }
}

async function findNearbyComplaints({
  latitude,
  longitude,
  radiusMeters,
  maxResults,
  category,
  timeWindowDays,
  city,
  ward,
}) {
  const usePostGis = await supportsPostGisLocation();
  const values = [latitude, longitude, radiusMeters];
  const extraConditions = [];

  if (category) {
    values.push(category.trim().toUpperCase());
    const catParam = `$${values.length}`;
    extraConditions.push(
      `AND (${CANONICAL_CATEGORY_SQL}) = (${canonicalCategoryParamSql(catParam)})`,
    );
  }

  if (Number.isFinite(Number(timeWindowDays)) && Number(timeWindowDays) > 0) {
    values.push(Number(timeWindowDays));
    extraConditions.push(
      `AND c.created_at >= NOW() - ($${values.length} * INTERVAL '1 day')`,
    );
  }

  if (city && city.trim() && city.trim().toLowerCase() !== "all") {
    values.push(city.trim());
    extraConditions.push(`AND LOWER(COALESCE(c.city, '')) = LOWER($${values.length})`);
  }

  if (ward && ward.trim()) {
    values.push(ward.trim());
    extraConditions.push(`AND LOWER(COALESCE(c.ward, '')) = LOWER($${values.length})`);
  }

  values.push(maxResults);
  const limitParam = `$${values.length}`;
  const filterSql = extraConditions.join("\n");

  if (usePostGis) {
    const result = await pool.query(
      `
        WITH search_point AS (
          SELECT ST_SetSRID(
            ST_MakePoint($2, $1),
            4326
          )::geography AS location
        )
        SELECT
          c.id,
          c.reference_id,
          c.title,
          c.description,
          c.category,
          c.status,
          c.priority,
          c.latitude,
          c.longitude,
          c.address,
          c.city,
          c.ward,
          c.zone,
          c.ai_category,
          c.ai_priority,
          c.created_at,
          ${CANONICAL_CATEGORY_SQL} AS canonical_category,
          ROUND(
            ST_Distance(c.location, sp.location)::numeric,
            2
          )::double precision AS distance_meters
        FROM complaints c
        CROSS JOIN search_point sp
        WHERE c.location IS NOT NULL
          AND ST_DWithin(c.location, sp.location, $3)
          ${filterSql}
        ORDER BY
          ST_Distance(c.location, sp.location) ASC,
          c.created_at DESC
        LIMIT ${limitParam}
      `,
      values,
    );
    return result.rows;
  }

  // Pure PostgreSQL spherical Haversine fallback when PostGIS is not installed
  const result = await pool.query(
    `
      SELECT *
      FROM (
        SELECT
          c.id,
          c.reference_id,
          c.title,
          c.description,
          c.category,
          c.status,
          c.priority,
          c.latitude,
          c.longitude,
          c.address,
          c.city,
          c.ward,
          c.zone,
          c.ai_category,
          c.ai_priority,
          c.created_at,
          ${CANONICAL_CATEGORY_SQL} AS canonical_category,
          ROUND(
            (
              6371000 * ACOS(
                LEAST(
                  1.0,
                  GREATEST(
                    -1.0,
                    COS(RADIANS($1)) * COS(RADIANS(c.latitude)) *
                    COS(RADIANS(c.longitude) - RADIANS($2)) +
                    SIN(RADIANS($1)) * SIN(RADIANS(c.latitude))
                  )
                )
              )
            )::numeric,
            2
          )::double precision AS distance_meters
        FROM complaints c
        WHERE c.latitude IS NOT NULL
          AND c.longitude IS NOT NULL
          ${filterSql}
      ) nearby
      WHERE nearby.distance_meters <= $3
      ORDER BY nearby.distance_meters ASC, nearby.created_at DESC
      LIMIT ${limitParam}
    `,
    values,
  );

  return result.rows;
}

module.exports = {
  CANONICAL_CATEGORY_SQL,
  canonicalCategoryParamSql,
  supportsPostGisLocation,
  findNearbyComplaints,
};
