import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlass, ArrowsClockwise, Sparkle } from "@phosphor-icons/react";
import { ComplaintList, type SemanticScoreMeta } from "../components/ComplaintList";
import { ExpandableFilterBar, type ActiveFilterChip } from "../components/ExpandableFilterBar";
import { api } from "../api/client";
import type { Complaint, SemanticSearchResponse } from "../types/complaint";
import type { ActiveCitySummary } from "../types/spatial";

const STATUS_FILTERS: {
  key: string;
  label: string;
}[] = [
  { key: "all", label: "All Statuses" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "UNDER_REVIEW", label: "Under Review" },
  { key: "ASSIGNED", label: "Assigned" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "NEEDS_INFORMATION", label: "Needs Information" },
  { key: "DUPLICATE_SUSPECTED", label: "Duplicate Suspected" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "REJECTED", label: "Rejected" },
];

const CATEGORY_FILTERS: {
  key: string;
  label: string;
}[] = [
  { key: "all", label: "All Categories" },
  { key: "ROAD", label: "Roads" },
  { key: "WATER_SUPPLY", label: "Water Supply" },
  { key: "ELECTRICITY", label: "Electricity" },
  { key: "SANITATION", label: "Sanitation" },
  { key: "PUBLIC_SAFETY", label: "Public Safety" },
  { key: "OTHER", label: "Other" },
];

const PRIORITY_FILTERS = [
  { key: "all", label: "All Priorities" },
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
];

const PRIORITY_RANK: Record<string, number> = {
  critical: 4,
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export default function ComplaintQueue() {
  const [status, setStatus] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [city, setCity] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<"newest" | "priority" | "oldest">("newest");
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);

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

  const visibleComplaints = useMemo(() => {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const list = complaints.filter((c) => {
      if (
        priorityFilter !== "all" &&
        String(c.priority || "medium").toLowerCase() !== priorityFilter
      ) {
        return false;
      }
      if (overdueOnly) {
        const closed = ["RESOLVED", "REJECTED"].includes(String(c.status).toUpperCase());
        const ageMs = now - new Date(c.createdAt).getTime();
        if (closed || !Number.isFinite(ageMs) || ageMs < sevenDaysMs) return false;
      }
      return true;
    });

    if (searchMode === "semantic" && query.trim().length >= 2) {
      return list;
    }

    return [...list].sort((a, b) => {
      if (sortBy === "priority") {
        const diff =
          (PRIORITY_RANK[String(b.priority || "medium").toLowerCase()] || 2) -
          (PRIORITY_RANK[String(a.priority || "medium").toLowerCase()] || 2);
        if (diff !== 0) return diff;
      }
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sortBy === "oldest" ? ta - tb : tb - ta;
    });
  }, [complaints, priorityFilter, overdueOnly, sortBy, searchMode, query]);

  const activeFilterChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    if (status !== "all") {
      chips.push({
        key: "status",
        label: `Status: ${STATUS_FILTERS.find((s) => s.key === status)?.label || status}`,
        onRemove: () => setStatus("all"),
      });
    }
    if (priorityFilter !== "all") {
      chips.push({
        key: "priority",
        label: `Priority: ${priorityFilter.toUpperCase()}`,
        onRemove: () => setPriorityFilter("all"),
      });
    }
    if (city !== "all") {
      chips.push({
        key: "city",
        label: `City: ${city}`,
        onRemove: () => setCity("all"),
      });
    }
    if (category !== "all") {
      chips.push({
        key: "cat",
        label: `Category: ${CATEGORY_FILTERS.find((c) => c.key === category)?.label || category}`,
        onRemove: () => setCategory("all"),
      });
    }
    if (overdueOnly) {
      chips.push({
        key: "overdue",
        label: "Overdue (>7d)",
        onRemove: () => setOverdueOnly(false),
      });
    }
    if (sortBy !== "newest") {
      chips.push({
        key: "sort",
        label: `Sort: ${sortBy === "priority" ? "Highest Priority" : "Oldest First"}`,
        onRemove: () => setSortBy("newest"),
      });
    }
    return chips;
  }, [status, priorityFilter, city, category, overdueOnly, sortBy]);

  function handleResetFilters() {
    setStatus("all");
    setCategory("all");
    setCity("all");
    setPriorityFilter("all");
    setOverdueOnly(false);
    setSortBy("newest");
    setQuery("");
  }

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
          {loading
            ? "Loading complaints…"
            : `${visibleComplaints.length} complaint${visibleComplaints.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Clean Compact Search Bar + Expandable Filter Panel */}
      <ExpandableFilterBar
        isOpen={filtersOpen}
        onToggle={() => setFiltersOpen((prev) => !prev)}
        activeCount={activeFilterChips.length}
        chips={activeFilterChips}
        onResetAll={handleResetFilters}
        panelTitle="Complaint Queue Filters & Sorting"
        leading={
          <div className="relative min-w-[220px] flex-1 max-w-md">
            <MagnifyingGlass
              size={16}
              weight="bold"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/70"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                searchMode === "semantic"
                  ? 'AI Semantic search (e.g. "gaddha on sadak", "no streetlight")'
                  : "Search by reference ID, title, or description"
              }
              className="glass-input w-full py-2 pl-9 pr-3 text-xs sm:text-sm"
              aria-label="Search complaints"
            />
          </div>
        }
        trailing={
          <div className="inline-flex rounded-xl border border-indigo-200/80 bg-white/75 p-0.5">
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
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter by status"
              className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Priority
            </label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              aria-label="Filter by priority"
              className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              {PRIORITY_FILTERS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Jurisdiction (City)
            </label>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              aria-label="Filter by city"
              className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              <option value="all">All Cities</option>
              {cities.map((c) => (
                <option key={c.city} value={c.city}>
                  {c.city} ({c.complaintCount})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter by category"
              className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              {CATEGORY_FILTERS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Sort Order
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "newest" | "priority" | "oldest")}
              aria-label="Sort complaints"
              className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="priority">Highest Priority First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-slate-200/70 pt-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              className="rounded border-slate-300 text-primary"
            />
            Show Overdue Open Complaints Only (&gt; 7 days old)
          </label>
        </div>
      </ExpandableFilterBar>

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
        <ComplaintList complaints={visibleComplaints} semanticScores={semanticScores} />
      ) : null}
    </div>
  );
}
