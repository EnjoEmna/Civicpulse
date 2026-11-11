const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

jest.mock("../../config/database", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/database");
const config = require("../../config/env");
const complaintRepository = require("./complaint.repository");
const evidenceRepository = require("../../repositories/complaint-evidence.repository");
const complaintHistoryRepository = require("../../repositories/complaint-history.repository");
const userRepository = require("../users/user.repository");

function makeToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    config.jwtSecret || "test-secret",
    { expiresIn: "1h" },
  );
}

describe("Phase 1 Gap Closures (History, Notes, Assignment, Nearby, Officers)", () => {
  const officerId = "11111111-1111-4111-8111-111111111111";
  const citizenId = "22222222-2222-4222-8222-222222222222";
  const complaintId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  const officerToken = makeToken({ id: officerId, role: "OFFICER" });
  const citizenToken = makeToken({ id: citizenId, role: "CITIZEN" });

  const baseComplaint = {
    id: complaintId,
    reference_id: "CP-2026-000010",
    citizen_id: citizenId,
    title: "Broken water main on 2nd Ave",
    description: "Water spraying across road surface since morning.",
    category: "WATER_SUPPLY",
    department: "Water Supply & Drainage",
    assigned_officer_id: null,
    assigned_officer_name: null,
    assigned_officer_email: null,
    address: "2nd Ave, Sector 3",
    status: "SUBMITTED",
    priority: "HIGH",
    latitude: 17.4156,
    longitude: 78.4357,
    created_at: new Date("2026-11-10T09:00:00Z"),
    updated_at: new Date("2026-11-10T09:00:00Z"),
  };

  beforeAll(() => {
    if (!config.jwtSecret) {
      config.jwtSecret = "test-secret";
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("PATCH /api/v1/complaints/:id/status persists note in history and returns timeline", async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    jest.spyOn(pool, "connect").mockResolvedValue(mockClient);

    jest
      .spyOn(complaintRepository, "findComplaintById")
      .mockResolvedValue(baseComplaint);

    const updatedComplaint = {
      ...baseComplaint,
      status: "UNDER_REVIEW",
      updated_at: new Date("2026-11-10T10:00:00Z"),
    };
    const updateSpy = jest
      .spyOn(complaintRepository, "updateComplaintStatus")
      .mockResolvedValue(updatedComplaint);

    const historySpy = jest
      .spyOn(complaintHistoryRepository, "recordStatusChange")
      .mockResolvedValue({
        id: "hist-2",
        complaint_id: complaintId,
        from_status: "SUBMITTED",
        to_status: "UNDER_REVIEW",
        actor_id: officerId,
        actor_role: "OFFICER",
        note: "Assigned to inspection team for valve check",
        created_at: new Date("2026-11-10T10:00:00Z"),
      });

    jest
      .spyOn(evidenceRepository, "findEvidenceByComplaintId")
      .mockResolvedValue([]);

    jest
      .spyOn(complaintHistoryRepository, "findHistoryByComplaintId")
      .mockResolvedValue([
        {
          id: "hist-1",
          complaint_id: complaintId,
          from_status: null,
          to_status: "SUBMITTED",
          actor_id: citizenId,
          actor_role: "CITIZEN",
          actor_name: "Aditi Rao",
          note: "Complaint submitted by citizen",
          created_at: new Date("2026-11-10T09:00:00Z"),
        },
        {
          id: "hist-2",
          complaint_id: complaintId,
          from_status: "SUBMITTED",
          to_status: "UNDER_REVIEW",
          actor_id: officerId,
          actor_role: "OFFICER",
          actor_name: "Officer R. Naidu",
          note: "Assigned to inspection team for valve check",
          created_at: new Date("2026-11-10T10:00:00Z"),
        },
      ]);

    const res = await request(app)
      .patch(`/api/v1/complaints/${complaintId}/status`)
      .set("Authorization", `Bearer ${officerToken}`)
      .send({
        status: "UNDER_REVIEW",
        note: "Assigned to inspection team for valve check",
      });

    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith(
      complaintId,
      "UNDER_REVIEW",
      {},
      mockClient,
    );
    expect(historySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        complaintId,
        fromStatus: "SUBMITTED",
        toStatus: "UNDER_REVIEW",
        actorId: officerId,
        note: "Assigned to inspection team for valve check",
      }),
    );
    expect(res.body.data.status).toBe("UNDER_REVIEW");
    expect(res.body.data.timeline).toHaveLength(2);
    expect(res.body.data.timeline[1]).toMatchObject({
      fromStatus: "SUBMITTED",
      status: "UNDER_REVIEW",
      actor: "Officer R. Naidu",
      note: "Assigned to inspection team for valve check",
    });
  });

  test("PATCH /api/v1/complaints/:id/assign assigns a valid officer and rejects citizen assignees", async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    jest.spyOn(pool, "connect").mockResolvedValue(mockClient);

    jest
      .spyOn(complaintRepository, "findComplaintById")
      .mockResolvedValue({ ...baseComplaint, status: "UNDER_REVIEW" });

    jest.spyOn(userRepository, "findUserById").mockResolvedValueOnce({
      id: officerId,
      name: "Officer R. Naidu",
      email: "officer@civicpulse.org",
      role: "OFFICER",
    });

    jest
      .spyOn(complaintRepository, "assignComplaintOfficer")
      .mockResolvedValue({
        ...baseComplaint,
        status: "UNDER_REVIEW",
        assigned_officer_id: officerId,
        assigned_officer_name: "Officer R. Naidu",
        assigned_officer_email: "officer@civicpulse.org",
      });

    jest
      .spyOn(complaintHistoryRepository, "recordStatusChange")
      .mockResolvedValue({ id: "hist-assign" });

    jest
      .spyOn(evidenceRepository, "findEvidenceByComplaintId")
      .mockResolvedValue([]);

    jest
      .spyOn(complaintHistoryRepository, "findHistoryByComplaintId")
      .mockResolvedValue([]);

    const okRes = await request(app)
      .patch(`/api/v1/complaints/${complaintId}/assign`)
      .set("Authorization", `Bearer ${officerToken}`)
      .send({ assignedOfficerId: officerId });

    expect(okRes.status).toBe(200);
    expect(okRes.body.data.assignedOfficer).toEqual({
      id: officerId,
      name: "Officer R. Naidu",
      email: "officer@civicpulse.org",
    });

    jest.spyOn(userRepository, "findUserById").mockResolvedValueOnce({
      id: citizenId,
      name: "Aditi Rao",
      email: "citizen@civicpulse.org",
      role: "CITIZEN",
    });

    const badRes = await request(app)
      .patch(`/api/v1/complaints/${complaintId}/assign`)
      .set("Authorization", `Bearer ${officerToken}`)
      .send({ assignedOfficerId: citizenId });

    expect(badRes.status).toBe(400);
    expect(badRes.body.error.code).toBe("INVALID_ASSIGNEE");
  });

  test("GET /api/v1/complaints/nearby returns public summaries without leaking citizen_id", async () => {
    jest
      .spyOn(complaintRepository, "findNearbyPublicComplaints")
      .mockResolvedValue([
        {
          id: complaintId,
          reference_id: "CP-2026-000010",
          citizen_id: citizenId,
          title: "Broken water main on 2nd Ave",
          description: "Water spraying across road surface.",
          category: "WATER_SUPPLY",
          department: "Water Supply & Drainage",
          status: "SUBMITTED",
          priority: "HIGH",
          address: "2nd Ave, Sector 3",
          latitude: 17.4156,
          longitude: 78.4357,
          upvote_count: 3,
          distance_meters: 120.5,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

    const res = await request(app)
      .get("/api/v1/complaints/nearby?lat=17.4156&lng=78.4357&radius=2000")
      .set("Authorization", `Bearer ${citizenToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].isOwnComplaint).toBe(true);
    expect(res.body.data[0].citizen_id).toBeUndefined();
    expect(res.body.data[0].upvoteCount).toBe(3);
  });

  test("GET /api/v1/users/officers returns officers list to officers and forbids citizens", async () => {
    jest.spyOn(userRepository, "findOfficers").mockResolvedValue([
      {
        id: officerId,
        name: "Officer R. Naidu",
        email: "officer@civicpulse.org",
        role: "OFFICER",
      },
    ]);

    const officerRes = await request(app)
      .get("/api/v1/users/officers")
      .set("Authorization", `Bearer ${officerToken}`);
    expect(officerRes.status).toBe(200);
    expect(officerRes.body.data).toHaveLength(1);

    const citizenRes = await request(app)
      .get("/api/v1/users/officers")
      .set("Authorization", `Bearer ${citizenToken}`);
    expect(citizenRes.status).toBe(403);
  });

  test("PATCH /api/v1/users/me/password verifies currentPassword before updating", async () => {
    const currentHash = await bcrypt.hash("OldPass@123", 10);
    jest.spyOn(userRepository, "findUserAuthById").mockResolvedValue({
      id: citizenId,
      name: "Aditi Rao",
      email: "citizen@civicpulse.org",
      role: "CITIZEN",
      password_hash: currentHash,
    });

    const updateSpy = jest
      .spyOn(userRepository, "updateUserPassword")
      .mockResolvedValue({
        id: citizenId,
        updated_at: new Date(),
      });

    const wrongRes = await request(app)
      .patch("/api/v1/users/me/password")
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({
        currentPassword: "WrongPassword!",
        newPassword: "NewPass@123",
      });
    expect(wrongRes.status).toBe(401);
    expect(updateSpy).not.toHaveBeenCalled();

    const okRes = await request(app)
      .patch("/api/v1/users/me/password")
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({
        currentPassword: "OldPass@123",
        newPassword: "NewPass@123",
      });
    expect(okRes.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });
});
