import { useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Funnel, CaretRight, Compass, X } from "@phosphor-icons/react";
import { StatusBadge } from "../components/StatusBadge";
import type { Complaint, ComplaintCategory } from "../types/complaint";

// TODO: replace with api.getNearbyComplaints(lat, lng)
const MOCK_PINS: Complaint[] = [
  { id: "CP-10482", title: "Large pothole near bus stop", description: "Deep road depression requiring patch repair", category: "roads", status: "in_progress", createdAt: "", updatedAt: "2026-09-06T14:00:00Z", location: { address: "4th Cross Rd, Banjara Hills", lat: 38, lng: 32 }, evidence: [], timeline: [] },
  { id: "CP-10391", title: "Streetlight outage", description: "Column #14 dark for three nights", category: "electricity", status: "resolved", createdAt: "", updatedAt: "2026-08-27T11:00:00Z", location: { address: "Park Avenue", lat: 62, lng: 52 }, evidence: [], timeline: [] },
  { id: "CP-10355", title: "Overflowing bin", description: "Bin overflow onto pedestrian walkway", category: "sanitation", status: "open", createdAt: "", updatedAt: "2026-09-08T08:30:00Z", location: { address: "Market Street", lat: 26, lng: 68 }, evidence: [], timeline: [] },
  { id: "CP-10312", title: "Mainline water leak", description: "Potable supply pipe breach near junction", category: "water_supply", status: "open", createdAt: "", updatedAt: "2026-09-07T12:00:00Z", location: { address: "5th Main Rd", lat: 74, lng: 22 }, evidence: [], timeline: [] },
];

const CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  roads: "Roads",
  water_supply: "Water Supply",
  electricity: "Electricity",
  sanitation: "Sanitation",
  public_safety: "Public Safety",
  other: "Other",
};

