const fs = require("fs");
const path = require("path");
const os = require("os");
const jwt = require("jsonwebtoken");

jest.mock("../../config/database", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const request = require("supertest");
const app = require("../../app");
const complaintRepository = require("./complaint.repository");
const evidenceRepository = require("../../repositories/complaint-evidence.repository");
const storage = require("../../config/storage");

const config = require("../../config/env");

function makeToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    config.jwtSecret || "test-secret",
    { expiresIn: "1h" },
  );
}

describe("Evidence Storage Config", () => {
  test("maps MIME types to valid evidence categories", () => {
    expect(storage.getFileCategory("image/png")).toBe("image");
    expect(storage.getFileCategory("image/jpeg")).toBe("image");
    expect(storage.getFileCategory("video/mp4")).toBe("video");
    expect(storage.getFileCategory("application/pdf")).toBe("document");
  });

  test("generates sanitized unique storage keys with safe extensions", () => {
    const key = storage.generateStorageKey("../../etc/passwd.png", "image/png");
    expect(key).not.toContain("..");
    expect(key).not.toContain("/");
    expect(key).not.toContain("\\");
    expect(key.endsWith(".png")).toBe(true);
  });

  test("builds encoded public URLs for evidence keys", () => {
    expect(storage.getPublicFileUrl("1234-test.jpg")).toBe(
      "/uploads/evidence/1234-test.jpg",
    );
  });
});

describe("Complaint Stats, Map, and Evidence Routes", () => {
  const officerToken = makeToken({
    id: "11111111-1111-4111-8111-111111111111",
    role: "OFFICER",
  });
  const citizenToken = makeToken({
    id: "22222222-2222-4222-8222-222222222222",
    role: "CITIZEN",
  });
  const otherCitizenToken = makeToken({
    id: "33333333-3333-4333-8333-333333333333",
    role: "CITIZEN",
  });

  const sampleComplaint = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    reference_id: "CP-2026-000001",
    citizen_id: "22222222-2222-4222-8222-222222222222",
    title: "Damaged stormwater drain",
    description: "Drain cover collapsed near main road",
    category: "ROAD",
    address: "4th Cross Rd",
    status: "SUBMITTED",
    priority: "HIGH",
    latitude: 17.4156,
    longitude: 78.4357,
    created_at: new Date("2026-11-01T10:00:00Z"),
    updated_at: new Date("2026-11-01T10:00:00Z"),
  };

  let createdStorageKey = null;

  beforeAll(() => {
    if (!config.jwtSecret) {
      config.jwtSecret = "test-secret";
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (createdStorageKey) {
      storage.removeStoredFile(createdStorageKey);
      createdStorageKey = null;
    }
  });

  test("GET /api/v1/complaints/stats returns aggregated counts for officers", async () => {
    jest.spyOn(complaintRepository, "getComplaintStats").mockResolvedValue({
      total: 4,
      submitted: 2,
      under_review: 1,
      assigned: 0,
      in_progress: 1,
      needs_information: 0,
      duplicate_suspected: 0,
      resolved: 0,
      rejected: 0,
      pending: 3,
      active_in_progress: 1,
      resolved_last_30_days: 0,
      overdue: 1,
      created_today: 1,
    });

    const res = await request(app)
      .get("/api/v1/complaints/stats")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      total: 4,
      pending: 3,
      activeInProgress: 1,
      resolvedLast30Days: 0,
      overdue: 1,
      createdToday: 1,
    });
  });

  test("GET /api/v1/complaints/stats denies access to citizens", async () => {
    const res = await request(app)
      .get("/api/v1/complaints/stats")
      .set("Authorization", `Bearer ${citizenToken}`);

    expect(res.status).toBe(403);
  });

  test("GET /api/v1/complaints/map returns geolocated complaints with evidence", async () => {
    jest
      .spyOn(complaintRepository, "findMapComplaints")
      .mockResolvedValue([sampleComplaint]);
    jest
      .spyOn(evidenceRepository, "findEvidenceByComplaintIds")
      .mockResolvedValue(new Map());

    const res = await request(app)
      .get("/api/v1/complaints/map")
      .set("Authorization", `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].referenceId).toBe("CP-2026-000001");
    expect(res.body.data[0].latitude).toBe(17.4156);
    expect(res.body.data[0].evidence).toEqual([]);
  });

  test("POST /api/v1/complaints/:id/evidence uploads PNG image and persists metadata", async () => {
    jest
      .spyOn(complaintRepository, "findComplaintById")
      .mockResolvedValue(sampleComplaint);

    jest
      .spyOn(evidenceRepository, "createEvidenceBatch")
      .mockImplementation(async (records) => {
        createdStorageKey = records[0].storageKey;
        return records.map((r, i) => ({
          id: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${i}`,
          complaint_id: r.complaintId,
          uploaded_by: r.uploadedBy,
          original_name: r.originalName,
          storage_key: r.storageKey,
          file_url: r.fileUrl,
          mime_type: r.mimeType,
          file_type: r.fileType,
          file_size: r.fileSize,
          created_at: new Date(),
        }));
      });

    const tinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );

    const tmpFile = path.join(os.tmpdir(), "civicpulse-test-evidence.png");
    fs.writeFileSync(tmpFile, tinyPng);

    try {
      const res = await request(app)
        .post(`/api/v1/complaints/${sampleComplaint.id}/evidence`)
        .set("Authorization", `Bearer ${citizenToken}`)
        .attach("files", tmpFile);

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe("image");
      expect(res.body.data[0].url).toContain("/uploads/evidence/");
      expect(createdStorageKey).toBeTruthy();
      expect(
        fs.existsSync(path.join(storage.EVIDENCE_DIR, createdStorageKey)),
      ).toBe(true);
    } finally {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  });

  test("POST /api/v1/complaints/:id/evidence rejects another citizen from uploading", async () => {
    jest
      .spyOn(complaintRepository, "findComplaintById")
      .mockResolvedValue(sampleComplaint);

    const tinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );

    const res = await request(app)
      .post(`/api/v1/complaints/${sampleComplaint.id}/evidence`)
      .set("Authorization", `Bearer ${otherCitizenToken}`)
      .attach("files", tinyPng, "unauth.png");

    expect(res.status).toBe(403);
  });

  test("POST /api/v1/complaints/:id/evidence rejects unsupported file MIME types", async () => {
    const res = await request(app)
      .post(`/api/v1/complaints/${sampleComplaint.id}/evidence`)
      .set("Authorization", `Bearer ${citizenToken}`)
      .attach("files", Buffer.from("not allowed"), {
        filename: "script.exe",
        contentType: "application/x-msdownload",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_FILE_TYPE");
  });
});
