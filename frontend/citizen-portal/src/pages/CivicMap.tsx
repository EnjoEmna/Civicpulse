import { useState } from "react";
import { MapPin, Funnel } from "@phosphor-icons/react";
import { StatusBadge } from "../components/StatusBadge";
import type { Complaint, ComplaintCategory } from "../types/complaint";

// TODO: replace with api.getNearbyComplaints(lat, lng)
const MOCK_PINS: Complaint[] = [
  { id: "CP-10482", title: "Large pothole", description: "", category: "roads", status: "in_progress", createdAt: "", updatedAt: "", location: { address: "4th Cross Rd", lat: 40, lng: 30 }, evidence: [], timeline: [] },
  { id: "CP-10391", title: "Streetlight outage", description: "", category: "electricity", status: "resolved", createdAt: "", updatedAt: "", location: { address: "Park Avenue", lat: 60, lng: 55 }, evidence: [], timeline: [] },
  { id: "CP-10355", title: "Overflowing bin", description: "", category: "sanitation", status: "open", createdAt: "", updatedAt: "", location: { address: "Market Street", lat: 25, lng: 70 }, evidence: [], timeline: [] },
  { id: "CP-10312", title: "Water leak", description: "", category: "water_supply", status: "open", createdAt: "", updatedAt: "", location: { address: "5th Main Rd", lat: 75, lng: 20 }, evidence: [], timeline: [] },
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
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Civic Map</h1>
        <div className="flex items-center gap-2">
          <Funnel size={16} className="text-ink-soft" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as ComplaintCategory | "all")}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-primary"
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Map placeholder — swap for MapLibre / Google Maps in integration */}
        <div className="relative h-[420px] overflow-hidden rounded-xl border border-border bg-bg">
          <div className="absolute inset-0 bg-[linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] bg-[size:32px_32px] opacity-40" />
          {pins.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              style={{ left: `${p.location.lat}%`, top: `${p.location.lng}%` }}
              className="absolute -translate-x-1/2 -translate-y-full"
              aria-label={p.title}
            >
              <MapPin
                size={28}
                weight="fill"
                className={selected?.id === p.id ? "text-primary-strong" : "text-primary"}
              />
            </button>
          ))}
          <span className="absolute bottom-3 left-3 rounded-md bg-surface/90 px-2 py-1 text-xs text-ink-soft">
            Map integration pending — showing sample pins
          </span>
        </div>

        {/* Selected issue / list */}
        <div className="rounded-xl border border-border bg-surface p-4">
          {selected ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-ink-soft">#{selected.id}</span>
                <StatusBadge status={selected.status} />
              </div>
              <span className="font-semibold text-ink">{selected.title}</span>
              <span className="text-sm text-ink-soft">{selected.location.address}</span>
              <button
                onClick={() => setSelected(null)}
                className="mt-2 self-start text-sm font-medium text-primary hover:underline"
              >
                Clear selection
              </button>
            </div>
          ) : (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
                {pins.length} issue{pins.length !== 1 ? "s" : ""} nearby
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