export default function CivicMap() {
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<ComplaintCategory | "all">("all");

  const pins = MOCK_PINS.filter((p) => categoryFilter === "all" || p.category === categoryFilter);

  return (
    <div className="space-y-5">
      {/* Top Header & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink font-display">Civic Map</h1>
          <p className="text-xs font-medium text-ink-soft mt-0.5">
            Geographic view of citizen reports and municipal service events
          </p>
        </div>

        {/* Floating Category Filter Capsule */}
        <div className="glass-pill inline-flex items-center gap-2 rounded-ios-xl border border-white/70 bg-white/50 px-3.5 py-1.5 shadow-sm backdrop-blur-md self-start sm:self-auto">
          <Funnel size={14} className="text-primary font-bold" />
          <span className="text-xs font-semibold text-ink-soft">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as ComplaintCategory | "all")}
            className="bg-transparent text-xs font-bold text-ink focus:outline-none cursor-pointer pr-1"
            aria-label="Filter by category"
          >
            <option value="all">All Categories ({MOCK_PINS.length})</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Grid: Map & Liquid Inspector Panel */}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Apple Maps Style Canvas Container */}
        <div className="glass-panel relative h-[460px] overflow-hidden rounded-ios-3xl border border-white/70 shadow-ios-glass bg-slate-900/5">
          {/* Subtle Grid / Topography Map Canvas */}
          <div className="absolute inset-0 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:24px_24px] opacity-25" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] bg-[size:4rem_4rem]" />

          {/* Floating Compass Badge */}
          <div className="glass-pill absolute top-3.5 left-3.5 z-10 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1.5 shadow-sm backdrop-blur-md">
            <Compass size={16} weight="duotone" className="text-primary animate-spin-slow" />
            <span className="text-xs font-bold text-ink">Banjara Hills Sector</span>
          </div>

          {/* Interactive Beacon Map Pins */}
          {pins.map((p) => {
            const isSelected = selected?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                style={{ left: `${p.location.lat}%`, top: `${p.location.lng}%` }}
                className="group absolute -translate-x-1/2 -translate-y-full transition-all duration-200 focus:outline-none cursor-pointer z-20"
                aria-label={p.title}
              >
                <div className="relative flex flex-col items-center">
                  {/* Ping Animation on Selected */}
                  {isSelected && (
                    <span className="absolute -inset-1.5 rounded-full bg-blue-500/40 animate-ping" />
                  )}

                  <div
                    className={`relative flex items-center justify-center rounded-full p-2 shadow-lg transition-transform active:scale-95 ${
                      isSelected
                        ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white scale-110 ring-4 ring-white/90 shadow-blue-500/40"
                        : "bg-white text-primary border border-white/80 hover:scale-105 shadow-md group-hover:text-blue-600"
                    }`}
                  >
                    <MapPin size={20} weight="fill" />
                  </div>

                  {/* Pin label preview */}
                  <span
                    className={`mt-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold shadow-sm backdrop-blur-md border ${
                      isSelected
                        ? "bg-ink text-white border-white/20"
                        : "bg-white/80 text-ink border-white/60 opacity-0 group-hover:opacity-100 transition-opacity"
                    }`}
                  >
                    {p.title}
                  </span>
                </div>
              </button>
            );
          })}

          {/* Bottom Floating Legend / Note */}
          <div className="glass-pill absolute bottom-3.5 left-3.5 right-3.5 sm:right-auto z-10 rounded-full border border-white/70 bg-white/70 px-3.5 py-1.5 shadow-sm backdrop-blur-md">
            <span className="text-[11px] font-medium text-ink-soft">
              Interactive sample pins · Click any pin or list item to inspect details
            </span>
          </div>
        </div>

        {/* Liquid Glass Inspector / Side Drawer */}
        <div className="glass-panel flex flex-col rounded-ios-2xl border border-white/70 p-5 shadow-ios-glass min-h-[300px]">
          {selected ? (
            <div className="flex flex-col justify-between h-full gap-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-ink-soft/80 bg-white/50 border border-white/70 px-2 py-0.5 rounded-md backdrop-blur-sm">
                    #{selected.id}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={selected.status} />
                    <button
                      onClick={() => setSelected(null)}
                      className="rounded-full p-1 text-ink-soft hover:bg-white/50 hover:text-ink transition-colors"
                      title="Close"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-bold text-ink font-display">{selected.title}</h3>
                  <p className="text-xs text-ink-soft mt-1 leading-relaxed">{selected.description}</p>
                </div>

                <div className="rounded-ios-xl border border-white/60 bg-white/30 p-3 backdrop-blur-sm space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-ink font-semibold">
                    <MapPin size={14} className="text-primary shrink-0" />
                    <span className="truncate">{selected.location.address}</span>
                  </div>
                  <span className="text-[11px] text-ink-soft block capitalize">
                    Category: <strong className="text-ink">{selected.category.replace("_", " ")}</strong>
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-white/40 flex items-center justify-between gap-2">
                <button
                  onClick={() => setSelected(null)}
                  className="text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
                >
                  Clear Selection
                </button>
                <Link
                  to={`/complaints/${selected.id}`}
                  className="ios-btn-primary inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm"
                >
                  <span>Full Details</span>
                  <CaretRight size={13} weight="bold" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Nearby Reports ({pins.length})
                </h2>
                <span className="text-[11px] font-semibold text-primary">Ward 12</span>
              </div>

              <ul className="flex flex-col gap-2 overflow-y-auto pr-1 flex-1">
                {pins.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelected(p)}
                      className="group flex w-full flex-col gap-1.5 rounded-ios-xl border border-white/60 bg-white/30 p-3 text-left transition-all duration-150 hover:bg-white/60 hover:shadow-sm hover:border-white active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-ink group-hover:text-primary transition-colors truncate max-w-[170px]">
                          {p.title}
                        </span>
                        <StatusBadge status={p.status} />
                      </div>
                      <span className="text-[11px] text-ink-soft truncate">{p.location.address}</span>
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
