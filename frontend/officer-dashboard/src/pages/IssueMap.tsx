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

const PIN_COLOR: Record<ComplaintStatus, { color: string; glow: string }> = {
  open: { color: "text-amber-500", glow: "shadow-[0_0_12px_rgba(245,158,11,0.6)]" },
  in_progress: { color: "text-blue-500", glow: "shadow-[0_0_12px_rgba(37,99,235,0.6)]" },
  resolved: { color: "text-emerald-500", glow: "shadow-[0_0_12px_rgba(16,185,129,0.6)]" },
  rejected: { color: "text-rose-500", glow: "shadow-[0_0_12px_rgba(225,29,72,0.6)]" },
};

export default function IssueMap() {
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | "all">("all");

  const pins = MOCK_PINS.filter((p) => statusFilter === "all" || p.status === statusFilter);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">Geographic View</span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Issue Map</h1>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/50 px-3 py-1.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md">
          <Funnel size={16} weight="bold" className="text-ink-soft" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ComplaintStatus | "all")}
            className="bg-transparent text-xs font-semibold text-ink focus:outline-none"
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

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Apple Maps style interactive surface */}
        <div className="glass-panel relative h-[500px] overflow-hidden">
          {/* Subtle iOS Maps street grid pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(18,60,97,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(18,60,97,0.06)_1px,transparent_1px)] bg-[size:36px_36px]" />
          <div className="absolute inset-0 bg-radial-at-c from-transparent via-blue-500/[0.02] to-indigo-500/[0.05] pointer-events-none" />

          {/* Interactive Pins */}
          {pins.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              style={{ left: `${p.location.lat}%`, top: `${p.location.lng}%` }}
              className="group absolute -translate-x-1/2 -translate-y-full transition-transform duration-200 hover:scale-125 focus:outline-none"
              aria-label={p.title}
            >
              <div className="relative flex flex-col items-center">
                <span className="absolute -inset-1 animate-ping rounded-full bg-blue-400 opacity-25" />
                <MapPin
                  size={32}
                  weight="fill"
                  className={`${PIN_COLOR[p.status].color} drop-shadow-md transition-all group-hover:drop-shadow-lg`}
                />
              </div>
            </button>
          ))}

          {/* iOS Floating Status Badge */}
          <span className="absolute bottom-3.5 left-3.5 rounded-full border border-white/70 bg-white/60 px-3 py-1.5 text-xs font-medium text-ink-soft shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_4px_12px_rgba(15,23,42,0.05)] backdrop-blur-md">
            📍 Ward 12 Geospatial Canvas · 4 active sample pins
          </span>

          {/* iOS Floating Legend Capsule */}
          <div className="absolute right-3.5 top-3.5 flex flex-col gap-1.5 rounded-2xl border border-white/70 bg-white/60 p-3 text-xs shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_4px_12px_rgba(15,23,42,0.06)] backdrop-blur-md">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft/80 mb-0.5">Legend</span>
            <Legend color="text-amber-500" label="Open" />
            <Legend color="text-blue-500" label="In Progress" />
            <Legend color="text-emerald-500" label="Resolved" />
            <Legend color="text-rose-500" label="Rejected" />
          </div>
        </div>

        {/* Selected pin drawer / detail card */}
        <div className="glass-panel p-5">
          {selected ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-primary-soft/60 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                  #{selected.id}
                </span>
                <StatusBadge status={selected.status} />
              </div>
              <h2 className="text-base font-bold text-ink">{selected.title}</h2>
              <span className="text-xs text-ink-soft">{selected.location.address}</span>
              <div>
                <PriorityTag priority={selected.priority} />
              </div>
              <a
                href={`/officer/complaints/${selected.id}`}
                className="mt-3 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:bg-primary-strong active:scale-95"
              >
                Open full review →
              </a>
            </div>
          ) : (
            <div>
              <div className="mb-3.5 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                  {pins.length} Issue{pins.length !== 1 ? "s" : ""} on Map
                </h2>
              </div>
              <ul className="flex flex-col gap-2">
                {pins.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelected(p)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/60 bg-white/40 p-3 text-left backdrop-blur-sm transition-all duration-150 hover:bg-white/70 hover:border-blue-400/50 shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.7)]"
                    >
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-ink">{p.title}</span>
                        <span className="text-[11px] text-ink-soft">{p.location.address}</span>
                      </div>
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
    <span className="flex items-center gap-2 text-ink-soft font-medium">
      <MapPin size={13} weight="fill" className={color} /> {label}
    </span>
  );
}
