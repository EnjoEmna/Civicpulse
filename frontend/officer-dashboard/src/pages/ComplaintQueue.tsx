import { useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { ComplaintList } from "../components/ComplaintList";
import type { Complaint, ComplaintStatus, ComplaintCategory } from "../types/complaint";

// TODO: replace with api.getQueue({ status, category, query })
const MOCK_QUEUE: Complaint[] = [
  { id: "CP-10482", title: "Large pothole near bus stop", description: "", category: "roads", status: "in_progress", priority: "high", createdAt: "", updatedAt: "2026-09-09T09:00:00Z", citizenName: "Aditi Rao", location: { address: "4th Cross Rd", ward: "Ward 12", lat: 0, lng: 0 }, evidence: [], timeline: [], assignedOfficer: "You" },
  { id: "CP-10501", title: "Water pipeline leak flooding road", description: "", category: "water_supply", status: "open", priority: "urgent", createdAt: "", updatedAt: "2026-09-09T08:15:00Z", citizenName: "Vikram Shah", location: { address: "Lakeview Colony", ward: "Ward 12", lat: 0, lng: 0 }, evidence: [], timeline: [] },
  { id: "CP-10476", title: "Broken streetlight, school zone", description: "", category: "electricity", status: "open", priority: "medium", createdAt: "", updatedAt: "2026-09-08T17:40:00Z", citizenName: "Meena Iyer", location: { address: "Govt. School Rd", ward: "Ward 12", lat: 0, lng: 0 }, evidence: [], timeline: [] },
  { id: "CP-10391", title: "Streetlight outage on Park Ave", description: "", category: "electricity", status: "resolved", priority: "low", createdAt: "", updatedAt: "2026-08-27T11:00:00Z", citizenName: "Rahul Verma", location: { address: "Park Avenue", ward: "Ward 12", lat: 0, lng: 0 }, evidence: [], timeline: [] },
  { id: "CP-10312", title: "Garbage not collected for 5 days", description: "", category: "sanitation", status: "rejected", priority: "low", createdAt: "", updatedAt: "2026-08-19T09:00:00Z", citizenName: "Farhan Ali", location: { address: "5th Main Rd", ward: "Ward 12", lat: 0, lng: 0 }, evidence: [], timeline: [] },
];

const STATUS_FILTERS: { key: ComplaintStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
  { key: "rejected", label: "Rejected" },
];

const CATEGORY_FILTERS: { key: ComplaintCategory | "all"; label: string }[] = [
  { key: "all", label: "All categories" },
  { key: "roads", label: "Roads" },
  { key: "water_supply", label: "Water Supply" },
  { key: "electricity", label: "Electricity" },
  { key: "sanitation", label: "Sanitation" },
  { key: "public_safety", label: "Public Safety" },
  { key: "other", label: "Other" },
];

export default function ComplaintQueue() {
  const [status, setStatus] = useState<ComplaintStatus | "all">("all");
  const [category, setCategory] = useState<ComplaintCategory | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = MOCK_QUEUE.filter((c) => {
    const matchStatus = status === "all" || c.status === status;
    const matchCategory = category === "all" || c.category === category;
    const q = query.toLowerCase();
    const matchQuery = !q || c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || c.citizenName.toLowerCase().includes(q);
    return matchStatus && matchCategory && matchQuery;
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">Queue Management</span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Complaint Queue</h1>
        </div>
        <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-white/70 bg-white/50 px-3 py-1 text-xs font-semibold text-ink-soft shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md sm:self-auto">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          {filtered.length} of {MOCK_QUEUE.length} complaints
        </span>
      </div>

      {/* iOS Segmented Control for Statuses */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex min-w-full sm:min-w-0 items-center rounded-2xl border border-white/70 bg-black/[0.04] p-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-xl">
          {STATUS_FILTERS.map((f) => {
            const isActive = status === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatus(f.key)}
                className={`flex-1 sm:flex-initial rounded-xl px-4 py-1.5 text-xs font-semibold transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? "bg-white text-ink shadow-[0_2px_8px_rgba(0,0,0,0.08),inset_0_1px_1px_rgba(255,255,255,0.9)] scale-[1.02]"
                    : "text-ink-soft hover:text-ink hover:bg-white/30"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search & Category Filter Controls */}
      <div className="glass-panel flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
        {/* Spotlight-style Search */}
        <div className="relative flex-1">
          <MagnifyingGlass
            size={17}
            weight="bold"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft/70"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ID, title, or citizen name"
            className="glass-input w-full py-2.5 pl-10 pr-4 text-sm"
            aria-label="Search complaints"
          />
        </div>

        {/* Category Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ComplaintCategory | "all")}
            className="glass-input px-3.5 py-2.5 text-sm font-medium"
            aria-label="Filter by category"
          >
            {CATEGORY_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ComplaintList complaints={filtered} />
    </div>
  );
}
