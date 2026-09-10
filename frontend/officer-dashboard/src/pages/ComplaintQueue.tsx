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
    <div>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Complaint Queue</h1>
        <span className="text-sm text-ink-soft">{filtered.length} of {MOCK_QUEUE.length} complaints</span>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ID, title, or citizen name"
            className="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:border-primary"
            aria-label="Search complaints"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ComplaintStatus | "all")}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-primary"
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ComplaintCategory | "all")}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-primary"
          aria-label="Filter by category"
        >
          {CATEGORY_FILTERS.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
      </div>

      <ComplaintList complaints={filtered} />
    </div>
  );
}
