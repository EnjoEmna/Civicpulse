import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MapPin,
  Funnel,
  ArrowsClockwise,
  WarningCircle,
  Images,
  GlobeHemisphereEast,
  MagnifyingGlass,
  Crosshair,
} from "@phosphor-icons/react";
import { StatusBadge, PriorityTag } from "../components/StatusBadge";
import { api } from "../api/client";
import type { Complaint } from "../types/complaint";
import type { ActiveCitiesResponse, GeocodePlaceResult } from "../types/spatial";

const DEFAULT_CENTER: [number, number] = [17.4156, 78.4357];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "UNDER_REVIEW", label: "Under Review" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "NEEDS_INFORMATION", label: "Needs Information" },
  { value: "DUPLICATE_SUSPECTED", label: "Duplicate Suspected" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "REJECTED", label: "Rejected" },
];

function getStatusPinHex(status: string): string {
  switch (status.toUpperCase()) {
    case "SUBMITTED":
    case "OPEN":
      return "#f59e0b";
    case "UNDER_REVIEW":
      return "#4f46e5";
    case "ASSIGNED":
      return "#06b6d4";
    case "IN_PROGRESS":
      return "#2563eb";
    case "NEEDS_INFORMATION":
      return "#f97316";
    case "DUPLICATE_SUSPECTED":
      return "#9333ea";
    case "RESOLVED":
      return "#10b981";
    case "REJECTED":
      return "#e11d48";
    default:
      return "#64748b";
  }
}

