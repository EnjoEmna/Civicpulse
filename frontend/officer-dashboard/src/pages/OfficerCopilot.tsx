import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowsClockwise,
  ArrowUpRight,
  CaretDown,
  ChartBar,
  ChatCircleDots,
  CheckCircle,
  ClockCounterClockwise,
  Cpu,
  GlobeHemisphereEast,
  Heartbeat,
  Lightbulb,
  LinkSimple,
  ListChecks,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  Robot,
  ShareNetwork,
  ShieldCheck,
  Sparkle,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { api } from "../api/client";
import type { ActiveCitiesResponse } from "../types/spatial";
import type {
  CopilotExplainability,
  CopilotMessage,
  CopilotMetricsResponse,
  CopilotRecommendation,
  CopilotSession,
  MorningDigestResponse,
  RecommendationDecisionStatus,
} from "../types/copilot";

const STARTER_PROMPTS = [
  "Why is Road RD-HYD-1024 repeatedly receiving complaints?",
  "What needs highest priority attention today?",
  "What should be inspected before repairing RD-HYD-1024?",
  "Which wards show cross-category spatial overlaps?",
];

function renderFormattedText(text: string) {
  return text.split("\n\n").map((para, pIdx) => {
    const tokens = para.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={pIdx} className="leading-relaxed">
        {tokens.map((tok, tIdx) => {
          if (tok.startsWith("**") && tok.endsWith("**")) {
            return (
              <strong key={tIdx} className="font-bold text-ink">
                {tok.slice(2, -2)}
              </strong>
            );
          }
          return <span key={tIdx}>{tok}</span>;
        })}
      </p>
    );
  });
}

function getGradeBadgeCls(grade?: string | null) {
  switch (String(grade || "").toUpperCase()) {
    case "CRITICAL":
      return "border-rose-300 bg-rose-500/15 text-rose-800";
    case "POOR":
      return "border-amber-300 bg-amber-500/15 text-amber-900";
    case "FAIR":
      return "border-sky-300 bg-sky-500/15 text-sky-900";
    default:
      return "border-emerald-300 bg-emerald-500/15 text-emerald-800";
  }
}

function getDecisionBadgeCls(status: RecommendationDecisionStatus) {
  switch (status) {
    case "ACCEPTED":
      return "border-emerald-300 bg-emerald-500/15 text-emerald-800";
    case "MODIFIED":
      return "border-indigo-300 bg-indigo-500/15 text-indigo-800";
    case "REJECTED":
      return "border-rose-300 bg-rose-500/15 text-rose-800";
    default:
      return "border-amber-300 bg-amber-500/15 text-amber-900";
  }
}

