import { useState } from "react";
import {
  Crosshair,
  MapPin,
  MagnifyingGlass,
  WarningCircle,
  ArrowsClockwise,
  UsersThree,
  Stack,
} from "@phosphor-icons/react";
import { api } from "../api/client";
import type {
  SpatialAnalysisResult,
  SpatialClusteringResult,
  SpatialComplaint,
} from "../types/spatial";
import SpatialMap from "../components/spatial/SpatialMap";

type AnalysisMode = "nearby" | "clusters";

const DEFAULT_LATITUDE = "10.782339";
const DEFAULT_LONGITUDE = "78.675767";

const CATEGORIES = [
  { value: "all", label: "All categories" },
  { value: "ROAD", label: "Roads" },
  { value: "WATER_SUPPLY", label: "Water supply" },
  { value: "SANITATION", label: "Sanitation" },
  { value: "STREET_LIGHT", label: "Street lighting" },
  { value: "PUBLIC_SAFETY", label: "Public safety" },
];

function formatCategory(category: string) {
  return category
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ").toLowerCase();
}

function ComplaintResult({ complaint }: { complaint: SpatialComplaint }) {
  return (
    <article className="rounded-xl border border-white/70 bg-white/55 p-4 shadow-sm backdrop-blur-md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[11px] font-bold text-primary">
            {complaint.referenceId}
          </p>
          <h3 className="mt-1 text-sm font-bold text-ink">{complaint.title}</h3>
        </div>

        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold capitalize text-blue-800">
          {formatStatus(complaint.status)}
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-soft">
        {complaint.address || "Address unavailable"}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium text-ink-soft">
        <span className="flex items-center gap-1">
          <Stack size={14} />
          {formatCategory(complaint.canonicalCategory)}
        </span>

        <span className="flex items-center gap-1">
          <MapPin size={14} />
          {complaint.distanceMeters.toFixed(2)} m away
        </span>

        {complaint.priority && (
          <span className="capitalize">
            Priority: {complaint.priority.toLowerCase()}
          </span>
        )}
      </div>
    </article>
  );
}

