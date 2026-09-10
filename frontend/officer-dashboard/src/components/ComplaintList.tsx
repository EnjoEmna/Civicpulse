import { Link } from "react-router-dom";
import { MapPin } from "@phosphor-icons/react";
import { StatusBadge, PriorityTag } from "./StatusBadge";
import type { Complaint } from "../types/complaint";

export function ComplaintList({ complaints }: { complaints: Complaint[] }) {
  if (complaints.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-surface px-6 py-14 text-center">
        <p className="text-sm font-medium text-ink">No complaints match these filters</p>
        <p className="text-xs text-ink-soft">Try widening your search or clearing filters.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-bg text-xs font-semibold uppercase tracking-wide text-ink-soft">
            <th className="px-4 py-3">ID</th>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Location</th>
            <th className="px-4 py-3">Priority</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Updated</th>
          </tr>
        </thead>
        <tbody>
          {complaints.map((c) => (
            <tr key={c.id} className="border-b border-border last:border-0 hover:bg-primary-soft/30">
              <td className="px-4 py-3">
                <Link to={`/officer/complaints/${c.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                  #{c.id}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Link to={`/officer/complaints/${c.id}`} className="font-medium text-ink hover:underline">
                  {c.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-ink-soft">
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} className="shrink-0" /> {c.location.ward}
                </span>
              </td>
              <td className="px-4 py-3">
                <PriorityTag priority={c.priority} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={c.status} />
              </td>
              <td className="px-4 py-3 text-xs text-ink-soft">{new Date(c.updatedAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
