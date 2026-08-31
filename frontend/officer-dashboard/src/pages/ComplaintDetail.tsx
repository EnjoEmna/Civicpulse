import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchComplaint, updateComplaintStatus } from "../api/client";
import type { Complaint, ComplaintStatus } from "../types/complaint";
import StatusBadge from "../components/StatusBadge";

const NEXT_STATUSES: ComplaintStatus[] = [
  "submitted",
  "in_review",
  "in_progress",
  "resolved",
  "rejected",
];

export default function ComplaintDetail() {
  const { id } = useParams<{ id: string }>();
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchComplaint(Number(id)).then(setComplaint).catch((e) => setError(e.message));
  }, [id]);

  async function handleStatusChange(status: ComplaintStatus) {
    if (!complaint) return;
    setSaving(true);
    try {
      const updated = await updateComplaintStatus(complaint.id, status);
      setComplaint(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="p-6 text-red-600 text-sm">{error}</p>;
  if (!complaint) return <p className="p-6 text-slate-500 text-sm">Loading…</p>;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-medium text-slate-900">{complaint.title}</h1>
        <StatusBadge status={complaint.status} />
      </div>

      <p className="text-slate-700 mb-6">{complaint.description}</p>

      <div className="text-sm text-slate-500 mb-6">
        Location: {complaint.latitude.toFixed(5)}, {complaint.longitude.toFixed(5)}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Update status
        </label>
        <select
          value={complaint.status}
          disabled={saving}
          onChange={(e) => handleStatusChange(e.target.value as ComplaintStatus)}
          className="border border-slate-300 rounded-md px-3 py-2 text-sm"
        >
          {NEXT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
