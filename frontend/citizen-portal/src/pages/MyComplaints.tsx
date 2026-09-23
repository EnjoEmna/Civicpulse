import { useState } from "react";
import { Link } from "react-router-dom";
import { MagnifyingGlass, FileText, MapPin, Clock, CaretRight, Plus } from "@phosphor-icons/react";
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
    <div className="space-y-6">
      {/* Header & Spotlight Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink font-display">My Complaints</h1>
          <p className="text-xs font-medium text-ink-soft mt-0.5">
            Track and monitor resolution progress on your submitted reports
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft/70" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Spotlight search by title or ID"
            className="glass-input w-full rounded-ios-xl py-2 pl-9 pr-4 text-xs font-medium text-ink placeholder:text-ink-soft/60 focus:outline-none"
            aria-label="Search complaints"
          />
        </div>
      </div>

      {/* iOS Segmented Control Dock */}
      <div className="glass-pill inline-flex flex-wrap items-center gap-1 rounded-full p-1 border border-white/60 bg-white/40 shadow-sm backdrop-blur-md" role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          return (
            <button
              key={f.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                isActive
                  ? "bg-primary text-white shadow-[0_2px_8px_rgba(37,99,235,0.35),inset_0_1px_0.5px_rgba(255,255,255,0.4)]"
                  : "text-ink-soft hover:text-ink hover:bg-white/40"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Complaint Cards or Empty State */}
      {filtered.length === 0 ? (
        <div className="glass-panel rounded-ios-2xl border-dashed border-white/60 px-6 py-16 text-center flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/60 text-ink-soft border border-white/70 shadow-sm">
            <FileText size={28} />
          </div>
          <p className="text-base font-semibold text-ink">No complaints match your filters</p>
          <p className="text-xs text-ink-soft max-w-sm">
            Try adjusting your search criteria or submit a new grievance for municipal assistance.
          </p>
          <Link to="/report" className="ios-btn-primary mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white shadow-md">
            <Plus size={14} weight="bold" />
            Report a new issue
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((c) => (
            <li key={c.id}>
              <Link
                to={`/complaints/${c.id}`}
                className="glass-panel group relative block rounded-ios-2xl p-5 sm:p-6 border border-white/70 shadow-ios-glass transition-all duration-200 hover:shadow-ios-glass-hover hover:border-white active:scale-[0.995]"
              >
                {/* Top Row: Tracking ID + Status on left, Updated Date on right */}
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-ink-soft/90 bg-white/60 border border-white/80 px-2.5 py-0.5 rounded-md backdrop-blur-sm shadow-xs">
                      #{c.id}
                    </span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-ink-soft shrink-0">
                    <Clock size={13} className="text-ink-soft/70" />
                    <span>Updated {new Date(c.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Middle Row: Title */}
                <h2 className="text-base sm:text-lg font-bold text-ink group-hover:text-primary transition-colors tracking-tight mb-3">
                  {c.title}
                </h2>

                {/* Bottom Row: Address on left, View Details on right */}
                <div className="flex items-center justify-between gap-4 pt-2.5 border-t border-white/40 text-xs text-ink-soft">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MapPin size={15} className="text-primary shrink-0" />
                    <span className="truncate">{c.location.address}</span>
                  </div>
                  <div className="inline-flex items-center gap-1 font-semibold text-primary shrink-0 group-hover:translate-x-0.5 transition-transform">
                    <span>View details</span>
                    <CaretRight size={13} weight="bold" />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
