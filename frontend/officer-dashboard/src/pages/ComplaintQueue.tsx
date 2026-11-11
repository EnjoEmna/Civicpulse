import { useEffect, useState } from "react";
import { MagnifyingGlass, ArrowsClockwise, Sparkle } from "@phosphor-icons/react";
import { ComplaintList, type SemanticScoreMeta } from "../components/ComplaintList";
import { api } from "../api/client";
import type { Complaint, SemanticSearchResponse } from "../types/complaint";
import type { ActiveCitySummary } from "../types/spatial";

const STATUS_FILTERS: {
  key: string;
  label: string;
}[] = [
  { key: "all", label: "All" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "UNDER_REVIEW", label: "Under Review" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "REJECTED", label: "Rejected" },
];

const CATEGORY_FILTERS: {
  key: string;
  label: string;
}[] = [
  { key: "all", label: "All categories" },
  { key: "ROAD", label: "Roads" },
  { key: "WATER_SUPPLY", label: "Water Supply" },
  { key: "ELECTRICITY", label: "Electricity" },
  { key: "SANITATION", label: "Sanitation" },
  { key: "PUBLIC_SAFETY", label: "Public Safety" },
  { key: "OTHER", label: "Other" },
];

export default function ComplaintQueue() {
  const [status, setStatus] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [city, setCity] = useState<string>("all");
  const [cities, setCities] = useState<ActiveCitySummary[]>([]);
  const [searchMode, setSearchMode] = useState<"keyword" | "semantic">("keyword");
  const [query, setQuery] = useState("");
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [semanticMeta, setSemanticMeta] = useState<SemanticSearchResponse | null>(null);
  const [semanticScores, setSemanticScores] = useState<
    Record<string, SemanticScoreMeta> | undefined
  >(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSpatialCities()
      .then((res) => setCities(res.cities || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(
      async () => {
        setLoading(true);
        setError(null);

        try {
          const trimmedQuery = query.trim();
          if (searchMode === "semantic" && trimmedQuery.length >= 2) {
            const sem = await api.semanticSearchComplaints({
              query: trimmedQuery,
              status: status !== "all" ? status : undefined,
              category: category !== "all" ? category : undefined,
              city: city !== "all" ? city : undefined,
              limit: 25,
            });

            if (cancelled) return;

            const mapped: Complaint[] = sem.results.map((r) => ({
              id: r.id,
              referenceId: r.referenceId ?? undefined,
              title: r.title,
              description: r.description,
              category: r.category as Complaint["category"],
              department: r.department ?? null,
              status: r.status,
              priority: String(r.priority || "medium").toLowerCase(),
              createdAt: r.createdAt,
              updatedAt: r.createdAt,
              location: {
                address: r.address || "Address not provided",
                city: r.city ?? null,
                ward: r.ward || "Jurisdiction Ward",
                zone: r.zone ?? null,
                lat: r.latitude ?? 0,
                lng: r.longitude ?? 0,
              },
              evidence: [],
              timeline: [],
            }));

            const scores: Record<string, SemanticScoreMeta> = {};
            for (const item of sem.results) {
              scores[item.id] = {
                score: item.relevanceScore,
                matchType: item.matchType,
                matchedConcepts: item.matchedConcepts || [],
              };
            }

            setSemanticMeta(sem);
            setSemanticScores(scores);
            setComplaints(mapped);
          } else {
            const results = await api.getQueue({
              status,
              category,
              city,
              query: trimmedQuery,
            });

            if (!cancelled) {
              setSemanticMeta(null);
              setSemanticScores(undefined);
              setComplaints(results);
            }
          }
        } catch (err) {
          if (!cancelled) {
            setError(
              err instanceof Error ? err.message : "Unable to load complaints from backend.",
            );
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      },
      query.trim() ? 300 : 0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [status, category, city, query, searchMode]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
            Queue Management
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Complaint Queue
          </h1>
        </div>

        <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-white/70 bg-white/50 px-3 py-1 text-xs font-semibold text-ink-soft shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md sm:self-auto">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          {loading ? "Loading complaints…" : `${complaints.length} complaint${complaints.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Status Segmented Filter Bar */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex min-w-full items-center rounded-2xl border border-white/70 bg-black/[0.04] p-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-xl sm:min-w-0">
          {STATUS_FILTERS.map((filter) => {
            const isActive = status === filter.key;

            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setStatus(filter.key)}
                className={`flex-1 whitespace-nowrap rounded-xl px-4 py-1.5 text-xs font-semibold transition-all duration-200 sm:flex-initial cursor-pointer ${
                  isActive
                    ? "scale-[1.02] bg-white text-ink shadow-[0_2px_8px_rgba(0,0,0,0.08),inset_0_1px_1px_rgba(255,255,255,0.9)]"
                    : "text-ink-soft hover:bg-white/30 hover:text-ink"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-panel flex flex-col gap-3 p-3.5 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <MagnifyingGlass
            size={17}
            weight="bold"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft/70"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              searchMode === "semantic"
                ? 'AI Semantic search (e.g. "gaddha on sadak", "no streetlight near school")'
                : "Search by reference ID, title, or description"
            }
            className="glass-input w-full py-2.5 pl-10 pr-4 text-sm"
            aria-label="Search complaints"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-indigo-200/80 bg-white/70 p-0.5">
            <button
              type="button"
              onClick={() => setSearchMode("keyword")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                searchMode === "keyword"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              Keyword
            </button>
            <button
              type="button"
              onClick={() => setSearchMode("semantic")}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                searchMode === "semantic"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-indigo-700 hover:bg-indigo-50"
              }`}
            >
              <Sparkle size={12} weight="fill" />
              AI Semantic
            </button>
          </div>

          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="glass-input px-3 py-2.5 text-sm font-medium cursor-pointer"
            aria-label="Filter by city"
          >
            <option value="all">All cities</option>
            {cities.map((c) => (
              <option key={c.city} value={c.city}>
                {c.city} ({c.complaintCount})
              </option>
            ))}
          </select>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="glass-input px-3.5 py-2.5 text-sm font-medium cursor-pointer"
            aria-label="Filter by category"
          >
            {CATEGORY_FILTERS.map((filter) => (
              <option key={filter.key} value={filter.key}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Semantic Query Understanding Metadata Strip */}
      {semanticMeta && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-200/80 bg-indigo-50/70 px-4 py-2.5 text-xs text-indigo-900">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 font-bold">
              <Sparkle size={14} weight="fill" className="text-indigo-600" />
              AI Query Understanding:
            </span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold">
              lang: {semanticMeta.languageHint}
            </span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold">
              normalized: &ldquo;{semanticMeta.normalizedQuery}&rdquo;
            </span>
            {semanticMeta.detectedConcepts.map((concept) => (
              <span
                key={concept}
                className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-700"
              >
                {concept}
              </span>
            ))}
          </div>
          <span className="text-[11px] font-medium text-indigo-700">
            engine: {semanticMeta.embeddingSource}
          </span>
        </div>
      )}

      {/* API Error State */}
      {error && (
        <div
          role="alert"
          className="glass-panel flex flex-col gap-3 border border-rose-500/30 p-5 text-sm text-rose-800"
        >
          <p className="font-semibold">Couldn't load the complaint queue.</p>
          <p className="text-xs text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setLoading(true);
              api
                .getQueue({ status, category, city, query })
                .then(setComplaints)
                .catch((err: unknown) => {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Unable to load complaints.",
                  );
                })
                .finally(() => setLoading(false));
            }}
            className="self-start rounded-lg border border-white/70 bg-white/70 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div
          role="status"
          className="glass-panel flex items-center justify-center gap-2.5 px-6 py-14 text-sm text-ink-soft"
        >
          <ArrowsClockwise size={18} className="animate-spin text-primary" />
          {searchMode === "semantic" && query.trim().length >= 2
            ? "Running AI semantic vector search…"
            : "Loading complaints from CivicPulse…"}
        </div>
      ) : !error ? (
        <ComplaintList complaints={complaints} semanticScores={semanticScores} />
      ) : null}
    </div>
  );
}
