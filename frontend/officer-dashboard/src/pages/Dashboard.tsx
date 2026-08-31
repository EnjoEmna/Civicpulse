import { useEffect, useState } from "react";
import { fetchDashboardComplaints } from "../api/client";
import type { Complaint } from "../types/complaint";
import ComplaintList from "../components/ComplaintList";

export default function Dashboard() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardComplaints()
      .then(setComplaints)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-xl font-medium text-slate-900 mb-6">Officer dashboard</h1>

      {loading && <p className="text-slate-500 text-sm">Loading complaints…</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!loading && !error && <ComplaintList complaints={complaints} />}
    </div>
  );
}
