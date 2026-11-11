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
  });
  console.log(
    `Layer 2 hotspots synced: detected=${hotspotSummary.detectedCount}, overlaps=${hotspotSummary.crossCategoryOverlapCount}`,
  );

  await dbClient.end();
  await pool.end().catch(() => {});
  console.log("\nDATABASE SETUP COMPLETED SUCCESSFULLY!");
}

setup().catch((e) => {
  console.error("Setup error:", e);
  process.exit(1);
});
