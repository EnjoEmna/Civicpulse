const pool = require("../config/database");

async function createEvidenceBatch(records, db = pool) {
  if (!records || records.length === 0) {
    return [];
  }

  const values = [];
  const placeholders = records.map((record, index) => {
    const offset = index * 8;
    values.push(
      record.complaintId,
      record.uploadedBy,
      record.originalName,
      record.storageKey,
      record.fileUrl,
      record.mimeType,
      record.fileType,
      record.fileSize,
    );

    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`;
  });

  const result = await db.query(
    `INSERT INTO complaint_evidence (
       complaint_id,
       uploaded_by,
       original_name,
       storage_key,
       file_url,
       mime_type,
       file_type,
       file_size
     )
     VALUES ${placeholders.join(", ")}
     RETURNING
       id,
       complaint_id,
       uploaded_by,
       original_name,
       storage_key,
       file_url,
       mime_type,
       file_type,
       file_size,
       created_at`,
    values,
  );

  return result.rows;
}

async function findEvidenceByComplaintId(complaintId) {
  const result = await pool.query(
    `SELECT
       id,
       complaint_id,
       uploaded_by,
       original_name,
       storage_key,
       file_url,
       mime_type,
       file_type,
       file_size,
       created_at
     FROM complaint_evidence
     WHERE complaint_id = $1
     ORDER BY created_at ASC`,
    [complaintId],
  );

  return result.rows;
}

async function findEvidenceByComplaintIds(complaintIds) {
  const byComplaintId = new Map();

  if (!complaintIds || complaintIds.length === 0) {
    return byComplaintId;
  }

  const result = await pool.query(
    `SELECT
       id,
       complaint_id,
       uploaded_by,
       original_name,
       storage_key,
       file_url,
       mime_type,
       file_type,
       file_size,
       created_at
     FROM complaint_evidence
     WHERE complaint_id = ANY($1::uuid[])
     ORDER BY created_at ASC`,
    [complaintIds],
  );

  for (const row of result.rows) {
    if (!byComplaintId.has(row.complaint_id)) {
      byComplaintId.set(row.complaint_id, []);
    }
    byComplaintId.get(row.complaint_id).push(row);
  }

  return byComplaintId;
}

async function findEvidenceById(id) {
  const result = await pool.query(
    `SELECT
       id,
       complaint_id,
       uploaded_by,
       original_name,
       storage_key,
       file_url,
       mime_type,
       file_type,
       file_size,
       created_at
     FROM complaint_evidence
     WHERE id = $1`,
    [id],
  );

  return result.rows[0] || null;
}

async function deleteEvidenceById(id) {
  const result = await pool.query(
    `DELETE FROM complaint_evidence
     WHERE id = $1
     RETURNING
       id,
       complaint_id,
       uploaded_by,
       original_name,
       storage_key,
       file_url,
       mime_type,
       file_type,
       file_size,
       created_at`,
    [id],
  );

  return result.rows[0] || null;
}

module.exports = {
  createEvidenceBatch,
  findEvidenceByComplaintId,
  findEvidenceByComplaintIds,
  findEvidenceById,
  deleteEvidenceById,
};
