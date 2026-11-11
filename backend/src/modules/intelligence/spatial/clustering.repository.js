const pool = require("../../../config/database");
const {
  CANONICAL_CATEGORY_SQL,
  canonicalCategoryParamSql,
  supportsPostGisLocation,
} = require("./spatial.repository");

async function findClusters({
  latitude = null,
  longitude = null,
  radiusMeters = 5000,
  clusterDistanceMeters = 150,
  category,
  timeWindowDays,
  city,
  ward,
  cityWide = false,
}) {
  const usePostGis = await supportsPostGisLocation();
  const isLocalized =
    !cityWide &&
    latitude != null &&
    longitude != null &&
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude));

  const values = [];
  const extraWhere = [];

  let latParam = null;
  let lngParam = null;
  let radiusParam = null;

  if (isLocalized) {
    values.push(Number(latitude), Number(longitude), Number(radiusMeters));
    latParam = "$1";
    lngParam = "$2";
    radiusParam = "$3";
  }

  if (category) {
    values.push(category.trim().toUpperCase());
    const catParam = `$${values.length}`;
    extraWhere.push(
      `AND (${CANONICAL_CATEGORY_SQL}) = (${canonicalCategoryParamSql(catParam)})`,
    );
  }

  if (Number.isFinite(Number(timeWindowDays)) && Number(timeWindowDays) > 0) {
    values.push(Number(timeWindowDays));
    extraWhere.push(
      `AND c.created_at >= NOW() - ($${values.length} * INTERVAL '1 day')`,
    );
  }

  if (city && city.trim() && city.trim().toLowerCase() !== "all") {
    values.push(city.trim());
    extraWhere.push(`AND LOWER(COALESCE(c.city, '')) = LOWER($${values.length})`);
  }

  if (ward && ward.trim()) {
    values.push(ward.trim());
    extraWhere.push(`AND LOWER(COALESCE(c.ward, '')) = LOWER($${values.length})`);
  }

  values.push(Number(clusterDistanceMeters));
  const clusterDistParam = `$${values.length}`;
  const filterSql = extraWhere.join("\n");

  if (usePostGis) {
    const centerCte = isLocalized
      ? `search_center AS (
           SELECT ST_SetSRID(ST_MakePoint(${lngParam}, ${latParam}), 4326)::geography AS location
         ),`
      : "";

    const radiusCondition = isLocalized
      ? `CROSS JOIN search_center sc
         WHERE c.location IS NOT NULL
           AND ST_DWithin(c.location, sc.location, ${radiusParam})`
      : `WHERE c.location IS NOT NULL`;

    const distanceSelect = isLocalized
      ? `ROUND(ST_Distance(fc.location, sc.location)::numeric, 2)::double precision AS distance_meters`
      : `0::double precision AS distance_meters`;

    const distanceJoin = isLocalized ? `CROSS JOIN search_center sc` : "";

    const query = `
      WITH RECURSIVE
      ${centerCte}
      filtered_complaints AS (
        SELECT
          c.id,
          c.reference_id,
          c.title,
          c.description,
          c.category,
          ${CANONICAL_CATEGORY_SQL} AS canonical_category,
          c.status,
          c.priority,
          c.address,
          c.city,
          c.ward,
          c.zone,
          c.ai_category,
          c.ai_priority,
          c.latitude,
          c.longitude,
          c.created_at,
          c.location
        FROM complaints c
        ${radiusCondition}
        ${filterSql}
      ),
      edges AS (
        SELECT a.id AS source_id, b.id AS target_id
        FROM filtered_complaints a
        JOIN filtered_complaints b
          ON a.id <> b.id
         AND ST_DWithin(a.location, b.location, ${clusterDistParam})
      ),
      reachability AS (
        SELECT id AS root_id, id AS complaint_id
        FROM filtered_complaints
        UNION
        SELECT r.root_id, e.target_id
        FROM reachability r
        JOIN edges e ON e.source_id = r.complaint_id
      ),
      component_membership AS (
        SELECT complaint_id, MIN(root_id::text)::uuid AS cluster_id
        FROM reachability
        GROUP BY complaint_id
      )
      SELECT
        fc.id,
        fc.reference_id,
        fc.title,
        fc.description,
        fc.category,
        fc.canonical_category,
        fc.status,
        fc.priority,
        fc.address,
        fc.city,
        fc.ward,
        fc.zone,
        fc.ai_category,
        fc.ai_priority,
        fc.latitude,
        fc.longitude,
        fc.created_at,
        cm.cluster_id,
        ${distanceSelect}
      FROM filtered_complaints fc
      JOIN component_membership cm ON cm.complaint_id = fc.id
      ${distanceJoin}
      ORDER BY cm.cluster_id, fc.created_at DESC;
    `;

    const result = await pool.query(query, values);
    return result.rows;
  }

  // Pure PostgreSQL Haversine clustering implementation
  const haversineFromSearchCenter = isLocalized
    ? `ROUND(
         (
           6371000 * ACOS(
             LEAST(
               1.0,
               GREATEST(
                 -1.0,
                 COS(RADIANS(${latParam})) * COS(RADIANS(c.latitude)) *
                 COS(RADIANS(c.longitude) - RADIANS(${lngParam})) +
                 SIN(RADIANS(${latParam})) * SIN(RADIANS(c.latitude))
               )
             )
           )
         )::numeric,
         2
       )::double precision`
    : `0::double precision`;

  const localizedOuterFilter = isLocalized
    ? `WHERE base.distance_meters <= ${radiusParam}`
    : "";

  const query = `
    WITH RECURSIVE
    filtered_complaints AS (
      SELECT *
      FROM (
        SELECT
          c.id,
          c.reference_id,
          c.title,
          c.description,
          c.category,
          ${CANONICAL_CATEGORY_SQL} AS canonical_category,
          c.status,
          c.priority,
          c.address,
          c.city,
          c.ward,
          c.zone,
          c.ai_category,
          c.ai_priority,
          c.latitude,
          c.longitude,
          c.created_at,
          ${haversineFromSearchCenter} AS distance_meters
        FROM complaints c
        WHERE c.latitude IS NOT NULL
          AND c.longitude IS NOT NULL
          ${filterSql}
      ) base
      ${localizedOuterFilter}
    ),
    edges AS (
      SELECT
        a.id AS source_id,
        b.id AS target_id
      FROM filtered_complaints a
      JOIN filtered_complaints b
        ON a.id <> b.id
       AND (
         6371000 * ACOS(
           LEAST(
             1.0,
             GREATEST(
               -1.0,
               COS(RADIANS(a.latitude)) * COS(RADIANS(b.latitude)) *
               COS(RADIANS(b.longitude) - RADIANS(a.longitude)) +
               SIN(RADIANS(a.latitude)) * SIN(RADIANS(b.latitude))
             )
           )
         )
       ) <= ${clusterDistParam}
    ),
    reachability AS (
      SELECT id AS root_id, id AS complaint_id
      FROM filtered_complaints

      UNION

      SELECT r.root_id, e.target_id
      FROM reachability r
      JOIN edges e
        ON e.source_id = r.complaint_id
    ),
    component_membership AS (
      SELECT
        complaint_id,
        MIN(root_id::text)::uuid AS cluster_id
      FROM reachability
      GROUP BY complaint_id
    )
    SELECT
      fc.id,
      fc.reference_id,
      fc.title,
      fc.description,
      fc.category,
      fc.canonical_category,
      fc.status,
      fc.priority,
      fc.address,
      fc.city,
      fc.ward,
      fc.zone,
      fc.ai_category,
      fc.ai_priority,
      fc.latitude,
      fc.longitude,
      fc.created_at,
      cm.cluster_id,
      fc.distance_meters
    FROM filtered_complaints fc
    JOIN component_membership cm
      ON cm.complaint_id = fc.id
    ORDER BY cm.cluster_id, fc.created_at DESC;
  `;

  const result = await pool.query(query, values);
  return result.rows;
}

module.exports = {
  findClusters,
};