export default function OfficerCopilot() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQueryTriggeredRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [cityFilter, setCityFilter] = useState<string>(
    searchParams.get("city") || "all",
  );
  const [citiesData, setCitiesData] = useState<ActiveCitiesResponse | null>(null);

  const [digest, setDigest] = useState<MorningDigestResponse | null>(null);
  const [metrics, setMetrics] = useState<CopilotMetricsResponse | null>(null);
  const [sessions, setSessions] = useState<CopilotSession[]>([]);
  const [activeSession, setActiveSession] = useState<CopilotSession | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);

  const [question, setQuestion] = useState("");
  const [useGemini, setUseGemini] = useState(false);

  const [digestOpen, setDigestOpen] = useState(true);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [expandedExplainability, setExpandedExplainability] = useState<
    Record<string, boolean>
  >({});

  const [modifyDrafts, setModifyDrafts] = useState<
    Record<string, { modifiedAction: string; note: string }>
  >({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSpatialCities()
      .then(setCitiesData)
      .catch(() => {});
  }, []);

  const loadWorkspaceOverview = useCallback(async () => {
    setLoadingOverview(true);
    setError(null);
    try {
      const [digestRes, sessionsRes, metricsRes] = await Promise.all([
        api.getCopilotDigest({
          city: cityFilter !== "all" ? cityFilter : undefined,
          limit: 4,
        }),
        api.listCopilotSessions({
          city: cityFilter !== "all" ? cityFilter : undefined,
          limit: 15,
        }),
        api.getCopilotMetrics(cityFilter !== "all" ? cityFilter : undefined),
      ]);
      setDigest(digestRes);
      setSessions(sessionsRes.sessions);
      setMetrics(metricsRes);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load Officer Copilot workspace.",
      );
    } finally {
      setLoadingOverview(false);
    }
  }, [cityFilter]);

  useEffect(() => {
    void loadWorkspaceOverview();
  }, [loadWorkspaceOverview]);

  const handleAsk = useCallback(
    async (
      promptText: string,
      opts?: {
        assetCode?: string | null;
        complaintId?: string | null;
        forceNewSession?: boolean;
      },
    ) => {
      const cleanQuestion = promptText.trim();
      if (cleanQuestion.length < 3 || asking) return;

      setAsking(true);
      setError(null);
      setNotice(null);

      try {
        const res = await api.askCopilot({
          question: cleanQuestion,
          sessionId: opts?.forceNewSession ? null : activeSession?.id || null,
          assetCode: opts?.assetCode || undefined,
          complaintId: opts?.complaintId || undefined,
          city: cityFilter !== "all" ? cityFilter : undefined,
          includeInferred: true,
          useGemini,
        });

        setActiveSession(res.session);
        setMessages((prev) =>
          opts?.forceNewSession
            ? [res.userMessage, res.assistantMessage]
            : [...prev, res.userMessage, res.assistantMessage],
        );
        setExpandedExplainability((prev) => ({
          ...prev,
          [res.assistantMessage.id]: true,
        }));
        setQuestion("");

        const [sessionsRes, metricsRes, digestRes] = await Promise.all([
          api.listCopilotSessions({
            city: cityFilter !== "all" ? cityFilter : undefined,
            limit: 15,
          }),
          api.getCopilotMetrics(cityFilter !== "all" ? cityFilter : undefined),
          api.getCopilotDigest({
            city: cityFilter !== "all" ? cityFilter : undefined,
            limit: 4,
          }),
        ]);
        setSessions(sessionsRes.sessions);
        setMetrics(metricsRes);
        setDigest(digestRes);

        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 120);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Copilot could not complete the investigation.",
        );
      } finally {
        setAsking(false);
      }
    },
    [activeSession?.id, asking, cityFilter, useGemini],
  );

  useEffect(() => {
    if (initialQueryTriggeredRef.current) return;
    const qParam = searchParams.get("q");
    const assetParam = searchParams.get("assetCode");
    const complaintParam = searchParams.get("complaintId");
    if (qParam || assetParam || complaintParam) {
      initialQueryTriggeredRef.current = true;
      const derivedPrompt =
        qParam ||
        (assetParam
          ? `Why is ${assetParam} repeatedly receiving complaints and what should be inspected?`
          : `Investigate complaint ${complaintParam} and linked infrastructure`);
      setDigestOpen(false);
      void handleAsk(derivedPrompt, {
        assetCode: assetParam,
        complaintId: complaintParam,
        forceNewSession: true,
      });
      setSearchParams(
        cityFilter !== "all" ? { city: cityFilter } : {},
        { replace: true },
      );
    }
  }, [cityFilter, handleAsk, searchParams, setSearchParams]);

  async function handleSelectSession(sessionId: string) {
    setLoadingSession(true);
    setError(null);
    try {
      const res = await api.getCopilotSession(sessionId);
      setActiveSession(res.session);
      setMessages(res.messages);
      const lastBot = [...res.messages].reverse().find((m) => m.role === "COPILOT");
      if (lastBot) {
        setExpandedExplainability((prev) => ({ ...prev, [lastBot.id]: true }));
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load conversation history.",
      );
    } finally {
      setLoadingSession(false);
    }
  }

  function handleStartNewSession() {
    setActiveSession(null);
    setMessages([]);
    setNotice(null);
    setError(null);
  }

  async function handleDecision(
    recommendation: CopilotRecommendation,
    decision: Exclude<RecommendationDecisionStatus, "PENDING">,
  ) {
    if (decidingId) return;
    const draft = modifyDrafts[recommendation.id];
    const modifiedAction =
      decision === "MODIFIED" ? draft?.modifiedAction?.trim() : undefined;

    if (decision === "MODIFIED" && (!modifiedAction || modifiedAction.length < 5)) {
      setError(
        "Please enter a modified action description (at least 5 characters) before saving.",
      );
      return;
    }

    setDecidingId(recommendation.id);
    setError(null);
    try {
      const note =
        decision === "MODIFIED"
          ? draft?.note?.trim()
          : noteDrafts[recommendation.id]?.trim();

      const res = await api.decideCopilotRecommendation(recommendation.id, {
        decision,
        modifiedAction: modifiedAction || null,
        decisionNote: note || null,
      });

      const updated = res.recommendation;

      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          recommendations: (m.recommendations || []).map((r) =>
            r.id === updated.id ? updated : r,
          ),
        })),
      );

      setModifyDrafts((prev) => {
        const next = { ...prev };
        delete next[recommendation.id];
        return next;
      });

      setNotice(
        `Decision recorded: "${updated.actionTitle}" marked ${updated.decisionStatus}.`,
      );

      const [digestRes, metricsRes] = await Promise.all([
        api.getCopilotDigest({
          city: cityFilter !== "all" ? cityFilter : undefined,
          limit: 4,
        }),
        api.getCopilotMetrics(cityFilter !== "all" ? cityFilter : undefined),
      ]);
      setDigest(digestRes);
      setMetrics(metricsRes);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not record recommendation decision.",
      );
    } finally {
      setDecidingId(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void handleAsk(question);
  }

  const cityOptions = (citiesData?.cities || []).map((c) => c.city);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/35 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-indigo-800">
            <Robot size={13} weight="fill" />
            Layer 6 · Officer Copilot
          </span>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
            Officer AI Command Copilot
          </h1>
          <p className="text-sm font-medium text-ink-soft">
            Morning digest, evidence-grounded multi-agent investigation, and human-confirmed actions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/75 px-3 py-1.5 shadow-sm">
            <GlobeHemisphereEast size={15} className="text-primary" />
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              aria-label="Scope Copilot by city"
              className="bg-transparent text-xs font-bold text-ink focus:outline-none cursor-pointer"
            >
              <option value="all">All Jurisdictions</option>
              {cityOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setTelemetryOpen((p) => !p)}
            aria-expanded={telemetryOpen}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              telemetryOpen
                ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                : "border-white/80 bg-white/75 text-ink-soft hover:bg-white hover:text-ink"
            }`}
          >
            <ChartBar size={14} weight="bold" className="text-primary" />
            Telemetry
            <CaretDown
              size={11}
              weight="bold"
              className={`transition-transform ${telemetryOpen ? "rotate-180" : ""}`}
            />
          </button>

          <button
            type="button"
            onClick={() => void loadWorkspaceOverview()}
            disabled={loadingOverview}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/75 px-3 py-1.5 text-xs font-bold text-ink-soft hover:bg-white hover:text-ink cursor-pointer disabled:opacity-50"
          >
            <ArrowsClockwise
              size={14}
              className={loadingOverview ? "animate-spin text-primary" : ""}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Collapsible Evaluation Telemetry Panel */}
      <AnimatePresence initial={false}>
        {telemetryOpen && metrics && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="glass-panel grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
              <MetricTile
                label="Task Success"
                value={`${metrics.taskSuccessRatePercent}%`}
                sub={`${metrics.totalOrchestrations} runs`}
                tone="emerald"
              />
              <MetricTile
                label="Tool Use Accuracy"
                value={`${metrics.toolUseAccuracyPercent}%`}
                sub={`${metrics.validToolCallsTotal}/${metrics.toolCallsTotal} valid`}
                tone="indigo"
              />
              <MetricTile
                label="Zero Hallucination"
                value={`${metrics.zeroHallucinationRunPercent}%`}
                sub={`${metrics.totalUnsupportedClaims} unsupported`}
                tone="emerald"
              />
              <MetricTile
                label="Action Acceptance"
                value={
                  metrics.recommendationLifecycle.acceptanceRatePercent != null
                    ? `${metrics.recommendationLifecycle.acceptanceRatePercent}%`
                    : `${metrics.recommendationLifecycle.pending} pending`
                }
                sub={`${metrics.recommendationLifecycle.decidedCount} decided`}
                tone="blue"
              />
              <MetricTile
                label="Copilot Sessions"
                value={String(metrics.copilotUsage.totalSessions)}
                sub={`${metrics.copilotUsage.userQueriesCount} queries`}
                tone="slate"
              />
              <MetricTile
                label="Avg Response"
                value={`${metrics.copilotUsage.avgCopilotLatencyMs || metrics.avgDurationMs} ms`}
                sub={`${metrics.registeredToolsCount} read-only tools`}
                tone="slate"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div
          role="alert"
          className="glass-panel flex items-center justify-between gap-3 border border-rose-400/40 bg-rose-50/75 p-4 text-xs text-rose-900"
        >
          <div className="flex items-center gap-2 font-semibold">
            <WarningCircle size={18} weight="fill" className="text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="rounded-lg bg-white/80 px-2.5 py-1 font-bold text-ink hover:bg-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="glass-panel flex items-center justify-between gap-3 border border-emerald-400/40 bg-emerald-50/75 px-4 py-3 text-xs text-emerald-900"
        >
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle size={17} weight="fill" className="text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="rounded-lg bg-white/80 px-2 py-0.5 font-bold text-ink hover:bg-white cursor-pointer"
          >
            Close
          </button>
        </div>
      )}

      {/* Morning Digest Section */}
      <section className="glass-panel overflow-hidden p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-rose-600 text-white shadow-sm">
              <Sparkle size={20} weight="fill" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-extrabold text-ink">
                  {digest?.greeting || "Morning Digest"} — What Needs Attention Today?
                </h2>
                {digest && (
                  <span className="rounded-full border border-rose-300 bg-rose-500/15 px-2 py-0.5 text-[10px] font-extrabold text-rose-800">
                    {digest.summary.criticalCount} Critical ·{" "}
                    {digest.summary.poorCount} Poor ·{" "}
                    {digest.summary.pendingRecommendationsCount} Pending Approvals
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-ink-soft">
                {digest?.digestSummary ||
                  "Loading deterministic infrastructure, spatial hotspot, and knowledge graph priorities..."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDigestOpen((p) => !p)}
            aria-expanded={digestOpen}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/75 px-3 py-1.5 text-xs font-bold text-ink-soft hover:bg-white hover:text-ink cursor-pointer"
          >
            <span>{digestOpen ? "Collapse Digest" : "Expand Digest"}</span>
            <CaretDown
              size={12}
              weight="bold"
              className={`transition-transform ${digestOpen ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {digestOpen && digest && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-3 border-t border-white/60 pt-4">
                {digest.priorityItems.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-white/80 bg-white/45 px-4 py-6 text-center text-xs text-ink-soft">
                    No high-risk infrastructure zones detected in this scope right now.
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {digest.priorityItems.map((item) => {
                      const upstream = item.potentialContributingAssets[0];
                      return (
                        <div
                          key={item.assetId}
                          className="flex flex-col justify-between gap-2.5 rounded-2xl border border-white/80 bg-white/65 p-3.5 shadow-2xs"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-mono text-xs font-extrabold text-primary">
                                    #{item.rank} · {item.assetCode}
                                  </span>
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${getGradeBadgeCls(
                                      item.healthGrade,
                                    )}`}
                                  >
                                    {item.healthScore}/100 · {item.healthGrade}
                                  </span>
                                </div>
                                <p className="mt-0.5 truncate text-xs font-bold text-ink">
                                  {item.name}
                                </p>
                                <p className="text-[11px] text-ink-soft">
                                  {[item.ward, item.city].filter(Boolean).join(" · ")}
                                </p>
                              </div>

                              <Link
                                to={`/officer/infrastructure-health?assetId=${encodeURIComponent(
                                  item.assetId,
                                )}`}
                                className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-ink-soft hover:text-primary"
                                title="View Infrastructure Health Breakdown"
                              >
                                <Heartbeat size={13} weight="bold" />
                              </Link>
                            </div>

                            <p className="text-[11px] leading-relaxed text-ink">
                              {item.whyItNeedsAttention}
                            </p>

                            {upstream && (
                              <div className="rounded-xl border border-amber-200/90 bg-amber-50/75 px-2.5 py-1.5 text-[11px] text-amber-950">
                                <span className="font-bold">{upstream.relationshipLabel}:</span>{" "}
                                <span className="font-mono font-bold">{upstream.assetCode}</span>{" "}
                                ({upstream.distanceMeters ?? "co-located"}m ·{" "}
                                {upstream.healthScore ?? "?"}/100)
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 pt-2">
                            <span className="text-[10px] font-semibold text-ink-soft">
                              {item.openComplaintCount} open · Maint{" "}
                              {item.maintenanceAgeMonths != null
                                ? `${item.maintenanceAgeMonths}mo`
                                : "n/a"}
                            </span>
                            <button
                              type="button"
                              disabled={asking}
                              onClick={() => {
                                setDigestOpen(false);
                                void handleAsk(item.suggestedPrompt, {
                                  assetCode: item.assetCode,
                                  forceNewSession: true,
                                });
                              }}
                              className="inline-flex items-center gap-1 rounded-xl bg-primary px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-primary-strong disabled:opacity-50 cursor-pointer"
                            >
                              <Sparkle size={12} weight="fill" />
                              Investigate in Copilot
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="text-[11px] font-medium text-amber-900/90">
                  <ShieldCheck size={13} weight="fill" className="mr-1 inline text-amber-700" />
                  {digest.nonCausalGuardrail}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Main Conversational Copilot Workspace */}
      <div className="grid gap-5 lg:grid-cols-[270px_1fr]">
        {/* Left Rail: Sessions History */}
        <aside className="glass-panel flex flex-col gap-3 p-4 self-start lg:sticky lg:top-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-ink-soft">
              <ClockCounterClockwise size={14} weight="bold" className="text-primary" />
              Investigations
            </span>
            <button
              type="button"
              onClick={handleStartNewSession}
              className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50/90 px-2.5 py-1 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100 cursor-pointer"
            >
              <Plus size={12} weight="bold" />
              New Chat
            </button>
          </div>

          {sessions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/75 bg-white/40 px-3 py-5 text-center text-xs text-ink-soft">
              No saved investigations yet. Ask Copilot a question to start a session.
            </p>
          ) : (
            <ul className="flex max-h-[460px] flex-col gap-1.5 overflow-y-auto pr-1">
              {sessions.map((s) => {
                const isActive = activeSession?.id === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => void handleSelectSession(s.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition cursor-pointer ${
                        isActive
                          ? "border-primary/60 bg-primary text-white shadow-sm"
                          : "border-white/75 bg-white/55 text-ink hover:bg-white/90"
                      }`}
                    >
                      <p className="truncate text-xs font-bold">{s.title}</p>
                      <div
                        className={`mt-1 flex items-center justify-between text-[10px] ${
                          isActive ? "text-blue-100" : "text-ink-soft"
                        }`}
                      >
                        <span className="truncate">
                          {s.city || s.targetId || "General"}
                        </span>
                        <span>{s.messageCount ?? 0} msg</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Right Main Column: Conversation + Explainability + Recommendations */}
        <section className="glass-panel flex min-h-[560px] flex-col justify-between p-4 sm:p-5">
          {/* Active Session Header */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/60 pb-3">
            <div className="flex items-center gap-2 min-w-0">
              <ChatCircleDots size={18} weight="fill" className="text-primary shrink-0" />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-extrabold text-ink">
                  {activeSession ? activeSession.title : "New Grounded Investigation"}
                </h2>
                <p className="text-[11px] text-ink-soft">
                  Backed by Layer 5 7-Agent Orchestrator · Zero-hallucination verification active
                </p>
              </div>
            </div>

            {activeSession?.targetId && (
              <span className="rounded-full border border-indigo-200 bg-indigo-50/90 px-2.5 py-0.5 font-mono text-[11px] font-bold text-indigo-800">
                Focus: {activeSession.targetId}
              </span>
            )}
          </div>

          {/* Message Feed */}
          <div className="flex-1 space-y-4 overflow-y-auto pr-1 max-h-[680px]">
            {loadingSession ? (
              <div className="flex items-center justify-center gap-2 py-16 text-xs text-ink-soft">
                <ArrowsClockwise size={16} className="animate-spin text-primary" />
                Loading Copilot investigation thread...
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
                  <Robot size={28} weight="duotone" />
                </div>
                <div className="max-w-md space-y-1">
                  <h3 className="text-base font-extrabold text-ink">
                    Ask anything about civic risks, assets, or hotspots
                  </h3>
                  <p className="text-xs text-ink-soft">
                    Copilot inspects Layer 1–4 tools deterministically, shows evidence chains, and waits for your confirmation before scheduling any action.
                  </p>
                </div>

                <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={asking}
                      onClick={() => void handleAsk(prompt)}
                      className="rounded-2xl border border-white/85 bg-white/70 px-3.5 py-2.5 text-left text-xs font-semibold text-ink shadow-2xs transition hover:border-indigo-300 hover:bg-white cursor-pointer disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                if (msg.role === "USER") {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[82%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-xs font-medium text-white shadow-sm">
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                const explain = msg.structuredPayload?.explainability;
                const followUps = msg.structuredPayload?.suggestedFollowUps || [];
                const isExplainOpen = Boolean(expandedExplainability[msg.id]);

                return (
                  <div key={msg.id} className="space-y-3">
                    <div className="rounded-2xl rounded-tl-sm border border-white/85 bg-white/80 p-4 shadow-sm space-y-3">
                      {/* Header meta */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-extrabold text-indigo-800">
                            <Sparkle size={11} weight="fill" />
                            CivicPulse Copilot
                          </span>
                          {explain?.groundingReport && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                explain.groundingReport.unsupportedClaimCount === 0
                                  ? "bg-emerald-500/15 text-emerald-800"
                                  : "bg-amber-500/15 text-amber-900"
                              }`}
                            >
                              <ShieldCheck size={11} weight="fill" />
                              {explain.groundingReport.groundedFactCount}/
                              {explain.groundingReport.checkedFactCount} facts verified ·{" "}
                              {explain.groundingReport.unsupportedClaimCount} unsupported
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[10px] font-semibold text-ink-soft">
                          <span>{msg.latencyMs} ms</span>
                          {explain && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedExplainability((prev) => ({
                                  ...prev,
                                  [msg.id]: !prev[msg.id],
                                }))
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-800 hover:bg-indigo-100 cursor-pointer"
                            >
                              {isExplainOpen ? "Hide Evidence" : "Show Evidence"}
                              <CaretDown
                                size={10}
                                weight="bold"
                                className={`transition-transform ${
                                  isExplainOpen ? "rotate-180" : ""
                                }`}
                              />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Conversational Answer */}
                      <div className="space-y-2 text-xs text-slate-800">
                        {renderFormattedText(msg.content)}
                      </div>

                      {/* Explainability Breakdown Drawer */}
                      <AnimatePresence initial={false}>
                        {isExplainOpen && explain && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <ExplainabilitySection explain={explain} />
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Action Recommendations with Human Confirmation */}
                      {msg.recommendations && msg.recommendations.length > 0 && (
                        <div className="space-y-2.5 border-t border-slate-200/70 pt-3">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-ink">
                              <ListChecks size={14} weight="bold" className="text-primary" />
                              Recommended Actions ({msg.recommendations.length}) · Officer Confirmation Required
                            </span>
                          </div>

                          <div className="space-y-2">
                            {msg.recommendations.map((rec) => {
                              const isEditingModify = modifyDrafts[rec.id] !== undefined;
                              return (
                                <div
                                  key={rec.id}
                                  className="rounded-xl border border-slate-200/80 bg-slate-50/75 p-3 space-y-2"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="space-y-0.5">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[9px] font-extrabold text-slate-800">
                                          {rec.priority}
                                        </span>
                                        {rec.isNonCausalInferred && (
                                          <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[9px] font-extrabold text-amber-900">
                                            Potential Relationship (Non-Causal)
                                          </span>
                                        )}
                                        <span className="text-[10px] font-semibold text-ink-soft">
                                          Confidence {Math.round(rec.confidence * 100)}%
                                        </span>
                                      </div>
                                      <p className="text-xs font-bold text-ink">
                                        {rec.actionTitle}
                                      </p>
                                    </div>

                                    <span
                                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold ${getDecisionBadgeCls(
                                        rec.decisionStatus,
                                      )}`}
                                    >
                                      {rec.decisionStatus}
                                    </span>
                                  </div>

                                  <p className="text-xs text-slate-700">
                                    {rec.modifiedAction || rec.proposedAction}
                                  </p>
                                  <p className="text-[11px] text-ink-soft">
                                    <strong className="text-ink">Rationale:</strong> {rec.rationale}
                                  </p>

                                  {rec.decisionNote && (
                                    <p className="rounded-lg bg-white/80 px-2.5 py-1 text-[11px] text-indigo-900">
                                      <strong>Officer note:</strong> {rec.decisionNote}
                                    </p>
                                  )}

                                  {rec.decisionStatus === "PENDING" && (
                                    <div className="space-y-2 pt-1">
                                      {isEditingModify ? (
                                        <div className="space-y-2 rounded-xl border border-indigo-200 bg-white p-2.5">
                                          <label className="block text-[10px] font-bold uppercase text-ink-soft">
                                            Modified Action Instruction
                                          </label>
                                          <textarea
                                            rows={2}
                                            value={modifyDrafts[rec.id]?.modifiedAction || ""}
                                            onChange={(e) =>
                                              setModifyDrafts((prev) => ({
                                                ...prev,
                                                [rec.id]: {
                                                  modifiedAction: e.target.value,
                                                  note: prev[rec.id]?.note || "",
                                                },
                                              }))
                                            }
                                            className="w-full rounded-lg border border-slate-200 p-2 text-xs text-ink focus:border-primary focus:outline-none"
                                          />
                                          <input
                                            type="text"
                                            value={modifyDrafts[rec.id]?.note || ""}
                                            onChange={(e) =>
                                              setModifyDrafts((prev) => ({
                                                ...prev,
                                                [rec.id]: {
                                                  modifiedAction:
                                                    prev[rec.id]?.modifiedAction || "",
                                                  note: e.target.value,
                                                },
                                              }))
                                            }
                                            placeholder="Optional field note for engineering crew..."
                                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                                          />
                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              disabled={decidingId === rec.id}
                                              onClick={() => void handleDecision(rec, "MODIFIED")}
                                              className="rounded-lg bg-indigo-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 cursor-pointer disabled:opacity-50"
                                            >
                                              Save Modified Action
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setModifyDrafts((prev) => {
                                                  const next = { ...prev };
                                                  delete next[rec.id];
                                                  return next;
                                                })
                                              }
                                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-ink-soft hover:bg-slate-100 cursor-pointer"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex flex-wrap items-center gap-2">
                                          <input
                                            type="text"
                                            value={noteDrafts[rec.id] || ""}
                                            onChange={(e) =>
                                              setNoteDrafts((prev) => ({
                                                ...prev,
                                                [rec.id]: e.target.value,
                                              }))
                                            }
                                            placeholder="Optional officer note..."
                                            className="min-w-[180px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-ink focus:border-primary focus:outline-none"
                                          />
                                          <button
                                            type="button"
                                            disabled={decidingId === rec.id}
                                            onClick={() => void handleDecision(rec, "ACCEPTED")}
                                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                                          >
                                            <CheckCircle size={13} weight="bold" />
                                            Accept
                                          </button>
                                          <button
                                            type="button"
                                            disabled={decidingId === rec.id}
                                            onClick={() =>
                                              setModifyDrafts((prev) => ({
                                                ...prev,
                                                [rec.id]: {
                                                  modifiedAction: rec.proposedAction,
                                                  note: noteDrafts[rec.id] || "",
                                                },
                                              }))
                                            }
                                            className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100 cursor-pointer"
                                          >
                                            <PencilSimple size={12} weight="bold" />
                                            Modify
                                          </button>
                                          <button
                                            type="button"
                                            disabled={decidingId === rec.id}
                                            onClick={() => void handleDecision(rec, "REJECTED")}
                                            className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100 cursor-pointer disabled:opacity-50"
                                          >
                                            <XCircle size={13} weight="bold" />
                                            Reject
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Follow-up Suggestion Chips */}
                      {followUps.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] font-bold uppercase text-ink-soft mr-1">
                            Follow up:
                          </span>
                          {followUps.map((f) => (
                            <button
                              key={f}
                              type="button"
                              disabled={asking}
                              onClick={() => void handleAsk(f)}
                              className="rounded-full border border-indigo-200 bg-indigo-50/75 px-2.5 py-1 text-[11px] font-semibold text-indigo-900 hover:bg-indigo-100 cursor-pointer disabled:opacity-50"
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {asking && (
              <div className="flex items-center gap-2 rounded-2xl border border-indigo-200/80 bg-indigo-50/80 px-4 py-3 text-xs font-semibold text-indigo-900">
                <ArrowsClockwise size={15} className="animate-spin text-primary" />
                Running 7 specialist agents across Infrastructure Health, Spatial Hotspots &amp; Knowledge Graph...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Composer */}
          <form
            onSubmit={handleSubmit}
            className="mt-4 space-y-2 border-t border-white/60 pt-3"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask Copilot (e.g., Why is Road RD-HYD-1024 repeatedly receiving complaints?)..."
                aria-label="Ask Officer Copilot"
                className="flex-1 rounded-xl border border-white/85 bg-white/85 px-3.5 py-2.5 text-xs font-medium text-ink shadow-inner placeholder:text-ink-soft/65 focus:border-primary focus:outline-none"
              />
              <button
                type="submit"
                disabled={asking || question.trim().length < 3}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-primary-strong disabled:opacity-50 cursor-pointer"
              >
                <PaperPlaneTilt size={14} weight="fill" />
                {asking ? "Investigating..." : "Ask Copilot"}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-soft">
              <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={useGemini}
                  onChange={(e) => setUseGemini(e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary"
                />
                Optional Gemini prose polish (strictly validated against tool outputs)
              </label>
              <span>Read-only tools · Human approval required for all actions</span>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "emerald" | "indigo" | "blue" | "slate";
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "indigo"
        ? "text-indigo-700"
        : tone === "blue"
          ? "text-primary"
          : "text-ink";
  return (
    <div className="rounded-xl border border-white/80 bg-white/60 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
        {label}
      </p>
      <p className={`mt-0.5 font-mono text-lg font-extrabold ${toneCls}`}>
        {value}
      </p>
      <p className="text-[10px] font-medium text-ink-soft">{sub}</p>
    </div>
  );
}

function ExplainabilitySection({ explain }: { explain: CopilotExplainability }) {
  const breakdown = explain.primaryAsset?.scoreBreakdown;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/75 p-3.5 text-xs">
      {/* Primary Asset & Penalty Breakdown */}
      {explain.primaryAsset && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Heartbeat size={14} weight="bold" className="text-emerald-700" />
              <span className="font-extrabold text-ink">
                {explain.primaryAsset.assetCode} — {explain.primaryAsset.name}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${getGradeBadgeCls(
                  explain.primaryAsset.healthGrade,
                )}`}
              >
                {explain.primaryAsset.healthScore}/100 · {explain.primaryAsset.healthGrade}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to={`/officer/infrastructure-health?assetId=${encodeURIComponent(
                  explain.primaryAsset.id,
                )}`}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
              >
                Health Monitor <ArrowUpRight size={11} />
              </Link>
              <Link
                to={`/officer/knowledge-graph?assetCode=${encodeURIComponent(
                  explain.primaryAsset.assetCode,
                )}`}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:underline"
              >
                Knowledge Graph <ShareNetwork size={11} />
              </Link>
            </div>
          </div>

          {breakdown && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ["Complaints", breakdown.complaintImpactPenalty ?? 0],
                ["Recurrence", breakdown.recurrencePenalty ?? 0],
                ["Severity", breakdown.severityPenalty ?? 0],
                ["Age", breakdown.unresolvedDurationPenalty ?? 0],
                ["Maint Lag", breakdown.maintenanceAgePenalty ?? 0],
              ].map(([k, v]) => (
                <div
                  key={String(k)}
                  className="rounded-lg border border-white bg-white/85 px-2.5 py-1.5"
                >
                  <span className="block text-[9px] font-bold uppercase text-ink-soft">
                    {k}
                  </span>
                  <span className="font-mono text-xs font-extrabold text-rose-700">
                    -{Number(v).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Potential Contributing Infrastructure (Non-Causal) */}
      {explain.potentialContributingAssets.length > 0 && (
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-900">
            <Lightbulb size={12} weight="fill" className="text-amber-600" />
            Co-Located Infrastructure Signals
          </span>
          <div className="space-y-1.5">
            {explain.potentialContributingAssets.map((up) => (
              <div
                key={up.assetCode}
                className="rounded-xl border border-amber-200 bg-amber-50/85 p-2.5 text-[11px] text-amber-950"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">
                    <span className="font-mono">{up.assetCode}</span> · {up.name}
                  </span>
                  <span className="rounded-full border border-amber-300 bg-white/75 px-2 py-0.5 text-[9px] font-extrabold">
                    {up.relationshipLabel} · Confidence {Math.round(up.confidence * 100)}%
                  </span>
                </div>
                <p className="mt-1 text-amber-900">{up.disclaimer || up.evidence}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Knowledge Graph Evidence Chains */}
      {explain.evidenceChains.length > 0 && (
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-soft">
            <LinkSimple size={12} weight="bold" className="text-indigo-700" />
            Knowledge Graph Evidence Chains ({explain.evidenceChains.length})
          </span>
          <div className="space-y-1.5">
            {explain.evidenceChains.slice(0, 3).map((chain) => (
              <div
                key={chain.id}
                className="rounded-xl border border-white bg-white/85 px-3 py-2 text-[11px]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-ink">{chain.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                      chain.isInferred
                        ? "bg-amber-100 text-amber-900"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {chain.relationshipLabel}
                  </span>
                </div>
                <p className="mt-0.5 text-ink-soft">{chain.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supporting Citizen Tickets & 7-Agent Trace */}
      <div className="grid gap-3 sm:grid-cols-2">
        {explain.supportingComplaints.length > 0 && (
          <div className="space-y-1">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-ink-soft">
              Supporting Citizen Tickets ({explain.supportingComplaints.length})
            </span>
            <ul className="space-y-1">
              {explain.supportingComplaints.slice(0, 4).map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/officer/complaints/${c.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white bg-white/85 px-2.5 py-1.5 text-[11px] hover:border-blue-300"
                  >
                    <span className="truncate font-semibold text-ink">
                      <span className="font-mono text-primary mr-1">
                        #{c.referenceId}
                      </span>
                      {c.title}
                    </span>
                    <span className="shrink-0 text-[9px] font-bold text-ink-soft">
                      {c.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {explain.stepRunsSummary.length > 0 && (
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-soft">
              <Cpu size={12} weight="bold" className="text-primary" />
              7-Agent Execution Trace
            </span>
            <div className="flex flex-wrap gap-1.5">
              {explain.stepRunsSummary.map((s) => (
                <span
                  key={s.stepOrder}
                  className="inline-flex items-center gap-1 rounded-lg border border-white bg-white/85 px-2 py-1 text-[10px] font-semibold text-ink"
                >
                  <span className="font-mono font-bold text-primary">
                    {s.stepOrder}.
                  </span>
                  {s.agentName}
                  <span className="text-ink-soft">({s.durationMs}ms)</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
