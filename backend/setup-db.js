const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres@localhost:5432/civicpulse";

const { Client } = require("pg");
const fs = require("fs");
const bcrypt = require("bcrypt");
const pool = require("./src/config/database");
const { resolveWardAndZone } = require("./src/modules/intelligence/spatial/ward.resolver");
const { backfillUnenrichedComplaints } = require("./src/jobs/retry.job");
const { detectAndPersistHotspots } = require("./src/modules/intelligence/spatial/hotspot.service");
const { recalculateInfrastructureHealth } = require("./src/modules/intelligence/infrastructure/infrastructure.service");
const { syncKnowledgeGraph } = require("./src/modules/intelligence/graph/graph-builder.service");

async function setup() {
  console.log("Checking PostgreSQL connection...");

  const parsedDbUrl = new URL(process.env.DATABASE_URL);
  const targetDbName = parsedDbUrl.pathname.replace(/^\//, "") || "civicpulse";
  const basePgConfig = {
    host: parsedDbUrl.hostname || "localhost",
    port: Number(parsedDbUrl.port || 5432),
    user: decodeURIComponent(parsedDbUrl.username || "postgres"),
    ...(parsedDbUrl.password ? { password: decodeURIComponent(parsedDbUrl.password) } : {}),
  };

  // 1. Connect to postgres system database
  const rootClient = new Client({
    ...basePgConfig,
    database: "postgres",
  });

  try {
    await rootClient.connect();
    console.log(`Connected to PostgreSQL as ${basePgConfig.user}.`);

    const dbRes = await rootClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [targetDbName],
    );
    if (dbRes.rowCount === 0) {
      console.log(`Creating database '${targetDbName}'...`);
      await rootClient.query(`CREATE DATABASE "${targetDbName.replace(/"/g, '""')}";`);
      console.log(`Database '${targetDbName}' created successfully.`);
    } else {
      console.log(`Database '${targetDbName}' already exists.`);
    }
    await rootClient.end();
  } catch (err) {
    console.error("Could not connect to PostgreSQL:", err.message);
    process.exit(1);
  }

  // 2. Connect to target application database
  const dbClient = new Client({
    ...basePgConfig,
    database: targetDbName,
  });

  await dbClient.connect();
  console.log(`Connected to '${targetDbName}' database.`);

  // Check extensions
  try {
    await dbClient.query("CREATE EXTENSION IF NOT EXISTS vector;");
    console.log("Extension 'vector' enabled.");
  } catch (e) {
    console.log("Notice: pgvector extension not present, skipping vector embedding migration.");
  }

  try {
    await dbClient.query("CREATE EXTENSION IF NOT EXISTS postgis;");
    console.log("Extension 'postgis' enabled.");
  } catch (e) {
    console.log("Notice: postgis extension not present, skipping postgis spatial migration.");
  }

  // Run migrations safely
  const migrationsDir = path.join(__dirname, "db", "migrations");
  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    if (file.endsWith(".sql")) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      try {
        await dbClient.query(sql);
        console.log(`Executed migration: ${file}`);
      } catch (mErr) {
        await dbClient.query("ROLLBACK;").catch(() => {});
        console.log(`Migration ${file} skipped or already applied: ${mErr.message}`);
      }
    }
  }

  // Ensure reference_id has default sequence
  await dbClient.query(`
    ALTER TABLE complaints 
    ALTER COLUMN reference_id SET DEFAULT (
      'CP-' ||
      TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY') ||
      '-' ||
      LPAD(nextval('complaint_reference_seq')::TEXT, 6, '0')
    );
  `).catch((err) => console.log("Reference ID default notice:", err.message));

  // 3. Create or update sample officer account
  const officerEmail = "officer@civicpulse.org";
  const passwordHash = await bcrypt.hash("Officer@123", 12);

  const existing = await dbClient.query(
    "SELECT id FROM users WHERE email = $1",
    [officerEmail],
  );

  let officerId;
  if (existing.rowCount === 0) {
    const res = await dbClient.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'OFFICER')
       RETURNING id`,
      ["Officer R. Naidu", officerEmail, passwordHash],
    );
    officerId = res.rows[0].id;
    console.log("Created Officer account: officer@civicpulse.org");
  } else {
    officerId = existing.rows[0].id;
    await dbClient.query(
      "UPDATE users SET password_hash = $1, role = 'OFFICER' WHERE email = $2",
      [passwordHash, officerEmail],
    );
    console.log("Updated Officer account: officer@civicpulse.org");
  }

  // 4. Create sample citizen account
  const citizenEmail = "citizen@civicpulse.org";
  const citizenHash = await bcrypt.hash("Citizen@123", 12);
  let citizenId;
  const existCitizen = await dbClient.query(
    "SELECT id FROM users WHERE email = $1",
    [citizenEmail],
  );
  if (existCitizen.rowCount === 0) {
    const res = await dbClient.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'CITIZEN')
       RETURNING id`,
      ["Aditi Rao", citizenEmail, citizenHash],
    );
    citizenId = res.rows[0].id;
    console.log("Created Citizen account: citizen@civicpulse.org");
  } else {
    citizenId = existCitizen.rows[0].id;
    console.log("Citizen account verified: citizen@civicpulse.org");
  }

  // 5. Seed sample complaints if table has 0 rows
  const countRes = await dbClient.query("SELECT COUNT(*)::int AS count FROM complaints");
  if (countRes.rows[0].count === 0) {
    console.log("Seeding sample complaints into database...");
    const sampleComplaints = [
      {
        title: "Large pothole hazard near bus stop",
        desc: "There is a deep pothole right at the bus shelter on 4th Cross Rd. It fills with water when it rains and is hazardous for commuters.",
        category: "ROAD",
        status: "IN_PROGRESS",
        priority: "HIGH",
        address: "4th Cross Rd, Banjara Hills",
        lat: 17.4156,
        lng: 78.4357,
      },
      {
        title: "Drinking water pipeline leakage",
        desc: "Main supply pipeline has been continuously leaking clean water on the pedestrian walkway for 3 days.",
        category: "WATER_SUPPLY",
        status: "SUBMITTED",
        priority: "CRITICAL",
        address: "Lakeview Colony, Main Road",
        lat: 17.4182,
        lng: 78.4391,
      },
      {
        title: "Streetlight outage on School Road",
        desc: "Entire stretch of 5 streetlights is non-functional, creating safety issues for residents at night.",
        category: "ELECTRICITY",
        status: "UNDER_REVIEW",
        priority: "MEDIUM",
        address: "Govt. School Rd, Sector 4",
        lat: 17.4112,
        lng: 78.4312,
      },
      {
        title: "Garbage accumulation near community park",
        desc: "Waste bin overflowed over the weekend and has not been cleared by sanitation trucks.",
        category: "SANITATION",
        status: "SUBMITTED",
        priority: "LOW",
        address: "Community Park Gate 2",
        lat: 17.4201,
        lng: 78.4423,
      },
    ];

    for (const c of sampleComplaints) {
      const insertedRes = await dbClient.query(
        `INSERT INTO complaints (citizen_id, title, description, category, department, status, priority, address, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, created_at`,
        [
          citizenId,
          c.title,
          c.desc,
          c.category,
          c.category === "ROAD"
            ? "Roads & Public Works"
            : c.category === "WATER_SUPPLY"
              ? "Water Supply & Drainage"
              : c.category === "ELECTRICITY"
                ? "Electricity & Street Lighting"
                : "Sanitation & Solid Waste",
          c.status,
          c.priority,
          c.address,
          c.lat,
          c.lng,
        ],
      );
      const seededComplaint = insertedRes.rows[0];
      await dbClient.query(
        `INSERT INTO complaint_history (complaint_id, from_status, to_status, actor_id, actor_role, note, created_at)
         VALUES ($1, NULL, 'SUBMITTED', $2, 'CITIZEN', 'Complaint submitted by citizen', $3)`,
        [seededComplaint.id, citizenId, seededComplaint.created_at],
      );
      if (c.status !== "SUBMITTED") {
        await dbClient.query(
          `INSERT INTO complaint_history (complaint_id, from_status, to_status, actor_role, note, created_at)
           VALUES ($1, 'SUBMITTED', $2, 'SYSTEM', $3, $4)`,
          [seededComplaint.id, c.status, `Status synchronized as ${c.status}`, seededComplaint.created_at],
        );
      }
    }
    console.log("Sample complaints seeded successfully.");
  } else {
    console.log(`Complaints table already contains ${countRes.rows[0].count} records.`);
  }

  // 6. Idempotently seed Layer 2 neighborhood cluster & overlap complaints if not present
  const clusterCompanions = [
    {
      title: "Deep asphalt cave-in near 4th Cross bus shelter",
      desc: "Road surface next to the 4th Cross Rd bus shelter has caved in, causing traffic bottleneck and bike skids.",
      category: "ROAD",
      department: "Roads & Public Works",
      status: "SUBMITTED",
      priority: "HIGH",
      address: "4th Cross Rd, Banjara Hills",
      lat: 17.4159,
      lng: 78.436,
    },
    {
      title: "Water seepage eroding pavement at 4th Cross Rd",
      desc: "Continuous clean water seepage under the tarmac at 4th Cross Rd is eroding the pavement base.",
      category: "WATER_SUPPLY",
      department: "Water Supply & Drainage",
      status: "UNDER_REVIEW",
      priority: "HIGH",
      address: "4th Cross Rd, Banjara Hills",
      lat: 17.4161,
      lng: 78.4362,
    },
    {
      title: "Slow-moving traffic due to road crater on 4th Cross",
      desc: "Large road crater right beside the Banjara Hills bus stop forces vehicles into a single lane.",
      category: "ROAD",
      department: "Roads & Public Works",
      status: "SUBMITTED",
      priority: "MEDIUM",
      address: "4th Cross Rd, Banjara Hills",
      lat: 17.4154,
      lng: 78.4355,
    },
    {
      title: "Low pressure & pipeline crack at Lakeview Colony Walk",
      desc: "Visible hairline leak on the Lakeview Colony main feeder line reducing household water pressure.",
      category: "WATER_SUPPLY",
      department: "Water Supply & Drainage",
      status: "ASSIGNED",
      priority: "HIGH",
      address: "Lakeview Colony, Main Road",
      lat: 17.4186,
      lng: 78.4395,
      assignToOfficer: true,
    },
    {
      title: "Broken electric pole lamp opposite Govt School Gate",
      desc: "Two electric pole fixtures opposite Govt School Rd are dark, compounding visibility issues after dusk.",
      category: "ELECTRICITY",
      department: "Electricity & Street Lighting",
      status: "SUBMITTED",
      priority: "HIGH",
      address: "Govt. School Rd, Sector 4",
      lat: 17.4115,
      lng: 78.4316,
    },
    // Multi-city companions: Kalambalam / Thiruvananthapuram (Kerala) near CP-2026-000006
    {
      title: "Damaged culvert & pothole at NH-66 Kalambalam Junction",
      desc: "Deep pothole near Kalambalam Junction signal slows buses and causes waterlogging during monsoon showers.",
      category: "ROAD",
      department: "Roads & Public Works",
      status: "SUBMITTED",
      priority: "HIGH",
      address: "Kalambalam Junction, Trivandrum, Kerala, India",
      lat: 8.76305,
      lng: 76.79162,
    },
    {
      title: "Water pipe burst near Kalambalam Bus Stand",
      desc: "Main water supply line near Kalambalam Bus Stand has burst and is eroding the road edge beside the junction.",
      category: "WATER_SUPPLY",
      department: "Water Supply & Drainage",
      status: "UNDER_REVIEW",
      priority: "CRITICAL",
      address: "NH-66 Kalambalam, Thiruvananthapuram, Kerala, India",
      lat: 8.76268,
      lng: 76.79129,
    },
    // Multi-city companions: Indiranagar / Bengaluru (Karnataka)
    {
      title: "Stormwater drain overflow on 100 Ft Road Indiranagar",
      desc: "Blocked stormwater drain near 100 Ft Road floods the pedestrian crossing every evening.",
      category: "WATER_SUPPLY",
      department: "Water Supply & Drainage",
      status: "SUBMITTED",
      priority: "HIGH",
      address: "100 Ft Road, Indiranagar, Bengaluru, Karnataka, India",
      lat: 12.9784,
      lng: 77.6408,
    },
    {
      title: "Uncleared commercial waste near CMH Road Metro",
      desc: "Large garbage pileup beside the Indiranagar CMH Road metro pillar attracts stray animals and foul odor.",
      category: "SANITATION",
      department: "Sanitation & Solid Waste",
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      address: "CMH Road, Indiranagar, Bengaluru, Karnataka, India",
      lat: 12.97865,
      lng: 77.64105,
    },
    {
      title: "Streetlight outage along 12th Main Indiranagar",
      desc: "Four LED streetlights on 12th Main Road Indiranagar have been dark for three nights.",
      category: "ELECTRICITY",
      department: "Electricity & Street Lighting",
      status: "SUBMITTED",
      priority: "HIGH",
      address: "12th Main Road, Indiranagar, Bengaluru, Karnataka, India",
      lat: 12.97818,
      lng: 77.64062,
    },
  ];

  let clusterInserted = 0;
  for (const c of clusterCompanions) {
    const existsRes = await dbClient.query(
      "SELECT id FROM complaints WHERE title = $1 LIMIT 1",
      [c.title],
    );
    if (existsRes.rowCount > 0) {
      continue;
    }

    const wardInfo = resolveWardAndZone({
      latitude: c.lat,
      longitude: c.lng,
      address: c.address,
    });

    const insertedRes = await dbClient.query(
      `INSERT INTO complaints (
         citizen_id, title, description, category, department, status, priority,
         assigned_officer_id, address, city, ward, zone, latitude, longitude
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, created_at`,
      [
        citizenId,
        c.title,
        c.desc,
        c.category,
        c.department,
        c.status,
        c.priority,
        c.assignToOfficer ? officerId : null,
        c.address,
        wardInfo.city,
        wardInfo.ward,
        wardInfo.zone,
        c.lat,
        c.lng,
      ],
    );

    const row = insertedRes.rows[0];
    await dbClient.query(
      `INSERT INTO complaint_history (complaint_id, from_status, to_status, actor_id, actor_role, note, created_at)
       VALUES ($1, NULL, 'SUBMITTED', $2, 'CITIZEN', 'Complaint submitted by citizen', $3)`,
      [row.id, citizenId, row.created_at],
    );
    if (c.status !== "SUBMITTED") {
      await dbClient.query(
        `INSERT INTO complaint_history (complaint_id, from_status, to_status, actor_role, note, created_at)
         VALUES ($1, 'SUBMITTED', $2, 'SYSTEM', $3, $4)`,
        [row.id, c.status, `Status synchronized as ${c.status}`, row.created_at],
      );
    }
    clusterInserted += 1;
  }

  if (clusterInserted > 0) {
    console.log(`Seeded ${clusterInserted} neighborhood cluster complaint(s).`);
  }

  // 7. Backfill city, ward & zone metadata on existing complaints
  const missingWardsRes = await dbClient.query(
    `SELECT id, address, latitude, longitude, city, ward, zone
     FROM complaints
     WHERE city IS NULL OR ward IS NULL OR zone IS NULL OR ward = 'Unassigned Ward'`,
  );
  for (const row of missingWardsRes.rows) {
    const resolved = resolveWardAndZone({
      latitude: row.latitude,
      longitude: row.longitude,
      address: row.address,
    });
    await dbClient.query(
      `UPDATE complaints
       SET city = COALESCE(city, $2),
           ward = CASE WHEN ward IS NULL OR ward = 'Unassigned Ward' THEN $3 ELSE ward END,
           zone = COALESCE(zone, $4)
       WHERE id = $1`,
      [row.id, resolved.city, resolved.ward, resolved.zone],
    );
  }
  if (missingWardsRes.rowCount > 0) {
    console.log(`Backfilled city, ward & zone metadata on ${missingWardsRes.rowCount} complaint(s).`);
  }

  // Ensure existing hotspots also receive city metadata if backfilled after migration 013
  const missingHotspotCities = await dbClient.query(
    `SELECT id, center_latitude, center_longitude, ward
     FROM hotspots
     WHERE city IS NULL`,
  ).catch(() => ({ rows: [], rowCount: 0 }));
  for (const hs of missingHotspotCities.rows) {
    const resolved = resolveWardAndZone({
      latitude: hs.center_latitude,
      longitude: hs.center_longitude,
      address: hs.ward || "",
    });
    await dbClient.query(
      "UPDATE hotspots SET city = $2 WHERE id = $1",
      [hs.id, resolved.city],
    );
  }

  // 8. Backfill AI enrichment + semantic embeddings + spatial hotspots
  const enrichSummary = await backfillUnenrichedComplaints(100);
  console.log(
    `Layer 1 backfill: enqueued=${enrichSummary.enqueued}, processed=${enrichSummary.processed}, embeddingsBackfilled=${enrichSummary.embeddingsBackfilled}`,
  );

  const hotspotSummary = await detectAndPersistHotspots({
    cityWide: true,
    clusterDistanceMeters: 150,
    minClusterSize: 2,
    skipGraphSync: true,
  });
  console.log(
    `Layer 2 hotspots synced: detected=${hotspotSummary.detectedCount}, overlaps=${hotspotSummary.crossCategoryOverlapCount}`,
  );

  // 9. Idempotently seed Layer 3 infrastructure assets & maintenance history across active cities
  const nowMs = Date.now();
  const daysAgo = (days) => new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString();
  const monthsAgoDate = (months) =>
    new Date(nowMs - months * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const sampleAssets = [
    {
      assetCode: "RD-HYD-1024",
      name: "Road R-1024 · 4th Cross Bus Shelter Corridor",
      assetType: "ROAD_SEGMENT",
      city: "Hyderabad",
      ward: "Ward 12 - Banjara Hills",
      zone: "Central Zone",
      address: "4th Cross Rd, Banjara Hills, Hyderabad",
      lat: 17.4157,
      lng: 78.4358,
      radius: 300,
      department: "Roads & Public Works",
      installDate: monthsAgoDate(48),
      maintainedDaysAgo: 245,
      maintenanceType: "RESURFACING",
      maintenanceNotes: "Asphalt patch and micro-surfacing along 4th Cross junction",
    },
    {
      assetCode: "WP-HYD-204",
      name: "Pipeline P-204 · 4th Cross Distribution Main",
      assetType: "WATER_PIPELINE",
      city: "Hyderabad",
      ward: "Ward 12 - Banjara Hills",
      zone: "Central Zone",
      address: "4th Cross Rd Water Feeder, Banjara Hills",
      lat: 17.4161,
      lng: 78.4362,
      radius: 220,
      department: "Water Supply & Drainage",
      installDate: monthsAgoDate(72),
      maintainedDaysAgo: 280,
      maintenanceType: "INSPECTION",
      maintenanceNotes: "Pressure valve check and joint sealing",
    },
    {
      assetCode: "WP-HYD-310",
      name: "Lakeview Colony Trunk Water Pipeline",
      assetType: "WATER_PIPELINE",
      city: "Hyderabad",
      ward: "Ward 14 - Lakeview Colony",
      zone: "Central Zone",
      address: "Lakeview Colony, Main Road, Hyderabad",
      lat: 17.4184,
      lng: 78.4393,
      radius: 260,
      department: "Water Supply & Drainage",
      installDate: monthsAgoDate(60),
      maintainedDaysAgo: 210,
      maintenanceType: "REPAIR",
      maintenanceNotes: "Main coupling clamp tightened after pressure surge",
    },
    {
      assetCode: "SL-HYD-084",
      name: "Govt. School Rd LED Streetlight Cluster",
      assetType: "STREETLIGHT_CLUSTER",
      city: "Hyderabad",
      ward: "Ward 08 - School Road Sector",
      zone: "West Zone",
      address: "Govt. School Rd, Sector 4, Hyderabad",
      lat: 17.4114,
      lng: 78.4314,
      radius: 260,
      department: "Electricity & Street Lighting",
      installDate: monthsAgoDate(36),
      maintainedDaysAgo: 150,
      maintenanceType: "PREVENTIVE_MAINTENANCE",
      maintenanceNotes: "Replaced timer relay on Feeder Pillar B",
    },
    {
      assetCode: "SN-HYD-019",
      name: "Community Park Gate 2 Waste Transfer Point",
      assetType: "WASTE_POINT",
      city: "Hyderabad",
      ward: "Ward 14 - Lakeview Colony",
      zone: "Central Zone",
      address: "Community Park Gate 2, Hyderabad",
      lat: 17.4201,
      lng: 78.4423,
      radius: 220,
      department: "Sanitation & Solid Waste",
      installDate: monthsAgoDate(30),
      maintainedDaysAgo: 75,
      maintenanceType: "CLEANING",
      maintenanceNotes: "Bin washdown and compactor pad servicing",
    },
    {
      assetCode: "DR-HYD-112",
      name: "Road No. 12 Stormwater Box Culvert",
      assetType: "DRAINAGE",
      city: "Hyderabad",
      ward: "Ward 12 - Banjara Hills",
      zone: "Central Zone",
      address: "Road No. 12, Banjara Hills, Hyderabad",
      lat: 17.4139,
      lng: 78.4482,
      radius: 180,
      department: "Water Supply & Drainage",
      installDate: monthsAgoDate(24),
      maintainedDaysAgo: 25,
      maintenanceType: "CLEANING",
      maintenanceNotes: "Pre-monsoon desilting and grating inspection completed",
    },
    {
      assetCode: "RD-TVM-066",
      name: "NH-66 Kalambalam Junction Carriageway",
      assetType: "ROAD_SEGMENT",
      city: "Thiruvananthapuram",
      ward: "Kalambalam Ward",
      zone: "Thiruvananthapuram Rural Zone",
      address: "Kalambalam Junction, NH-66, Thiruvananthapuram",
      lat: 8.7629,
      lng: 76.7915,
      radius: 350,
      department: "Roads & Public Works",
      installDate: monthsAgoDate(54),
      maintainedDaysAgo: 230,
      maintenanceType: "RESURFACING",
      maintenanceNotes: "Cold-mix pothole filling prior to rainy season",
    },
    {
      assetCode: "WP-TVM-108",
      name: "Kalambalam Bus Stand Feeder Pipeline",
      assetType: "WATER_PIPELINE",
      city: "Thiruvananthapuram",
      ward: "Kalambalam Ward",
      zone: "Thiruvananthapuram Rural Zone",
      address: "NH-66 Kalambalam Bus Stand, Thiruvananthapuram",
      lat: 8.76268,
      lng: 76.79129,
      radius: 250,
      department: "Water Supply & Drainage",
      installDate: monthsAgoDate(66),
      maintainedDaysAgo: 260,
      maintenanceType: "REPAIR",
      maintenanceNotes: "Sluice valve packing replaced at bus stand branch",
    },
    {
      assetCode: "DR-TVM-042",
      name: "Kazhakkoottam Bypass Side Drain",
      assetType: "DRAINAGE",
      city: "Thiruvananthapuram",
      ward: "Ward 1 - Kazhakkoottam",
      zone: "North Zone",
      address: "Technopark Bypass Rd, Kazhakkoottam",
      lat: 8.5686,
      lng: 76.8731,
      radius: 220,
      department: "Water Supply & Drainage",
      installDate: monthsAgoDate(32),
      maintainedDaysAgo: 20,
      maintenanceType: "CLEANING",
      maintenanceNotes: "Routine silt clearance and slab replacement",
    },
    {
      assetCode: "DR-BLR-802",
      name: "100 Ft Road Indiranagar Storm Drain",
      assetType: "DRAINAGE",
      city: "Bengaluru",
      ward: "Ward 80 - Indiranagar",
      zone: "East Zone",
      address: "100 Ft Road, Indiranagar, Bengaluru",
      lat: 12.9784,
      lng: 77.6408,
      radius: 250,
      department: "Water Supply & Drainage",
      installDate: monthsAgoDate(44),
      maintainedDaysAgo: 195,
      maintenanceType: "CLEANING",
      maintenanceNotes: "Stormwater inlet grating cleared",
    },
    {
      assetCode: "SN-BLR-805",
      name: "CMH Road Metro Collection Hub",
      assetType: "WASTE_POINT",
      city: "Bengaluru",
      ward: "Ward 80 - Indiranagar",
      zone: "East Zone",
      address: "CMH Road Metro Pillar, Indiranagar, Bengaluru",
      lat: 12.97865,
      lng: 77.64105,
      radius: 220,
      department: "Sanitation & Solid Waste",
      installDate: monthsAgoDate(28),
      maintainedDaysAgo: 110,
      maintenanceType: "PREVENTIVE_MAINTENANCE",
      maintenanceNotes: "Secondary bin replacement and sanitization",
    },
    {
      assetCode: "SL-BLR-809",
      name: "12th Main Indiranagar Lighting Grid",
      assetType: "STREETLIGHT_CLUSTER",
      city: "Bengaluru",
      ward: "Ward 80 - Indiranagar",
      zone: "East Zone",
      address: "12th Main Road, Indiranagar, Bengaluru",
      lat: 12.97818,
      lng: 77.64062,
      radius: 250,
      department: "Electricity & Street Lighting",
      installDate: monthsAgoDate(38),
      maintainedDaysAgo: 165,
      maintenanceType: "INSPECTION",
      maintenanceNotes: "Feeder line voltage balance audit",
    },
  ];

  let assetsSeeded = 0;
  for (const asset of sampleAssets) {
    const maintainedAt = daysAgo(asset.maintainedDaysAgo);
    const existsRes = await dbClient.query(
      "SELECT id FROM infrastructure_assets WHERE asset_code = $1 LIMIT 1",
      [asset.assetCode],
    );
    if (existsRes.rowCount > 0) {
      continue;
    }

    const insertAsset = await dbClient.query(
      `INSERT INTO infrastructure_assets (
         asset_code, name, asset_type, city, ward, zone, address,
         latitude, longitude, catchment_radius_meters, department,
         install_date, last_maintained_at, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
       RETURNING id`,
      [
        asset.assetCode,
        asset.name,
        asset.assetType,
        asset.city,
        asset.ward,
        asset.zone,
        asset.address,
        asset.lat,
        asset.lng,
        asset.radius,
        asset.department,
        asset.installDate,
        maintainedAt,
        JSON.stringify({ seeded: true }),
      ],
    );

    const newAssetId = insertAsset.rows[0].id;
    await dbClient.query(
      `INSERT INTO maintenance_events (
         asset_id, event_type, outcome, performed_by, actor_id, notes, performed_at
       )
       VALUES ($1, $2, 'COMPLETED', 'Municipal Engineering Crew', $3, $4, $5)`,
      [newAssetId, asset.maintenanceType, officerId, asset.maintenanceNotes, maintainedAt],
    );
    assetsSeeded += 1;
  }

  if (assetsSeeded > 0) {
    console.log(`Seeded ${assetsSeeded} Layer 3 infrastructure asset(s).`);
  }

  // Idempotently seed historical baseline score trajectories so sparklines and
  // Improving/Deteriorating trends are accurate across repeated sweeps.
  const baselineTrajectories = {
    "RD-HYD-1024": [
      { daysAgo: 35, score: 72, grade: "FAIR", complaints: 1, open: 1 },
      { daysAgo: 14, score: 54, grade: "POOR", complaints: 3, open: 3 },
    ],
    "RD-TVM-066": [
      { daysAgo: 35, score: 68, grade: "FAIR", complaints: 1, open: 1 },
      { daysAgo: 14, score: 49, grade: "POOR", complaints: 2, open: 2 },
    ],
    "WP-HYD-204": [
      { daysAgo: 35, score: 74, grade: "FAIR", complaints: 1, open: 1 },
      { daysAgo: 14, score: 58, grade: "POOR", complaints: 2, open: 2 },
    ],
    "WP-TVM-108": [
      { daysAgo: 35, score: 70, grade: "FAIR", complaints: 0, open: 0 },
      { daysAgo: 14, score: 55, grade: "POOR", complaints: 1, open: 1 },
    ],
    "DR-BLR-802": [
      { daysAgo: 35, score: 82, grade: "GOOD", complaints: 0, open: 0 },
      { daysAgo: 14, score: 68, grade: "FAIR", complaints: 1, open: 1 },
    ],
    "WP-HYD-310": [
      { daysAgo: 35, score: 79, grade: "FAIR", complaints: 1, open: 1 },
      { daysAgo: 14, score: 66, grade: "FAIR", complaints: 2, open: 2 },
    ],
    "DR-HYD-112": [
      { daysAgo: 35, score: 78, grade: "FAIR", complaints: 1, open: 1 },
      { daysAgo: 24, score: 98, grade: "GOOD", complaints: 0, open: 0 },
    ],
    "DR-TVM-042": [
      { daysAgo: 35, score: 76, grade: "FAIR", complaints: 1, open: 1 },
      { daysAgo: 19, score: 98, grade: "GOOD", complaints: 0, open: 0 },
    ],
  };

  let historySeeded = 0;
  for (const [assetCode, points] of Object.entries(baselineTrajectories)) {
    const aRes = await dbClient.query(
      "SELECT id FROM infrastructure_assets WHERE asset_code = $1 LIMIT 1",
      [assetCode],
    );
    if (aRes.rowCount === 0) continue;
    const assetUuid = aRes.rows[0].id;
    const hCountRes = await dbClient.query(
      "SELECT COUNT(*)::int AS cnt FROM infrastructure_health_history WHERE asset_id = $1",
      [assetUuid],
    );
    const oldestRes = await dbClient.query(
      "SELECT MIN(recorded_at) AS min_at FROM infrastructure_health_history WHERE asset_id = $1",
      [assetUuid],
    );
    const oldestAt = oldestRes.rows[0]?.min_at ? new Date(oldestRes.rows[0].min_at).getTime() : nowMs;
    // Only backfill if there are no prior historical (>= 10 days old) baseline snapshots yet
    if (hCountRes.rows[0].cnt < 2 || nowMs - oldestAt < 10 * 24 * 60 * 60 * 1000) {
      for (const pt of points) {
        const recAt = daysAgo(pt.daysAgo);
        const dupRes = await dbClient.query(
          `SELECT 1 FROM infrastructure_health_history
           WHERE asset_id = $1 AND ABS(EXTRACT(EPOCH FROM (recorded_at - $2::timestamptz))) < 43200
           LIMIT 1`,
          [assetUuid, recAt],
        );
        if (dupRes.rowCount === 0) {
          await dbClient.query(
            `INSERT INTO infrastructure_health_history (
               asset_id, health_score, health_grade, complaint_count, open_complaint_count, score_breakdown, recorded_at
             )
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)`,
            [
              assetUuid,
              pt.score,
              pt.grade,
              pt.complaints,
              pt.open,
              JSON.stringify({ seededBaseline: true, baseScore: 100, totalPenalty: 100 - pt.score }),
              recAt,
            ],
          );
          historySeeded += 1;
        }
      }
    }
  }
  if (historySeeded > 0) {
    console.log(`Seeded ${historySeeded} baseline infrastructure health history point(s).`);
  }

  const infraSummary = await recalculateInfrastructureHealth({
    forceSnapshot: false,
    skipGraphSync: true,
  });
  console.log(
    `Layer 3 health scores computed: assets=${infraSummary.recomputedCount}`,
  );

  const kgSummary = await syncKnowledgeGraph();
  console.log(
    `Layer 4 knowledge graph synced: nodes=${kgSummary.nodesSynced}, edges=${kgSummary.edgesSynced}, inferred=${kgSummary.inferredEdgesCount}`,
  );

  await dbClient.end();
  await pool.end().catch(() => {});
  console.log("\nDATABASE SETUP COMPLETED SUCCESSFULLY!");
}

setup().catch((e) => {
  console.error("Setup error:", e);
  process.exit(1);
});