function createPinIcon(status: string, isSelected: boolean) {
  const fill = getStatusPinHex(status);
  const size = isSelected ? 34 : 26;
  const ring = isSelected
    ? "box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.28), 0 4px 12px rgba(15, 23, 42, 0.35);"
    : "box-shadow: 0 3px 10px rgba(15, 23, 42, 0.28);";

  return L.divIcon({
    className: "issue-map-pin",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        background: ${fill};
        border: 3px solid #ffffff;
        ${ring}
        transition: all 0.15s ease;
      "></div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

function MapViewportController({
  pins,
  selected,
  focusPoint,
}: {
  pins: Complaint[];
  selected: Complaint | null;
  focusPoint: { lat: number; lng: number; nonce: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (selected) {
      map.flyTo([selected.location.lat, selected.location.lng], 16, {
        duration: 0.45,
      });
      return;
    }

    if (focusPoint) {
      map.flyTo([focusPoint.lat, focusPoint.lng], 13, {
        duration: 0.5,
      });
      return;
    }

    if (pins.length === 0) {
      map.setView(DEFAULT_CENTER, 12);
      return;
    }

    if (pins.length === 1) {
      map.setView([pins[0].location.lat, pins[0].location.lng], 15);
      return;
    }

    const bounds = L.latLngBounds(
      pins.map((p) => [p.location.lat, p.location.lng] as [number, number]),
    );
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
  }, [map, pins, selected, focusPoint]);

  return null;
}

export default function IssueMap() {
  const [pins, setPins] = useState<Complaint[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [citiesData, setCitiesData] = useState<ActiveCitiesResponse | null>(null);

  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<GeocodePlaceResult[]>([]);
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [locating, setLocating] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{
    lat: number;
    lng: number;
    nonce: number;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSpatialCities()
      .then(setCitiesData)
      .catch(() => {});
  }, []);

  async function loadMapPins(currentStatus: string, currentCity: string) {
    setLoading(true);
    setError(null);

    try {
      const data = await api.getMapComplaints({
        status: currentStatus,
        city: currentCity !== "all" ? currentCity : undefined,
      });
      const validCoordinates = data.filter(
        (c) =>
          Number.isFinite(c.location.lat) &&
          Number.isFinite(c.location.lng) &&
          (c.location.lat !== 0 || c.location.lng !== 0),
      );
      setPins(validCoordinates);
      setSelectedId((prev) =>
        prev && validCoordinates.some((c) => c.id === prev) ? prev : null,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load geolocated complaints from backend.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMapPins(statusFilter, cityFilter);
  }, [statusFilter, cityFilter]);

  async function handlePlaceSearch(e: FormEvent) {
    e.preventDefault();
    if (!placeQuery.trim()) {
      setPlaceResults([]);
      return;
    }
    setSearchingPlace(true);
    try {
      const res = await api.geocodePlace(placeQuery.trim());
      setPlaceResults(res.results || []);
    } catch {
      setPlaceResults([]);
    } finally {
      setSearchingPlace(false);
    }
  }

  function handlePickPlace(place: GeocodePlaceResult) {
    setPlaceQuery(place.label);
    setPlaceResults([]);
    setSelectedId(null);

    const matchedActive = citiesData?.cities.find(
      (c) => c.city.toLowerCase() === String(place.city || "").toLowerCase(),
    );
    if (matchedActive) {
      setFocusPoint(null);
      setCityFilter(matchedActive.city);
    } else {
      setCityFilter("all");
      setFocusPoint({
        lat: place.latitude,
        lng: place.longitude,
        nonce: Date.now(),
      });
    }
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCityFilter("all");
        setSelectedId(null);
        setFocusPoint({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          nonce: Date.now(),
        });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError("Could not retrieve current GPS location.");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const selected = useMemo(
    () => pins.find((p) => p.id === selectedId) ?? null,
    [pins, selectedId],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Header + Status & Multi-City Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
            Geographic View
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Issue Map
          </h1>
        </div>

        <div className="relative flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <form onSubmit={(e) => void handlePlaceSearch(e)} className="flex items-center gap-1.5">
            <div className="relative">
              <MagnifyingGlass
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft"
              />
              <input
                type="text"
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                placeholder="Search city or area..."
                aria-label="Jump to city or locality"
                className="rounded-2xl border border-white/70 bg-white/55 py-1.5 pl-8 pr-3 text-xs font-medium text-ink shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md focus:outline-none w-44"
              />
            </div>
            <button
              type="submit"
              disabled={searchingPlace}
              className="rounded-2xl border border-indigo-200 bg-indigo-50/80 px-2.5 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-100 cursor-pointer"
            >
              {searchingPlace ? "..." : "Go"}
            </button>
          </form>

          {placeResults.length > 0 && (
            <div className="absolute left-0 top-10 z-[1100] w-72 overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-xl backdrop-blur-xl">
              <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto">
                {placeResults.map((place, idx) => (
                  <li key={`${place.label}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => handlePickPlace(place)}
                      className="flex w-full flex-col px-3 py-2 text-left text-xs hover:bg-blue-50/70 cursor-pointer"
                    >
                      <span className="font-semibold text-ink truncate">{place.label}</span>
                      <span className="text-[10px] text-ink-soft">{place.city}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={locating}
            className="inline-flex items-center gap-1 rounded-2xl border border-white/70 bg-white/55 px-2.5 py-1.5 text-xs font-semibold text-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md hover:bg-white cursor-pointer"
            title="Center on my location"
          >
            <Crosshair size={14} weight="bold" />
            {locating ? "Locating..." : "My Location"}
          </button>

          <div className="flex items-center gap-1.5 rounded-2xl border border-white/70 bg-white/50 px-3 py-1.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md">
            <GlobeHemisphereEast size={15} weight="bold" className="text-ink-soft" />
            <select
              value={cityFilter}
              onChange={(e) => {
                setFocusPoint(null);
                setCityFilter(e.target.value);
              }}
              className="bg-transparent text-xs font-semibold text-ink focus:outline-none cursor-pointer"
              aria-label="Filter by city"
            >
              <option value="all">All Cities</option>
              {(citiesData?.cities || []).map((c) => (
                <option key={c.city} value={c.city}>
                  {c.city} ({c.complaintCount})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/50 px-3 py-1.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md">
            <Funnel size={16} weight="bold" className="text-ink-soft" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-ink focus:outline-none cursor-pointer"
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => void loadMapPins(statusFilter, cityFilter)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-white/70 bg-white/50 px-3 py-1.5 text-xs font-semibold text-ink-soft shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md hover:bg-white/80 hover:text-ink disabled:opacity-50 cursor-pointer"
          >
            <ArrowsClockwise size={14} className={loading ? "animate-spin text-primary" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="glass-panel flex flex-col gap-3 border border-rose-500/30 p-5 text-sm text-rose-800"
        >
          <div className="flex items-center gap-2 font-bold text-rose-900">
            <WarningCircle size={20} weight="fill" />
            Unable to load issue map
          </div>
          <p className="text-xs text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => void loadMapPins(statusFilter, cityFilter)}
            className="self-start rounded-lg border border-white/70 bg-white/70 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Interactive Leaflet Map Surface */}
        <div className="glass-panel relative h-[520px] overflow-hidden">
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={13}
            scrollWheelZoom
            className="h-full w-full z-0"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapViewportController pins={pins} selected={selected} focusPoint={focusPoint} />

            {pins.map((p) => {
              const refCode = p.referenceId ?? p.id;
              return (
                <Marker
                  key={p.id}
                  position={[p.location.lat, p.location.lng]}
                  icon={createPinIcon(p.status, p.id === selectedId)}
                  eventHandlers={{
                    click: () => setSelectedId(p.id),
                  }}
                >
                  <Popup>
                    <div className="min-w-[180px] space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-primary">
                          #{refCode}
                        </span>
                        <span className="font-semibold text-slate-600">
                          {p.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="font-bold text-slate-900">{p.title}</p>
                      <p className="text-slate-600">
                        {p.location.address}
                        {p.location.city ? ` (${p.location.city})` : ""}
                      </p>
                      <Link
                        to={`/officer/complaints/${p.id}`}
                        className="inline-block font-semibold text-blue-600 hover:underline"
                      >
                        Open review →
                      </Link>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          {/* Floating Status Pill */}
          <span className="pointer-events-none absolute bottom-3.5 left-3.5 z-[1000] rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-medium text-ink shadow-[0_4px_12px_rgba(15,23,42,0.12)] backdrop-blur-md">
            {loading
              ? "Loading map coordinates…"
              : `${pins.length} mapped complaint${pins.length === 1 ? "" : "s"}`}
          </span>

          {/* Floating Legend Capsule */}
          <div className="pointer-events-none absolute right-3.5 top-3.5 z-[1000] flex flex-col gap-1.5 rounded-2xl border border-white/70 bg-white/80 p-3 text-xs shadow-[0_4px_12px_rgba(15,23,42,0.12)] backdrop-blur-md">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft/80 mb-0.5">
              Status Legend
            </span>
            <Legend color="text-amber-500" label="Submitted" />
            <Legend color="text-indigo-600" label="Under Review" />
            <Legend color="text-blue-600" label="In Progress" />
            <Legend color="text-emerald-500" label="Resolved" />
            <Legend color="text-rose-600" label="Rejected" />
          </div>
        </div>

        {/* Selected pin drawer / mapped complaint list */}
        <div className="glass-panel p-5 flex flex-col max-h-[520px]">
          {selected ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-md bg-primary-soft/60 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                  #{selected.referenceId ?? selected.id}
                </span>
                <StatusBadge status={selected.status} />
              </div>

              <h2 className="text-base font-bold text-ink">{selected.title}</h2>

              <p className="text-xs text-ink-soft leading-relaxed line-clamp-3">
                {selected.description}
              </p>

              <div className="rounded-xl border border-white/60 bg-white/40 p-3 text-xs space-y-1">
                <p className="font-semibold text-ink">{selected.location.address}</p>
                {(selected.location.city || selected.location.ward) && (
                  <p className="text-[11px] font-medium text-indigo-700">
                    {[selected.location.ward, selected.location.city].filter(Boolean).join(" · ")}
                  </p>
                )}
                <p className="font-mono text-[11px] text-ink-soft">
                  {selected.location.lat.toFixed(5)}, {selected.location.lng.toFixed(5)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <PriorityTag priority={selected.priority} />
                {selected.evidence.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-white/70 bg-white/50 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                    <Images size={13} />
                    {selected.evidence.length} file
                    {selected.evidence.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-col gap-2">
                <Link
                  to={`/officer/complaints/${selected.id}`}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:bg-primary-strong active:scale-95"
                >
                  Open full review →
                </Link>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="rounded-xl border border-white/70 bg-white/50 px-4 py-1.5 text-xs font-semibold text-ink-soft hover:bg-white/80 hover:text-ink cursor-pointer"
                >
                  Show all mapped issues
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full min-h-0">
              <div className="mb-3.5 flex items-center gap-2 shrink-0">
                <span className="h-2 w-2 rounded-full bg-blue-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                  {loading
                    ? "Loading Issues…"
                    : `${pins.length} Issue${pins.length !== 1 ? "s" : ""} on Map`}
                </h2>
              </div>

              {loading ? (
                <div className="flex flex-1 items-center justify-center gap-2 text-xs text-ink-soft py-12">
                  <ArrowsClockwise size={16} className="animate-spin text-primary" />
                  Fetching geolocated complaints…
                </div>
              ) : pins.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center py-12">
                  <MapPin size={26} weight="duotone" className="text-ink-soft/60" />
                  <p className="text-xs font-semibold text-ink">
                    No mapped complaints found
                  </p>
                  <p className="text-[11px] text-ink-soft">
                    Try changing the status filter or check back once complaints include coordinates.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
                  {pins.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/60 bg-white/40 p-3 text-left backdrop-blur-sm transition-all duration-150 hover:bg-white/70 hover:border-blue-400/50 shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.7)] cursor-pointer"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="font-mono text-[10px] font-bold text-primary">
                            #{p.referenceId ?? p.id}
                          </span>
                          <span className="truncate text-xs font-semibold text-ink">
                            {p.title}
                          </span>
                          <span className="truncate text-[11px] text-ink-soft">
                            {p.location.city ? `${p.location.city} · ` : ""}
                            {p.location.address}
                          </span>
                        </div>
                        <StatusBadge status={p.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
