import { useState } from "react";
import { MapPin, Funnel } from "@phosphor-icons/react";
import { StatusBadge, PriorityTag } from "../components/StatusBadge";
import type { Complaint, ComplaintStatus } from "../types/complaint";

// TODO: replace with api.getMapComplaints()
const MOCK_PINS: Complaint[] = [
  { id: "CP-10482", title: "Large pothole", description: "", category: "roads", status: "in_progress", priority: "high", createdAt: "", updatedAt: "", citizenName: "Aditi Rao", location: { address: "4th Cross Rd", ward: "Ward 12", lat: 40, lng: 30 }, evidence: [], timeline: [] },
  { id: "CP-10501", title: "Water pipeline leak", description: "", category: "water_supply", status: "open", priority: "urgent", createdAt: "", updatedAt: "", citizenName: "Vikram Shah", location: { address: "Lakeview Colony", ward: "Ward 12", lat: 60, lng: 55 }, evidence: [], timeline: [] },
  { id: "CP-10476", title: "Broken streetlight", description: "", category: "electricity", status: "open", priority: "medium", createdAt: "", updatedAt: "", citizenName: "Meena Iyer", location: { address: "Govt. School Rd", ward: "Ward 12", lat: 25, lng: 70 }, evidence: [], timeline: [] },
  { id: "CP-10391", title: "Streetlight outage", description: "", category: "electricity", status: "resolved", priority: "low", createdAt: "", updatedAt: "", citizenName: "Rahul Verma", location: { address: "Park Avenue", ward: "Ward 12", lat: 75, lng: 20 }, evidence: [], timeline: [] },
];

const PIN_COLOR: Record<ComplaintStatus, string> = {
  open: "text-status-open",
  in_progress: "text-status-progress",
  resolved: "text-status-resolved",
  rejected: "text-status-rejected",
};

export default function IssueMap() {
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | "all">("all");

  const pins = MOCK_PINS.filter((p) => statusFilter === "all" || p.status === statusFilter);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Issue Map</h1>
        <div className="flex items-center gap-2">
          <Funnel size={16} className="text-ink-soft" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ComplaintStatus | "all")}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-primary"
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="relative h-[480px] overflow-hidden rounded-xl border border-border bg-bg">
          <div className="absolute inset-0 bg-[linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] bg-[size:32px_32px] opacity-40" />
          {pins.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              style={{ left: `${p.location.lat}%`, top: `${p.location.lng}%` }}
              className="absolute -translate-x-1/2 -translate-y-full"
              aria-label={p.title}
            >
              <MapPin size={28} weight="fill" className={PIN_COLOR[p.status]} />
            </button>
          ))}
          <span className="absolute bottom-3 left-3 rounded-md bg-surface/90 px-2 py-1 text-xs text-ink-soft">
            Map integration pending — showing sample pins
          </span>
          <div className="absolute right-3 top-3 flex flex-col gap-1.5 rounded-md bg-surface/90 p-2.5 text-xs">
            <Legend color="text-status-open" label="Open" />
            <Legend color="text-status-progress" label="In Progress" />
            <Legend color="text-status-resolved" label="Resolved" />
            <Legend color="text-status-rejected" label="Rejected" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          {selected ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-ink-soft">#{selected.id}</span>
                <StatusBadge status={selected.status} />
              </div>
              <span className="font-semibold text-ink">{selected.title}</span>
              <span className="text-sm text-ink-soft">{selected.location.address}</span>
              <PriorityTag priority={selected.priority} />
              <a
                href={`/officer/complaints/${selected.id}`}
                className="mt-2 self-start text-sm font-medium text-primary hover:underline"
              >
                Open full review →
              </a>
            </div>
          ) : (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
                {pins.length} issue{pins.length !== 1 ? "s" : ""} on map
              </h2>
              <ul className="flex flex-col gap-2">
                {pins.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelected(p)}
                      className="flex w-full flex-col gap-1 rounded-md border border-border p-2.5 text-left hover:border-primary"
                    >
                      <span className="text-sm font-medium text-ink">{p.title}</span>
                      <StatusBadge status={p.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-ink-soft">
      <MapPin size={12} weight="fill" className={color} /> {label}
    </span>
  );
}
