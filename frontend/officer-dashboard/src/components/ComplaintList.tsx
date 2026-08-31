import { useState } from "react";
import { Link } from "react-router-dom";
import type { Complaint, ComplaintStatus } from "../types/complaint";
import StatusBadge from "./StatusBadge";

const STATUS_FILTERS: (ComplaintStatus | "all")[] = [
  "all",
  "submitted",
  "in_review",
  "in_progress",
  "resolved",
  "rejected",
];

export default function ComplaintList({ complaints }: { complaints: Complaint[] }) {
  const [filter, setFilter] = useState<ComplaintStatus | "all">("all");

  const visible =
    filter === "all" ? complaints : complaints.filter((c) => c.status === filter);

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-1 rounded-md text-sm border ${
              filter === status
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
            }`}
          >
            {status === "all" ? "All" : status.replace("_", " ")}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-slate-500 text-sm">No complaints match this filter.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-4">Title</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Submitted</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-3 pr-4 font-medium text-slate-800">{c.title}</td>
                <td className="py-3 pr-4">
                  <StatusBadge status={c.status} />
                </td>
                <td className="py-3 pr-4 text-slate-500">
                  {new Date(c.created_at).toLocaleDateString()}
                </td>
                <td className="py-3 text-right">
                  <Link to={`/complaints/${c.id}`} className="text-sky-600 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
