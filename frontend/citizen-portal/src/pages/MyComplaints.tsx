import { useState } from "react";
import { Link } from "react-router-dom";
import { MagnifyingGlass, FileText } from "@phosphor-icons/react";
import { StatusBadge } from "../components/StatusBadge";
import type { Complaint, ComplaintStatus } from "../types/complaint";

// TODO: replace with api.getMyComplaints() via useEffect
const MOCK_COMPLAINTS: Complaint[] = [
  {
    id: "CP-10482",
    title: "Large pothole near bus stop",
    description: "",
    category: "roads",
    status: "in_progress",
    createdAt: "2026-09-02T10:00:00Z",
    updatedAt: "2026-09-06T14:00:00Z",
    location: { address: "4th Cross Rd, Banjara Hills", lat: 0, lng: 0 },
    evidence: [],
    timeline: [],
    assignedOfficer: "Officer R. Naidu",
  },
  {
    id: "CP-10391",
    title: "Streetlight outage on Park Ave",
    description: "",
    category: "electricity",
    status: "resolved",
    createdAt: "2026-08-20T09:00:00Z",
    updatedAt: "2026-08-27T11:00:00Z",
    location: { address: "Park Avenue", lat: 0, lng: 0 },
    evidence: [],
    timeline: [],
  },
  {
    id: "CP-10355",
    title: "Overflowing garbage bin, Market St",
    description: "",
    category: "sanitation",
    status: "open",
    createdAt: "2026-09-08T08:30:00Z",
    updatedAt: "2026-09-08T08:30:00Z",
    location: { address: "Market Street" , lat: 0, lng: 0 },
    evidence: [],
    timeline: [],
  },
];

const FILTERS: { key: ComplaintStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
  { key: "rejected", label: "Rejected" },
];

export default function MyComplaints() {
  const [filter, setFilter] = useState<ComplaintStatus | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = MOCK_COMPLAINTS.filter((c) => {
    const matchesFilter = filter === "all" || c.status === filter;
    const matchesQuery = c.title.toLowerCase().includes(query.toLowerCase()) || c.id.toLowerCase().includes(query.toLowerCase());
    return matchesFilter && matchesQuery;
  });

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-ink">My Complaints</h1>
        <div className="relative w-full sm:w-64">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or ID"
            className="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:border-primary"
            aria-label="Search complaints"
          />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key ? "bg-primary text-white" : "bg-surface text-ink-soft border border-border hover:bg-primary-soft/50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
          <FileText size={32} className="text-ink-soft" />
          <p className="text-sm font-medium text-ink">No complaints match your filters</p>
          <Link to="/report" className="text-sm font-medium text-primary hover:underline">
            Report a new issue
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((c) => (
            <li key={c.id}>
              <Link
                to={`/complaints/${c.id}`}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-ink-soft">#{c.id}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <span className="font-semibold text-ink">{c.title}</span>
                  <span className="text-sm text-ink-soft">{c.location.address}</span>
                </div>
                <span className="text-xs text-ink-soft sm:text-right">
                  Updated {new Date(c.updatedAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