export default function SpatialIntelligence() {
  const [mode, setMode] = useState<AnalysisMode>("nearby");

  const [latitude, setLatitude] = useState(DEFAULT_LATITUDE);
  const [longitude, setLongitude] = useState(DEFAULT_LONGITUDE);
  const [radiusMeters, setRadiusMeters] = useState("5000");
  const [category, setCategory] = useState("all");

  const [maxResults, setMaxResults] = useState("100");
  const [clusterDistance, setClusterDistance] = useState("100");
  const [minClusterSize, setMinClusterSize] = useState("2");

  const [nearbyResult, setNearbyResult] =
    useState<SpatialAnalysisResult | null>(null);
  const [clusterResult, setClusterResult] =
    useState<SpatialClusteringResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    const lat = Number(latitude);
    const lng = Number(longitude);
    const radius = Number(radiusMeters);

    if (
      latitude.trim() === "" ||
      longitude.trim() === "" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !Number.isInteger(radius) ||
      radius < (mode === "nearby" ? 50 : 100) ||
      radius > 50000 ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      setError(
        "Enter valid coordinates and a radius within the allowed range.",
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const selectedCategory = category === "all" ? undefined : category;

      if (mode === "nearby") {
        const response = await api.analyzeSpatialArea({
          latitude: lat,
          longitude: lng,
          radiusMeters: radius,
          maxResults: Number(maxResults),
          category: selectedCategory,
        });

        setNearbyResult(response.data);
      } else {
        const response = await api.analyzeSpatialClusters({
          latitude: lat,
          longitude: lng,
          radiusMeters: radius,
          clusterDistanceMeters: Number(clusterDistance),
          minClusterSize: Number(minClusterSize),
          category: selectedCategory,
        });

        setClusterResult(response.data);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to complete spatial analysis.",
      );
    } finally {
      setLoading(false);
    }
  }

  const activeNearby = mode === "nearby" ? nearbyResult : null;
  const activeClusters = mode === "clusters" ? clusterResult : null;

  const mapCenter = activeNearby
    ? activeNearby.center
    : activeClusters
      ? activeClusters.center
      : {
          latitude: Number(latitude),
          longitude: Number(longitude),
        };

  const mapRadius = activeNearby
    ? activeNearby.radiusMeters
    : activeClusters
      ? activeClusters.radiusMeters
      : Number(radiusMeters);

  const mapComplaints = activeNearby
    ? activeNearby.complaints
    : activeClusters
      ? activeClusters.clusters.flatMap((cluster) => cluster.complaints)
      : [];

  return (
    <div className="flex flex-col gap-6">
      {/* Page heading */}
      <div className="flex flex-col gap-1">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-700">
          <Crosshair size={13} weight="bold" />
          Layer 2 · Intelligence
        </span>

        <h1 className="pt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Spatial Intelligence
        </h1>

        <p className="text-sm font-medium text-ink-soft">
          Explore nearby complaints and identify geographic concentrations.
        </p>
      </div>

      {/* Analysis mode selector */}
      <div className="glass-panel flex flex-col gap-2 p-2 sm:flex-row">
        <button
          type="button"
          onClick={() => {
            setMode("nearby");
            setError(null);
          }}
          className={`flex flex-1 items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
            mode === "nearby"
              ? "bg-primary text-white shadow-md"
              : "text-ink-soft hover:bg-white/60"
          }`}
        >
          <MagnifyingGlass size={21} weight="duotone" />
          <span>
            <span className="block text-sm font-bold">Nearby Complaints</span>
            <span
              className={`block text-[11px] ${
                mode === "nearby" ? "text-white/75" : "text-ink-soft"
              }`}
            >
              Find complaints around a location
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode("clusters");
            setError(null);
          }}
          className={`flex flex-1 items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
            mode === "clusters"
              ? "bg-primary text-white shadow-md"
              : "text-ink-soft hover:bg-white/60"
          }`}
        >
          <UsersThree size={21} weight="duotone" />
          <span>
            <span className="block text-sm font-bold">Complaint Hotspots</span>
            <span
              className={`block text-[11px] ${
                mode === "clusters" ? "text-white/75" : "text-ink-soft"
              }`}
            >
              Identify connected complaint groups
            </span>
          </span>
        </button>
      </div>

      {/* Search configuration */}
      <section className="glass-panel p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-2">
          <Crosshair size={19} className="text-primary" weight="duotone" />
          <div>
            <h2 className="text-sm font-bold text-ink">Analysis Parameters</h2>
            <p className="text-xs text-ink-soft">
              Define the geographic area and analysis criteria.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Latitude">
            <input
              type="number"
              step="any"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              className="glass-input w-full px-3 py-2.5 text-sm"
              placeholder="e.g. 10.782339"
            />
          </Field>

          <Field label="Longitude">
            <input
              type="number"
              step="any"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              className="glass-input w-full px-3 py-2.5 text-sm"
              placeholder="e.g. 78.675767"
            />
          </Field>

          <Field label="Search radius (metres)">
            <input
              type="number"
              min={mode === "nearby" ? 50 : 100}
              max={50000}
              step="1"
              value={radiusMeters}
              onChange={(e) => setRadiusMeters(e.target.value)}
              className="glass-input w-full px-3 py-2.5 text-sm"
            />
          </Field>

          <Field label="Complaint category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="glass-input w-full px-3 py-2.5 text-sm"
            >
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>

          {mode === "nearby" ? (
            <Field label="Maximum results">
              <input
                type="number"
                min="1"
                max="500"
                step="1"
                value={maxResults}
                onChange={(e) => setMaxResults(e.target.value)}
                className="glass-input w-full px-3 py-2.5 text-sm"
              />
            </Field>
          ) : (
            <>
              <Field label="Cluster distance (metres)">
                <input
                  type="number"
                  min="10"
                  max="1000"
                  step="1"
                  value={clusterDistance}
                  onChange={(e) => setClusterDistance(e.target.value)}
                  className="glass-input w-full px-3 py-2.5 text-sm"
                />
              </Field>

              <Field label="Minimum complaints per cluster">
                <input
                  type="number"
                  min="2"
                  max="100"
                  step="1"
                  value={minClusterSize}
                  onChange={(e) => setMinClusterSize(e.target.value)}
                  className="glass-input w-full px-3 py-2.5 text-sm"
                />
              </Field>
            </>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-slate-200/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-relaxed text-ink-soft">
            {mode === "nearby"
              ? "Returns complaints within the selected radius, ordered by distance."
              : "Groups complaints connected by the selected distance threshold. Isolated complaints are excluded."}
          </p>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-xs font-bold text-white shadow-md transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <ArrowsClockwise size={16} className="animate-spin" />
            ) : (
              <MagnifyingGlass size={16} weight="bold" />
            )}
            {loading ? "Analyzing..." : "Run Analysis"}
          </button>
        </div>
      </section>

      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800"
        >
          <WarningCircle size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold">Analysis failed</p>
            <p className="mt-1 text-xs leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* Geographic visualization */}
      {(activeNearby || activeClusters) && (
        <section className="flex flex-col gap-3">
          <ResultHeading
            title="Geographic Distribution"
            description={
              mode === "nearby"
                ? "Complaint locations within the selected search radius."
                : "Geographic distribution of complaints belonging to identified hotspots."
            }
          />

          <SpatialMap
            center={mapCenter}
            radiusMeters={mapRadius}
            complaints={mapComplaints}
          />

          <p className="text-[11px] text-ink-soft">
            {mapComplaints.length} complaint location(s) displayed.
          </p>
        </section>
      )}

      {/* Nearby complaints results */}
      {activeNearby && (
        <section className="flex flex-col gap-4">
          <ResultHeading
            title="Nearby Complaints"
            description={`${activeNearby.returnedCount} complaint(s) returned within ${activeNearby.radiusMeters} metres.`}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="Complaints returned"
              value={activeNearby.returnedCount}
            />
            <Metric
              label="Search radius"
              value={`${activeNearby.radiusMeters} m`}
            />
            <Metric
              label="Categories found"
              value={Object.keys(activeNearby.categoryCounts).length}
            />
          </div>

          <CategoryCounts counts={activeNearby.categoryCounts} />

          {activeNearby.complaints.length > 0 ? (
            <div className="flex flex-col gap-3">
              {activeNearby.complaints.map((complaint) => (
                <ComplaintResult key={complaint.id} complaint={complaint} />
              ))}
            </div>
          ) : (
            <EmptyState message="No complaints were found in this area." />
          )}
        </section>
      )}

      {/* Cluster results */}
      {activeClusters && (
        <section className="flex flex-col gap-4">
          <ResultHeading
            title="Complaint Hotspots"
            description={`${activeClusters.clusterCount} cluster(s) identified from ${activeClusters.totalComplaintsAnalyzed} nearby complaints.`}
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Clusters identified"
              value={activeClusters.clusterCount}
            />
            <Metric
              label="Complaints analyzed"
              value={activeClusters.totalComplaintsAnalyzed}
            />
            <Metric
              label="Clustered complaints"
              value={activeClusters.clusteredComplaintCount}
            />
            <Metric
              label="Excluded complaints"
              value={activeClusters.excludedComplaintCount}
            />
          </div>

          {activeClusters.clusters.length > 0 ? (
            <div className="flex flex-col gap-4">
              {activeClusters.clusters.map((cluster, index) => (
                <article
                  key={cluster.clusterId}
                  className="glass-panel flex flex-col gap-4 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                        Hotspot {index + 1}
                      </p>
                      <h3 className="mt-1 text-lg font-extrabold text-ink">
                        {cluster.complaintCount} complaints
                      </h3>
                    </div>

                    <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-800">
                      Cluster
                    </span>
                  </div>

                  <div className="grid gap-3 rounded-xl bg-white/50 p-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                        Centroid latitude
                      </p>
                      <p className="mt-1 font-mono text-sm font-semibold text-ink">
                        {cluster.centroid.latitude.toFixed(6)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                        Centroid longitude
                      </p>
                      <p className="mt-1 font-mono text-sm font-semibold text-ink">
                        {cluster.centroid.longitude.toFixed(6)}
                      </p>
                    </div>
                  </div>

                  <CategoryCounts counts={cluster.categoryCounts} />

                  <div className="flex flex-col gap-2">
                    <h4 className="text-xs font-bold text-ink">
                      Complaints in this cluster
                    </h4>

                    {cluster.complaints.map((complaint) => (
                      <ComplaintResult
                        key={complaint.id}
                        complaint={complaint}
                      />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState message="No clusters met the selected minimum cluster size. Try a larger radius or a smaller minimum cluster size." />
          )}
        </section>
      )}

      {/* Initial state */}
      {!activeNearby && !activeClusters && !error && (
        <div className="glass-panel flex flex-col items-center justify-center px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-700">
            <Crosshair size={28} weight="duotone" />
          </div>
          <h2 className="mt-4 text-base font-bold text-ink">
            Ready to explore your area
          </h2>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-soft">
            Configure the geographic parameters above and run an analysis to
            discover nearby complaints or identify complaint hotspots.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function ResultHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-base font-extrabold text-ink">{title}</h2>
      <p className="mt-1 text-xs text-ink-soft">{description}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass-panel p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
        {label}
      </p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-ink">
        {value}
      </p>
    </div>
  );
}

function CategoryCounts({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([category, count]) => (
        <span
          key={category}
          className="rounded-full border border-slate-200 bg-white/60 px-3 py-1.5 text-[11px] font-semibold text-ink-soft"
        >
          {formatCategory(category)} · {count}
        </span>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="glass-panel flex flex-col items-center px-6 py-10 text-center">
      <MapPin size={26} className="text-ink-soft/60" />
      <p className="mt-3 text-sm font-semibold text-ink">Nothing to display</p>
      <p className="mt-1 max-w-md text-xs text-ink-soft">{message}</p>
    </div>
  );
}
