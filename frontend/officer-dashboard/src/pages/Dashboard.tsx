import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Tray,
  Clock,
  CheckCircle,
  WarningCircle,
  ArrowRight,
  ArrowsClockwise,
  Heartbeat,
  Sparkle,
} from "@phosphor-icons/react";
import { ComplaintList } from "../components/ComplaintList";
import { api } from "../api/client";
import type {
  BackgroundJobsResponse,
  Complaint,
  CurrentUserProfile,
  DashboardStats,
  Layer1MetricsResponse,
} from "../types/complaint";
import type { HotspotListResponse } from "../types/spatial";
import type { InfrastructureOverviewResponse } from "../types/infrastructure";

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.35, ease: "easeOut" as const },
  }),
};

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentComplaints, setRecentComplaints] = useState<Complaint[]>([]);
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [jobsData, setJobsData] = useState<BackgroundJobsResponse | null>(null);
  const [layer1Metrics, setLayer1Metrics] = useState<Layer1MetricsResponse | null>(null);
  const [hotspotSummary, setHotspotSummary] = useState<HotspotListResponse | null>(null);
  const [infraOverview, setInfraOverview] =
    useState<InfrastructureOverviewResponse | null>(null);
  const [runningJobs, setRunningJobs] = useState(false);
  const [jobsNotice, setJobsNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      const [
        statsRes,
        queueRes,
        profileRes,
        intelligenceJobsRes,
        metricsRes,
        hotspotsRes,
        infraRes,
      ] = await Promise.all([
        api.getDashboardStats(),
        api.getQueue({ limit: 5 }),
        api.getProfile().catch(() => null),
        api.getIntelligenceJobs(5).catch(() => null),
        api.getIntelligenceMetrics().catch(() => null),
        api.getHotspots({ status: "ACTIVE", limit: 25 }).catch(() => null),
        api.getInfrastructureHealth({ limit: 12 }).catch(() => null),
      ]);

      setStats(statsRes);
      setRecentComplaints(queueRes);
      if (profileRes?.data) {
        setProfile(profileRes.data);
      }
      setJobsData(intelligenceJobsRes);
      setLayer1Metrics(metricsRes);
      setHotspotSummary(hotspotsRes);
      setInfraOverview(infraRes);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load officer dashboard overview from backend.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function handleProcessQueue() {
    setRunningJobs(true);
    setJobsNotice(null);

    try {
      const result = await api.retryIntelligenceJobs();
      const totalProcessed = (result.backfill?.processed || 0) + (result.due?.processed || 0);
      const totalSucceeded = (result.backfill?.succeeded || 0) + (result.due?.succeeded || 0);

      setJobsNotice(
        totalProcessed > 0
          ? `Processed ${totalProcessed} background job${totalProcessed === 1 ? "" : "s"} (${totalSucceeded} succeeded).`
          : "All complaints are already enriched; no pending jobs in queue.",
      );

      const [statsRes, queueRes, updatedJobs, updatedMetrics, updatedHotspots] = await Promise.all([
        api.getDashboardStats(),
        api.getQueue({ limit: 5 }),
        api.getIntelligenceJobs(5).catch(() => null),
        api.getIntelligenceMetrics().catch(() => null),
        api.getHotspots({ status: "ACTIVE", limit: 25 }).catch(() => null),
      ]);
      setStats(statsRes);
      setRecentComplaints(queueRes);
      if (updatedJobs) setJobsData(updatedJobs);
      if (updatedMetrics) setLayer1Metrics(updatedMetrics);
      if (updatedHotspots) setHotspotSummary(updatedHotspots);
    } catch (err) {
      setJobsNotice(
        err instanceof Error ? err.message : "Failed to run background job sweep.",
      );
    } finally {
      setRunningJobs(false);
    }
  }

  const resolutionRate =
    stats && stats.total > 0
      ? Math.round((stats.resolved / stats.total) * 100)
      : 0;

  const statCards = stats
    ? [
        {
          label: "Pending Review",
          value: stats.pending,
          icon: Tray,
          iconBg: "bg-gradient-to-br from-amber-400 to-amber-600",
          glow: "shadow-[0_4px_14px_rgba(245,158,11,0.35)]",
          badge: `${stats.submitted} Submitted`,
          badgeStyle: "bg-amber-500/15 text-amber-800 border-amber-300/60",
          subtext: `+${stats.createdToday} today`,
        },
        {
          label: "In Progress",
          value: stats.activeInProgress,
          icon: Clock,
          iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
          glow: "shadow-[0_4px_14px_rgba(37,99,235,0.35)]",
          badge: "Active",
          badgeStyle: "bg-blue-500/15 text-blue-800 border-blue-300/60",
          subtext: `${stats.assigned} assigned · ${stats.inProgress} active`,
        },
        {
          label: "Resolved (30d)",
          value: stats.resolvedLast30Days,
          icon: CheckCircle,
          iconBg: "bg-gradient-to-br from-emerald-400 to-teal-600",
          glow: "shadow-[0_4px_14px_rgba(16,185,129,0.35)]",
          badge: `${resolutionRate}% overall`,
          badgeStyle: "bg-emerald-500/15 text-emerald-800 border-emerald-300/60",
          subtext: `${stats.resolved} resolved total`,
        },
        {
          label: "Overdue (>7d)",
          value: stats.overdue,
          icon: WarningCircle,
          iconBg: "bg-gradient-to-br from-rose-500 to-red-600",
          glow: "shadow-[0_4px_14px_rgba(239,68,68,0.35)]",
          badge: stats.overdue > 0 ? "Action Needed" : "On Track",
          badgeStyle:
            stats.overdue > 0
              ? "bg-rose-500/15 text-rose-800 border-rose-300/60"
              : "bg-emerald-500/15 text-emerald-800 border-emerald-300/60",
          subtext: `${stats.total} total logged`,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1 pt-1 pb-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-blue-700 backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
              Overview
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
            {getTimeGreeting()}, {profile?.name || "Officer Console"}
          </h1>
          <p className="text-sm font-medium text-ink-soft">
            Live summary of civic complaints, queue metrics, and AI triage jobs.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadDashboard()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-full border border-white/70 bg-white/50 px-3.5 py-1.5 text-xs font-semibold text-ink-soft shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md transition-colors hover:bg-white/80 hover:text-ink disabled:opacity-50 cursor-pointer sm:self-auto"
        >
          <ArrowsClockwise size={14} className={loading ? "animate-spin text-primary" : ""} />
          Refresh
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div
          role="alert"
          className="glass-panel flex flex-col gap-3 border border-rose-500/30 p-5 text-sm text-rose-800"
        >
          <div className="flex items-center gap-2 font-bold text-rose-900">
            <WarningCircle size={20} weight="fill" />
            Unable to load dashboard metrics
          </div>
          <p className="text-xs text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="self-start rounded-lg border border-white/70 bg-white/70 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Control Center Style Live Stat Tiles */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="ios-widget flex min-h-[142px] animate-pulse flex-col justify-between p-5"
            >
              <div className="flex items-center justify-between">
                <div className="h-12 w-12 rounded-2xl bg-slate-200/70" />
                <div className="h-5 w-16 rounded-full bg-slate-200/60" />
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-8 w-16 rounded-lg bg-slate-200/70" />
                <div className="h-3.5 w-24 rounded bg-slate-200/60" />
              </div>
            </div>
          ))}
        </div>
      ) : !error && stats ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {statCards.map(
            ({ label, value, icon: Icon, iconBg, glow, badge, badgeStyle, subtext }, i) => (
              <motion.div
                key={label}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={cardVariants}
                whileHover={{ scale: 1.02, y: -3 }}
                whileTap={{ scale: 0.98 }}
                className="ios-widget group flex flex-col justify-between p-5 transition-all duration-200 hover:shadow-ios-glass-hover min-h-[142px]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconBg} ${glow} text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] transition-transform duration-200 group-hover:scale-105`}
                  >
                    <Icon size={24} weight="bold" />
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border backdrop-blur-md ${badgeStyle}`}
                  >
                    {badge}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="text-3xl font-extrabold tracking-tight text-ink font-mono">
                      {value}
                    </p>
                    <span className="text-[11px] font-medium text-ink-soft/80">
                      {subtext}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs font-semibold text-ink-soft">
                    {label}
                  </p>
                </div>
              </motion.div>
            ),
          )}
        </div>
      ) : null}

      {/* AI Enrichment & Background Jobs Telemetry Strip */}
      {!loading && !error && jobsData && (
        <div className="glass-panel flex flex-col gap-3.5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-sm">
                <Sparkle size={17} weight="fill" />
              </div>
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-ink">
                  AI Enrichment & Background Queue
                </h2>
                <p className="text-[11px] text-ink-soft">
                  Auto-classification, officer triage briefs, and semantic indexing pipeline
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-300/60 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                {jobsData.stats.completed} Completed
              </span>
              <span className="rounded-full border border-amber-300/60 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                {jobsData.stats.pending + jobsData.stats.processing + jobsData.stats.retry_scheduled} Pending / Retry
              </span>
              {jobsData.stats.failed > 0 && (
                <span className="rounded-full border border-rose-300/60 bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                  {jobsData.stats.failed} Failed
                </span>
              )}

              <button
                type="button"
                onClick={() => void handleProcessQueue()}
                disabled={runningJobs}
                className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-white/75 px-3 py-1 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-white disabled:opacity-60 cursor-pointer"
              >
                <ArrowsClockwise size={13} className={runningJobs ? "animate-spin" : ""} />
                {runningJobs ? "Processing…" : "Process Queue"}
              </button>
            </div>
          </div>

          {jobsNotice && (
            <p className="rounded-xl border border-indigo-200/60 bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-900">
              {jobsNotice}
            </p>
          )}

          {(layer1Metrics || hotspotSummary) && (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-xl border border-white/70 bg-white/55 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase text-ink-soft">
                  Semantic Coverage
                </p>
                <p className="mt-1 font-mono text-base font-extrabold text-indigo-700">
                  {layer1Metrics ? `${layer1Metrics.embeddings.coveragePercent}%` : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-white/70 bg-white/55 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase text-ink-soft">
                  Avg AI Confidence
                </p>
                <p className="mt-1 font-mono text-base font-extrabold text-ink">
                  {layer1Metrics?.classification.avgConfidence != null
                    ? `${Math.round(layer1Metrics.classification.avgConfidence * 100)}%`
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-white/70 bg-white/55 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase text-ink-soft">
                  Avg Triage Latency
                </p>
                <p className="mt-1 font-mono text-base font-extrabold text-ink">
                  {layer1Metrics?.classification.avgInferenceLatencyMs != null
                    ? `${layer1Metrics.classification.avgInferenceLatencyMs} ms`
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-white/70 bg-white/55 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase text-ink-soft">
                  AI Feedback Accept
                </p>
                <p className="mt-1 font-mono text-base font-extrabold text-emerald-700">
                  {layer1Metrics?.feedback.acceptanceRatePercent != null
                    ? `${layer1Metrics.feedback.acceptanceRatePercent}%`
                    : `${layer1Metrics?.feedback.totalEvents ?? 0} events`}
                </p>
              </div>
              <Link
                to="/officer/spatial-intelligence"
                className="rounded-xl border border-blue-200/80 bg-blue-500/10 px-3 py-2.5 transition hover:bg-blue-500/20"
              >
                <p className="text-[10px] font-bold uppercase text-blue-800">
                  Active Hotspots
                </p>
                <p className="mt-1 font-mono text-base font-extrabold text-blue-900">
                  {hotspotSummary ? hotspotSummary.activeCount : "0"}
                </p>
              </Link>
              <Link
                to="/officer/spatial-intelligence"
                className={`rounded-xl border px-3 py-2.5 transition ${
                  (hotspotSummary?.crossCategoryOverlapCount ?? 0) > 0
                    ? "border-amber-300/80 bg-amber-500/15 hover:bg-amber-500/25"
                    : "border-white/70 bg-white/55 hover:bg-white/80"
                }`}
              >
                <p className="text-[10px] font-bold uppercase text-ink-soft">
                  Overlap Alerts
                </p>
                <p
                  className={`mt-1 font-mono text-base font-extrabold ${
                    (hotspotSummary?.crossCategoryOverlapCount ?? 0) > 0
                      ? "text-amber-800"
                      : "text-ink"
                  }`}
                >
                  {hotspotSummary ? hotspotSummary.crossCategoryOverlapCount : "0"}
                </p>
              </Link>
            </div>
          )}

          {jobsData.jobs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {jobsData.jobs.slice(0, 4).map((job) => (
                <Link
                  key={job.id}
                  to={`/officer/complaints/${job.complaintId}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/70 bg-white/45 px-3 py-1.5 text-[11px] transition hover:bg-white/80"
                >
                  <span className="font-mono font-bold text-primary">
                    #{job.referenceId || job.complaintId.slice(0, 8)}
                  </span>
                  <span className="max-w-[160px] truncate font-medium text-ink">
                    {job.complaintTitle || job.jobType}
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      job.status === "COMPLETED"
                        ? "bg-emerald-500/15 text-emerald-700"
                        : job.status === "FAILED"
                          ? "bg-rose-500/15 text-rose-700"
                          : "bg-amber-500/15 text-amber-700"
                    }`}
                  >
                    {job.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Compact Infrastructure Health Snapshot */}
      {!loading && !error && infraOverview && infraOverview.assets.length > 0 && (
        <div className="glass-panel flex flex-col gap-3.5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                <Heartbeat size={17} weight="fill" />
              </div>
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-ink">
                  Infrastructure Health Snapshot
                </h2>
                <p className="text-[11px] text-ink-soft">
                  Network avg{" "}
                  <strong className="font-mono text-ink">
                    {infraOverview.summary.avgHealthScore ?? "—"}/100
                  </strong>{" "}
                  · {infraOverview.summary.gradeCounts.CRITICAL} critical ·{" "}
                  {infraOverview.summary.gradeCounts.POOR} poor ·{" "}
                  {infraOverview.summary.maintenanceOverdueCount} overdue maintenance
                </p>
              </div>
            </div>

            <Link
              to="/officer/infrastructure-health"
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-white/75 px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm transition hover:bg-white"
            >
              Open Health Monitor <ArrowRight size={13} weight="bold" />
            </Link>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            {infraOverview.assets.slice(0, 3).map((asset) => {
              const badgeCls =
                asset.healthGrade === "CRITICAL"
                  ? "border-rose-300 bg-rose-500/15 text-rose-800"
                  : asset.healthGrade === "POOR"
                    ? "border-amber-300 bg-amber-500/15 text-amber-900"
                    : asset.healthGrade === "FAIR"
                      ? "border-sky-300 bg-sky-500/15 text-sky-900"
                      : "border-emerald-300 bg-emerald-500/15 text-emerald-800";

              return (
                <Link
                  key={asset.id}
                  to={`/officer/infrastructure-health?assetId=${encodeURIComponent(asset.id)}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/75 bg-white/60 px-3.5 py-2.5 transition hover:border-blue-300 hover:bg-white/90"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] font-extrabold text-primary">
                        {asset.assetCode}
                      </span>
                      <span
                        className={`rounded-full border px-1.5 py-0.5 text-[9px] font-extrabold ${badgeCls}`}
                      >
                        {asset.healthGrade}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs font-bold text-ink">
                      {asset.name}
                    </p>
                    <p className="truncate text-[10px] text-ink-soft">
                      {[asset.ward, asset.city].filter(Boolean).join(" · ")}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <span className="font-mono text-lg font-extrabold text-ink">
                      {asset.healthScore}
                    </span>
                    <span className="block text-[9px] font-semibold uppercase text-ink-soft">
                      / 100
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Complaints Section */}
      {!error && (
        <div>
          <div className="mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                Recent Complaints
              </h2>
            </div>
            <motion.div
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="inline-block"
            >
              <Link
                to="/officer/complaints"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/50 px-3 py-1 text-xs font-semibold text-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md transition-colors hover:bg-white/80"
              >
                View full queue <ArrowRight size={13} weight="bold" />
              </Link>
            </motion.div>
          </div>

          {loading ? (
            <div
              role="status"
              className="glass-panel flex items-center justify-center gap-2.5 px-6 py-12 text-sm text-ink-soft"
            >
              <ArrowsClockwise size={18} className="animate-spin text-primary" />
              Loading recent complaints from backend…
            </div>
          ) : (
            <ComplaintList complaints={recentComplaints} />
          )}
        </div>
      )}
    </div>
  );
}
