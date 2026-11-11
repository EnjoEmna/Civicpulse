import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  MapPin,
  Tag,
  Buildings,
  UserCheck,
  Sparkle,
  CheckCircle,
  Circle,
  WarningCircle,
  ArrowsClockwise,
  FilePdf,
  VideoCamera,
  UploadSimple,
  ArrowSquareOut,
  X,
  Crosshair,
  CopySimple,
  CaretDown,
} from "@phosphor-icons/react";
import { StatusBadge, PriorityTag } from "../components/StatusBadge";
import { api } from "../api/client";
import type {
  Complaint,
  EvidenceFile,
  OfficerDirectoryUser,
  SimilarComplaintItem,
  SimilarComplaintsResponse,
} from "../types/complaint";

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  NEEDS_INFORMATION: "Needs Information",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
  DUPLICATE_SUSPECTED: "Duplicate Suspected",
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["ASSIGNED", "NEEDS_INFORMATION", "REJECTED", "DUPLICATE_SUSPECTED"],
  ASSIGNED: ["IN_PROGRESS", "NEEDS_INFORMATION"],
  IN_PROGRESS: ["RESOLVED", "NEEDS_INFORMATION"],
  NEEDS_INFORMATION: ["UNDER_REVIEW", "ASSIGNED"],
  DUPLICATE_SUSPECTED: ["REJECTED", "UNDER_REVIEW"],
  RESOLVED: [],
  REJECTED: [],
};

function formatCategory(category?: string | null) {
  if (!category) return "General";
  return category
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ComplaintReview() {
  const { id } = useParams<{ id: string }>();
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [officers, setOfficers] = useState<OfficerDirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newStatus, setNewStatus] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [selectedOfficerId, setSelectedOfficerId] = useState<string>("");
  const [assignNote, setAssignNote] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [triageFeedback, setTriageFeedback] = useState<"ACCEPTED" | "REJECTED" | null>(null);

  const [previewEvidence, setPreviewEvidence] = useState<EvidenceFile | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  const [relatedIntel, setRelatedIntel] = useState<SimilarComplaintsResponse | null>(null);
  const [flaggingDuplicateId, setFlaggingDuplicateId] = useState<string | null>(null);
  const [duplicateActionNotice, setDuplicateActionNotice] = useState<string | null>(null);

  const [aiSummaryOpen, setAiSummaryOpen] = useState(false);
  const [hotspotsOpen, setHotspotsOpen] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);

  function syncFormFromComplaint(data: Complaint) {
    const allowed = ALLOWED_TRANSITIONS[String(data.status).toUpperCase()] ?? [];
    setNewStatus(allowed[0] ?? "");
    setSelectedOfficerId(data.assignedOfficer?.id ?? "");
  }

  async function loadComplaint() {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const [data, officerList, related] = await Promise.all([
        api.getComplaint(id),
        api.getOfficers().catch(() => []),
        api.getSimilarComplaintsAndHotspots(id, 6).catch(() => null),
      ]);
      setComplaint(data);
      setOfficers(officerList);
      setRelatedIntel(related);
      syncFormFromComplaint(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load complaint details from backend.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setAiSummaryOpen(false);
    setHotspotsOpen(false);
    setDuplicatesOpen(false);
    void loadComplaint();
  }, [id]);

  async function handleUpdate() {
    if (!complaint || !newStatus) return;

    setSaving(true);
    setActionError(null);
    setSaveSuccess(false);

    try {
      const updated = await api.updateStatus(
        complaint.id,
        newStatus,
        note,
        newStatus === "ASSIGNED" && selectedOfficerId
          ? selectedOfficerId
          : undefined,
      );
      setComplaint(updated);
      syncFormFromComplaint(updated);
      setSaveSuccess(true);
      setNote("");
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Failed to update complaint status.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAssignOfficer() {
    if (!complaint) return;

    setAssigning(true);
    setAssignError(null);
    setAssignSuccess(false);

    try {
      const updated = await api.assignOfficer(
        complaint.id,
        selectedOfficerId || null,
        assignNote,
      );
      setComplaint(updated);
      syncFormFromComplaint(updated);
      setAssignSuccess(true);
      setAssignNote("");
      setTimeout(() => setAssignSuccess(false), 3000);
    } catch (err) {
      setAssignError(
        err instanceof Error ? err.message : "Failed to assign officer.",
      );
    } finally {
      setAssigning(false);
    }
  }

  async function handleRunAiEnrichment() {
    if (!complaint) return;

    setEnriching(true);
    setEnrichError(null);

    try {
      const result = await api.enrichComplaint(complaint.id);
      setComplaint((prev) =>
        prev
          ? {
              ...prev,
              department: result.department ?? prev.department,
              priority: (result.priority?.toLowerCase() ?? prev.priority) as Complaint["priority"],
              intelligence: {
                aiCategory: result.aiCategory,
                aiPriority: result.aiPriority,
                aiSummary: result.aiSummary,
                aiConfidence: result.aiConfidence,
                aiTags: result.aiTags ?? [],
                aiMetadata: result.aiMetadata ?? null,
                enrichmentStatus: result.enrichmentStatus,
                enrichedAt: result.enrichedAt,
              },
            }
          : null,
      );
      setAiSummaryOpen(true);
    } catch (err) {
      setEnrichError(
        err instanceof Error ? err.message : "Failed to run AI analysis.",
      );
    } finally {
      setEnriching(false);
    }
  }

  async function handleTriageFeedback(action: "ACCEPTED" | "REJECTED") {
    if (!complaint || triageFeedback) return;
    setTriageFeedback(action);
    try {
      await api.submitAiFeedback({
        eventType: "TRIAGE_SUMMARY",
        action,
        complaintId: complaint.id,
        suggestedValue: complaint.intelligence?.aiCategory || complaint.category,
        finalValue: complaint.department || complaint.category,
      });
    } catch {
      setTriageFeedback(null);
    }
  }

  async function handleEvidenceUpload(fileList: FileList | null) {
    if (!complaint || !fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    setUploadingEvidence(true);
    setEvidenceError(null);

    try {
      const added = await api.uploadEvidence(complaint.id, files);
      setComplaint((prev) =>
        prev ? { ...prev, evidence: [...prev.evidence, ...added] } : null,
      );
    } catch (err) {
      setEvidenceError(
        err instanceof Error ? err.message : "Failed to upload evidence file(s).",
      );
    } finally {
      setUploadingEvidence(false);
    }
  }

  async function handleFlagAsDuplicate(sim: SimilarComplaintItem) {
    if (!complaint || flaggingDuplicateId) return;

    setFlaggingDuplicateId(sim.complaintId);
    setActionError(null);
    setDuplicateActionNotice(null);

    try {
      const currentStatus = String(complaint.status || "").toUpperCase();
      let working = complaint;

      if (currentStatus === "SUBMITTED") {
        working = await api.updateStatus(
          complaint.id,
          "UNDER_REVIEW",
          `Reviewing potential duplicate against #${sim.referenceId || sim.complaintId.slice(0, 8)}`,
        );
      }

      const targetLabel = sim.referenceId
        ? `#${sim.referenceId}`
        : sim.complaintId.slice(0, 8);
      const updated = await api.updateStatus(
        working.id,
        "DUPLICATE_SUSPECTED",
        `Flagged as possible duplicate of ${targetLabel} (${Math.round((sim.combinedScore ?? sim.similarity) * 100)}% combined match).`,
        undefined,
        sim.complaintId,
      );

      setComplaint(updated);
      syncFormFromComplaint(updated);
      setDuplicateActionNotice(`Linked as duplicate suspect referencing ${targetLabel}.`);

      void api
        .submitAiFeedback({
          eventType: "DUPLICATE_SUGGESTION",
          action: "ACCEPTED",
          complaintId: complaint.id,
          targetComplaintId: sim.complaintId,
          suggestedValue: sim.referenceId || sim.complaintId,
          finalValue: "DUPLICATE_SUSPECTED",
          metadata: {
            similarity: sim.similarity,
            combinedScore: sim.combinedScore,
            distanceMeters: sim.distanceMeters,
          },
        })
        .catch(() => {});
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Unable to flag complaint as duplicate.",
      );
    } finally {
      setFlaggingDuplicateId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <Link
            to="/officer/complaints"
            className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/50 px-3.5 py-1.5 text-xs font-semibold text-ink-soft shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md"
          >
            <ArrowLeft size={14} weight="bold" /> Back to Queue
          </Link>
        </div>
        <div className="glass-panel flex flex-col items-center justify-center gap-3 p-16 text-center text-sm text-ink-soft">
          <ArrowsClockwise size={24} className="animate-spin text-primary" />
          <p>Retrieving complaint record from backend…</p>
        </div>
      </div>
    );
  }

  if (error || !complaint) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <Link
            to="/officer/complaints"
            className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/50 px-3.5 py-1.5 text-xs font-semibold text-ink-soft shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md hover:bg-white/80 hover:text-ink"
          >
            <ArrowLeft size={14} weight="bold" /> Back to Queue
          </Link>
        </div>
        <div className="glass-panel flex flex-col gap-3 border border-rose-500/30 p-6 text-sm text-rose-800">
          <div className="flex items-center gap-2 font-bold text-rose-900">
            <WarningCircle size={20} weight="fill" />
            Unable to load complaint details
          </div>
          <p className="text-xs text-rose-700">{error || "Complaint not found."}</p>
          <button
            type="button"
            onClick={() => void loadComplaint()}
            className="self-start rounded-lg border border-white/70 bg-white/70 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const displayReferenceId = complaint.referenceId
    ? `#${complaint.referenceId}`
    : `#${complaint.id}`;

  const allowedNextStatuses =
    ALLOWED_TRANSITIONS[String(complaint.status).toUpperCase()] ?? [];
  const intel = complaint.intelligence;
  const aiSource = intel?.aiMetadata?.classificationProvenance?.source;
  const isGemini = aiSource === "gemini";

  function buildSpatialIntelUrl(
    targetHotspot?: NonNullable<SimilarComplaintsResponse["hotspots"]>[number],
  ) {
    const hotspot = targetHotspot ?? relatedIntel?.hotspots?.[0];
    const params = new URLSearchParams();
    const focusCity =
      hotspot?.city ?? complaint?.location.city ?? relatedIntel?.city ?? null;
    const focusWard =
      hotspot?.ward ??
      (complaint?.location.ward && complaint.location.ward !== "Jurisdiction Ward"
        ? complaint.location.ward
        : relatedIntel?.ward) ??
      null;
    const rawLat = hotspot?.centroid?.latitude ?? complaint?.location.lat;
    const rawLng = hotspot?.centroid?.longitude ?? complaint?.location.lng;

    if (focusCity) params.set("city", focusCity);
    if (
      typeof rawLat === "number" &&
      typeof rawLng === "number" &&
      Number.isFinite(rawLat) &&
      Number.isFinite(rawLng) &&
      (rawLat !== 0 || rawLng !== 0)
    ) {
      params.set("lat", String(rawLat));
      params.set("lng", String(rawLng));
    }
    if (hotspot?.id) params.set("hotspotId", hotspot.id);
    if (focusWard) params.set("ward", focusWard);
    if (complaint?.referenceId || complaint?.id) {
      params.set("ref", complaint.referenceId || complaint.id);
    }

    const qs = params.toString();
    return `/officer/spatial-intelligence${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          to="/officer/complaints"
          className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/50 px-3.5 py-1.5 text-xs font-semibold text-ink-soft shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md transition-all hover:bg-white/80 hover:text-ink cursor-pointer"
        >
          <ArrowLeft size={14} weight="bold" /> Back to Queue
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Main Details Section */}
        <div className="flex flex-col gap-5">
          <div className="glass-panel p-6">
            <div className="mb-3.5 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-primary-soft/60 px-2.5 py-1 font-mono text-xs font-bold text-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
                {displayReferenceId}
              </span>
              <StatusBadge status={complaint.status} />
              <PriorityTag priority={complaint.priority} />
            </div>

            <h1 className="mb-2.5 text-2xl font-bold tracking-tight text-ink">
              {complaint.title}
            </h1>
            <p className="mb-6 text-sm leading-relaxed text-ink-soft whitespace-pre-line">
              {complaint.description}
            </p>

            {/* Information Grid */}
            <div className="grid gap-3.5 border-t border-white/50 pt-5 sm:grid-cols-2">
              <div className="rounded-xl border border-white/60 bg-white/40 p-3.5 backdrop-blur-sm shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.7)]">
                <InfoRow
                  icon={MapPin}
                  label="Location, City & Ward"
                  value={(() => {
                    const baseAddr =
                      complaint.location.address || "Location address not specified";
                    const lowerAddr = baseAddr.toLowerCase();
                    const locality = [
                      complaint.location.ward &&
                      complaint.location.ward !== "Jurisdiction Ward" &&
                      !lowerAddr.includes(complaint.location.ward.toLowerCase())
                        ? complaint.location.ward
                        : null,
                      complaint.location.city &&
                      !lowerAddr.includes(complaint.location.city.toLowerCase())
                        ? complaint.location.city
                        : null,
                      complaint.location.zone &&
                      !lowerAddr.includes(complaint.location.zone.toLowerCase())
                        ? complaint.location.zone
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return locality ? `${baseAddr} (${locality})` : baseAddr;
                  })()}
                />
              </div>
              <div className="rounded-xl border border-white/60 bg-white/40 p-3.5 backdrop-blur-sm shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.7)]">
                <InfoRow
                  icon={Tag}
                  label="Category"
                  value={formatCategory(complaint.category)}
                />
              </div>
              <div className="rounded-xl border border-white/60 bg-white/40 p-3.5 backdrop-blur-sm shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.7)]">
                <InfoRow
                  icon={Buildings}
                  label="Routed Department"
                  value={complaint.department || intel?.aiMetadata?.department || "Municipal General Services"}
                />
              </div>
              <div className="rounded-xl border border-white/60 bg-white/40 p-3.5 backdrop-blur-sm shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.7)]">
                <InfoRow
                  icon={UserCheck}
                  label="Assigned Officer"
                  value={complaint.assignedOfficer?.name || "Unassigned"}
                />
              </div>
            </div>

            {/* AI Summary & Triage Pull-Down with Ambient Glow */}
            <div className="mt-5 border-t border-white/50 pt-5">
              <div
                className={`relative overflow-hidden rounded-2xl border transition-all duration-300 backdrop-blur-md ${
                  aiSummaryOpen
                    ? "border-indigo-300/90 bg-gradient-to-br from-indigo-500/[0.08] via-violet-500/[0.05] to-sky-500/[0.06] shadow-[0_10px_30px_-6px_rgba(99,102,241,0.32),0_0_20px_-4px_rgba(139,92,246,0.22),inset_0_1px_1px_rgba(255,255,255,0.92)]"
                    : "border-indigo-200/90 bg-gradient-to-r from-indigo-500/[0.08] via-violet-500/[0.06] to-sky-500/[0.08] shadow-[0_0_26px_-5px_rgba(99,102,241,0.36),0_4px_14px_-2px_rgba(79,70,229,0.14),inset_0_1px_1px_rgba(255,255,255,0.92)] hover:border-indigo-300 hover:shadow-[0_0_32px_-3px_rgba(99,102,241,0.48),inset_0_1px_1px_rgba(255,255,255,0.98)]"
                }`}
              >
                <span className="pointer-events-none -right-8 -top-8 absolute h-24 w-24 rounded-full bg-indigo-400/25 blur-2xl" />
                <span className="pointer-events-none -bottom-8 left-12 absolute h-20 w-20 rounded-full bg-violet-400/20 blur-2xl" />

                <div className="relative flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <button
                    type="button"
                    aria-expanded={aiSummaryOpen}
                    onClick={() => setAiSummaryOpen((prev) => !prev)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_0_14px_rgba(99,102,241,0.55)]">
                      <Sparkle size={16} weight="fill" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-800">
                          AI Summary &amp; Triage
                        </span>
                        {intel && (
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                              intel.enrichmentStatus === "COMPLETED"
                                ? "border-emerald-300/70 bg-emerald-500/15 text-emerald-800"
                                : intel.enrichmentStatus === "FAILED"
                                  ? "border-rose-300/70 bg-rose-500/15 text-rose-800"
                                  : "border-amber-300/70 bg-amber-500/15 text-amber-800"
                            }`}
                          >
                            {intel.enrichmentStatus}
                          </span>
                        )}
                        {intel?.aiSummary && intel.aiConfidence != null && (
                          <span className="rounded-full border border-indigo-200/80 bg-white/80 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-700">
                            {formatCategory(intel.aiCategory)} · {Math.round(intel.aiConfidence * 100)}%
                          </span>
                        )}
                      </div>

                      <p className="mt-0.5 truncate text-xs font-medium text-ink-soft">
                        {intel?.aiSummary
                          ? aiSummaryOpen
                            ? "Classification metrics, detected signals & recommended action"
                            : intel.aiSummary
                          : "Click to run or inspect AI classification, triage brief, and confidence signals."}
                      </p>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRunAiEnrichment()}
                      disabled={enriching}
                      className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/90 bg-white/85 px-3 py-1 text-[11px] font-semibold text-indigo-700 shadow-sm transition hover:bg-white disabled:opacity-60 cursor-pointer"
                    >
                      <ArrowsClockwise size={12} className={enriching ? "animate-spin" : ""} />
                      {enriching
                        ? "Analyzing…"
                        : intel?.aiSummary
                          ? "Re-run"
                          : "Run AI"}
                    </button>

                    <button
                      type="button"
                      aria-label={aiSummaryOpen ? "Collapse AI summary" : "Expand AI summary"}
                      aria-expanded={aiSummaryOpen}
                      onClick={() => setAiSummaryOpen((prev) => !prev)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-indigo-200/80 bg-white/80 text-indigo-700 transition hover:bg-white cursor-pointer"
                    >
                      <CaretDown
                        size={14}
                        weight="bold"
                        className={`transition-transform duration-200 ${
                          aiSummaryOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {enrichError && (
                  <div
                    role="alert"
                    className="mx-4 mb-3 rounded-xl border border-rose-500/30 bg-rose-500/15 px-3 py-2 text-xs font-medium text-rose-800"
                  >
                    {enrichError}
                  </div>
                )}

                <AnimatePresence initial={false}>
                  {aiSummaryOpen && (
                    <motion.div
                      key="ai-summary-drawer"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                      className="overflow-hidden border-t border-indigo-200/60"
                    >
                      <div className="p-4">
                        {intel?.aiSummary ? (
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <p className="min-w-0 flex-1 text-sm font-medium leading-relaxed text-ink">
                                {intel.aiSummary}
                              </p>
                              <span className="shrink-0 rounded-full border border-indigo-200/80 bg-white/75 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                                {isGemini ? "Gemini AI" : "Rule-based NLP"}
                              </span>
                            </div>

                            <div className="grid gap-2 text-xs sm:grid-cols-4">
                              <div className="rounded-xl border border-white/60 bg-white/55 px-3 py-2">
                                <span className="block text-[10px] font-bold uppercase text-ink-soft">
                                  AI Category
                                </span>
                                <span className="font-semibold text-ink">
                                  {formatCategory(intel.aiCategory)}
                                </span>
                              </div>
                              <div className="rounded-xl border border-white/60 bg-white/55 px-3 py-2">
                                <span className="block text-[10px] font-bold uppercase text-ink-soft">
                                  AI Priority
                                </span>
                                <span className="font-semibold text-ink">
                                  {intel.aiPriority || "MEDIUM"}
                                </span>
                              </div>
                              <div className="rounded-xl border border-white/60 bg-white/55 px-3 py-2">
                                <span className="block text-[10px] font-bold uppercase text-ink-soft">
                                  Confidence
                                </span>
                                <span className="font-mono font-bold text-indigo-700">
                                  {intel.aiConfidence != null
                                    ? `${Math.round(intel.aiConfidence * 100)}%`
                                    : "—"}
                                </span>
                              </div>
                              <div className="rounded-xl border border-white/60 bg-white/55 px-3 py-2">
                                <span className="block text-[10px] font-bold uppercase text-ink-soft">
                                  Department
                                </span>
                                <span className="block truncate font-semibold text-ink">
                                  {intel.aiMetadata?.department || complaint.department || "General"}
                                </span>
                              </div>
                            </div>

                            {intel.aiTags.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="mr-1 text-[11px] font-semibold text-ink-soft">
                                  Signals:
                                </span>
                                {intel.aiTags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded-full border border-white/70 bg-white/70 px-2.5 py-0.5 text-[11px] font-medium text-ink"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}

                            {intel.aiMetadata?.recommendedAction && (
                              <div className="rounded-xl border border-white/60 bg-white/60 px-3 py-2.5 text-xs">
                                <span className="font-bold text-indigo-800">
                                  Recommended Action:{" "}
                                </span>
                                <span className="text-ink">
                                  {intel.aiMetadata.recommendedAction}
                                </span>
                                {intel.aiMetadata.rationale && (
                                  <p className="mt-1 text-[11px] text-ink-soft">
                                    {intel.aiMetadata.rationale}
                                  </p>
                                )}
                              </div>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-indigo-200/50 pt-2.5 text-[11px]">
                              <span className="text-ink-soft">
                                Was this AI classification &amp; triage brief accurate?
                              </span>
                              {triageFeedback ? (
                                <span className="font-bold text-indigo-700">
                                  Feedback recorded ({triageFeedback.toLowerCase()})
                                </span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleTriageFeedback("ACCEPTED")}
                                    className="rounded-full border border-emerald-300 bg-emerald-500/15 px-2.5 py-0.5 font-bold text-emerald-800 hover:bg-emerald-500/25 cursor-pointer"
                                  >
                                    Accurate
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleTriageFeedback("REJECTED")}
                                    className="rounded-full border border-rose-300 bg-rose-500/15 px-2.5 py-0.5 font-bold text-rose-800 hover:bg-rose-500/25 cursor-pointer"
                                  >
                                    Needs Correction
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-ink-soft">
                            AI classification and summary not yet completed for this complaint. Click <strong>Run AI</strong> above to generate the brief.
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Attached Evidence Section */}
            <div className="mt-5 border-t border-white/50 pt-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                  Attached Evidence ({complaint.evidence.length})
                </p>

                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/70 bg-white/60 px-3 py-1 text-xs font-semibold text-primary shadow-sm transition hover:bg-white">
                  {uploadingEvidence ? (
                    <ArrowsClockwise size={13} className="animate-spin" />
                  ) : (
                    <UploadSimple size={13} weight="bold" />
                  )}
                  {uploadingEvidence ? "Uploading…" : "Add Inspection Evidence"}
                  <input
                    type="file"
                    accept="image/*,video/mp4,video/webm,application/pdf"
                    multiple
                    disabled={uploadingEvidence}
                    className="hidden"
                    onChange={(e) => {
                      void handleEvidenceUpload(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              {evidenceError && (
                <div
                  role="alert"
                  className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/15 px-3 py-2 text-xs font-medium text-rose-800"
                >
                  {evidenceError}
                </div>
              )}

              {complaint.evidence.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {complaint.evidence.map((item) => (
                    <div
                      key={item.id}
                      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/55 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md"
                    >
                      {item.type === "image" ? (
                        <button
                          type="button"
                          onClick={() => setPreviewEvidence(item)}
                          className="relative h-32 w-full overflow-hidden bg-slate-100 cursor-pointer"
                          title="View full image"
                        >
                          <img
                            src={item.url}
                            alt={item.originalName || "Complaint evidence"}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                        </button>
                      ) : item.type === "video" ? (
                        <button
                          type="button"
                          onClick={() => setPreviewEvidence(item)}
                          className="flex h-32 w-full flex-col items-center justify-center gap-1.5 bg-slate-900/5 text-primary cursor-pointer hover:bg-slate-900/10"
                        >
                          <VideoCamera size={28} weight="duotone" />
                          <span className="text-[11px] font-semibold">Play Video</span>
                        </button>
                      ) : (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-32 w-full flex-col items-center justify-center gap-1.5 bg-slate-900/5 text-rose-700 hover:bg-slate-900/10"
                        >
                          <FilePdf size={28} weight="duotone" />
                          <span className="text-[11px] font-semibold">Open PDF</span>
                        </a>
                      )}

                      <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-[11px]">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">
                            {item.originalName || "Evidence file"}
                          </p>
                          <p className="text-[10px] text-ink-soft">
                            {formatFileSize(item.fileSize)}
                          </p>
                        </div>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded-md p-1 text-primary hover:bg-blue-50"
                          title="Open in new tab"
                        >
                          <ArrowSquareOut size={14} />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-white/60 bg-white/30 px-4 py-4 text-xs text-ink-soft">
                  No photo or document evidence attached to this complaint yet.
                </p>
              )}
            </div>
          </div>

          {/* Affected Area Hotspots & Duplicate Check Pull-Downs */}
          {relatedIntel && (relatedIntel.hotspots.length > 0 || relatedIntel.similarComplaints.length > 0) && (
            <div className="flex flex-col gap-3.5">
              {relatedIntel.hotspots.length > 0 && (() => {
                const primaryHs = relatedIntel.hotspots[0];
                const hasAnyOverlap = relatedIntel.hotspots.some((h) => h.hasCrossCategoryOverlap);

                return (
                  <div className="glass-panel overflow-hidden transition-all">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                      <button
                        type="button"
                        aria-expanded={hotspotsOpen}
                        onClick={() => setHotspotsOpen((prev) => !prev)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                            hasAnyOverlap
                              ? "bg-amber-500/20 text-amber-700 shadow-[0_0_14px_rgba(245,158,11,0.28)]"
                              : "bg-blue-500/15 text-blue-700"
                          }`}
                        >
                          <Crosshair size={17} weight="duotone" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-ink">
                              Affected Area Hotspots &amp; Overlap Alerts ({relatedIntel.hotspots.length})
                            </h2>
                            {hasAnyOverlap ? (
                              <span className="rounded-full border border-amber-300 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                                Cross-Category Overlap · {primaryHs.complaintCount} complaints
                              </span>
                            ) : (
                              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                                {primaryHs.severity} · {primaryHs.complaintCount} complaints
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-ink-soft">
                            {primaryHs.title}
                            {!hotspotsOpen ? " — Click to expand hotspot details" : ""}
                          </p>
                        </div>
                      </button>

                      <div className="flex shrink-0 items-center gap-2.5">
                        <Link
                          to={buildSpatialIntelUrl()}
                          className="rounded-full border border-blue-200 bg-blue-50/80 px-3 py-1 text-xs font-bold text-primary transition hover:bg-blue-100"
                        >
                          Open Spatial Intelligence →
                        </Link>
                        <button
                          type="button"
                          aria-label={hotspotsOpen ? "Collapse area hotspots" : "Expand area hotspots"}
                          aria-expanded={hotspotsOpen}
                          onClick={() => setHotspotsOpen((prev) => !prev)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/70 bg-white/75 text-ink-soft transition hover:bg-white hover:text-ink cursor-pointer"
                        >
                          <CaretDown
                            size={14}
                            weight="bold"
                            className={`transition-transform duration-200 ${
                              hotspotsOpen ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    <AnimatePresence initial={false}>
                      {hotspotsOpen && (
                        <motion.div
                          key="hotspots-drawer"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: "easeOut" }}
                          className="overflow-hidden border-t border-white/50"
                        >
                          <div className="flex flex-col gap-3 p-5 pt-4">
                            {relatedIntel.hotspots.map((hotspot) => (
                              <div
                                key={hotspot.id}
                                className={`rounded-2xl border p-4 ${
                                  hotspot.hasCrossCategoryOverlap
                                    ? "border-amber-300/80 bg-amber-50/70"
                                    : "border-white/70 bg-white/50"
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-800">
                                        {hotspot.severity} Severity
                                      </span>
                                      {hotspot.hasCrossCategoryOverlap && (
                                        <span className="rounded-full border border-amber-300 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                                          Cross-Category Overlap
                                        </span>
                                      )}
                                      <span className="text-[11px] font-semibold text-ink-soft">
                                        {[hotspot.city, hotspot.ward].filter(Boolean).join(" · ")}
                                      </span>
                                    </div>
                                    <h3 className="mt-1 text-sm font-extrabold text-ink">
                                      {hotspot.title}
                                    </h3>
                                  </div>

                                  <div className="text-right text-xs">
                                    <span className="font-mono font-bold text-ink">
                                      {hotspot.complaintCount} complaints
                                    </span>
                                    {hotspot.distanceFromCenterMeters != null && (
                                      <p className="text-[11px] text-ink-soft">
                                        {Math.round(hotspot.distanceFromCenterMeters)}m from centroid
                                      </p>
                                    )}
                                    <Link
                                      to={buildSpatialIntelUrl(hotspot)}
                                      className="mt-1 inline-block text-[11px] font-bold text-primary hover:underline"
                                    >
                                      Focus Zone on Map →
                                    </Link>
                                  </div>
                                </div>

                                {hotspot.hasCrossCategoryOverlap && hotspot.overlapSummary && (
                                  <p className="mt-2 text-xs leading-relaxed text-amber-950">
                                    {hotspot.overlapSummary}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })()}

              {relatedIntel.similarComplaints.length > 0 && (() => {
                const topSim = relatedIntel.similarComplaints[0];
                const nearbyCount = relatedIntel.similarComplaints.filter(
                  (s) => s.distanceMeters != null && s.distanceMeters <= 500,
                ).length;

                return (
                  <div className="glass-panel overflow-hidden transition-all">
                    <button
                      type="button"
                      aria-expanded={duplicatesOpen}
                      onClick={() => setDuplicatesOpen((prev) => !prev)}
                      className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-white/25 cursor-pointer"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-700">
                          <CopySimple size={17} weight="duotone" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-ink">
                              Duplicate Check · Similar Citizen Reports ({relatedIntel.similarComplaints.length})
                            </h2>
                            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                              Top: #{topSim.referenceId || topSim.complaintId.slice(0, 8)} (
                              {Math.round((topSim.combinedScore ?? topSim.similarity) * 100)}%)
                            </span>
                            {nearbyCount > 0 && (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                {nearbyCount} nearby
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-ink-soft">
                            {duplicatesOpen
                              ? "Review related reports and link duplicates if applicable"
                              : `Click to compare ${relatedIntel.similarComplaints.length} semantically or spatially similar reports`}
                          </p>
                        </div>
                      </div>

                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/70 bg-white/75 text-ink-soft">
                        <CaretDown
                          size={14}
                          weight="bold"
                          className={`transition-transform duration-200 ${
                            duplicatesOpen ? "rotate-180" : ""
                          }`}
                        />
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {duplicatesOpen && (
                        <motion.div
                          key="duplicates-drawer"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: "easeOut" }}
                          className="overflow-hidden border-t border-white/50"
                        >
                          <div className="p-5 pt-4">
                            {duplicateActionNotice && (
                              <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50/80 px-3 py-2 text-xs font-semibold text-emerald-900">
                                <CheckCircle size={15} weight="fill" />
                                {duplicateActionNotice}
                              </div>
                            )}

                            <div className="grid gap-3 sm:grid-cols-2">
                              {relatedIntel.similarComplaints.map((sim) => {
                                const canFlag =
                                  ["SUBMITTED", "UNDER_REVIEW"].includes(
                                    String(complaint.status || "").toUpperCase(),
                                  ) && complaint.possibleDuplicateOfId !== sim.complaintId;

                                return (
                                  <article
                                    key={sim.complaintId}
                                    className="flex flex-col justify-between gap-3 rounded-2xl border border-white/70 bg-white/55 p-4"
                                  >
                                    <div>
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <Link
                                          to={`/officer/complaints/${sim.complaintId}`}
                                          className="font-mono text-xs font-bold text-primary hover:underline"
                                        >
                                          #{sim.referenceId || sim.complaintId.slice(0, 8)}
                                        </Link>
                                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                                          {Math.round((sim.combinedScore ?? sim.similarity) * 100)}% combined ({Math.round(sim.similarity * 100)}% sem)
                                        </span>
                                      </div>

                                      <h3 className="mt-1.5 text-sm font-bold text-ink">
                                        {sim.title}
                                      </h3>
                                      <p className="mt-1 line-clamp-2 text-xs text-ink-soft">
                                        {sim.aiSummary || sim.description}
                                      </p>

                                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-soft">
                                        <span>{sim.status.replace(/_/g, " ")}</span>
                                        {sim.distanceMeters != null && (
                                          <span>
                                            {sim.distanceMeters < 1000
                                              ? `${Math.round(sim.distanceMeters)} m away`
                                              : `${(sim.distanceMeters / 1000).toFixed(1)} km away`}
                                          </span>
                                        )}
                                        {(sim.city || sim.ward) && (
                                          <span>
                                            {[sim.city, sim.ward].filter(Boolean).join(" · ")}
                                          </span>
                                        )}
                                      </div>

                                      {sim.matchReasons.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                          {sim.matchReasons.map((reason) => (
                                            <span
                                              key={reason}
                                              className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium capitalize text-slate-700"
                                            >
                                              {reason}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 pt-2.5">
                                      <Link
                                        to={`/officer/complaints/${sim.complaintId}`}
                                        className="text-xs font-bold text-primary hover:underline"
                                      >
                                        Inspect report →
                                      </Link>

                                      {complaint.possibleDuplicateOfId === sim.complaintId ? (
                                        <span className="rounded-full bg-purple-100 px-2.5 py-1 text-[10px] font-bold text-purple-800">
                                          Linked Duplicate
                                        </span>
                                      ) : canFlag ? (
                                        <button
                                          type="button"
                                          disabled={flaggingDuplicateId !== null}
                                          onClick={() => void handleFlagAsDuplicate(sim)}
                                          className="rounded-xl border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-bold text-purple-800 transition hover:bg-purple-100 disabled:opacity-60 cursor-pointer"
                                        >
                                          {flaggingDuplicateId === sim.complaintId
                                            ? "Flagging…"
                                            : "Flag Duplicate"}
                                        </button>
                                      ) : null}
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Activity Timeline */}
          <div className="glass-panel p-6">
            <div className="mb-5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Persisted Activity & Resolution Timeline ({complaint.timeline.length})
                </h2>
              </div>
            </div>
            {complaint.timeline.length > 0 ? (
              <ol className="flex flex-col gap-5">
                {complaint.timeline.map((event, i) => {
                  const isLast = i === complaint.timeline.length - 1;
                  return (
                    <li key={event.id} className="relative flex gap-4 pb-1">
                      {!isLast && (
                        <span
                          className="absolute left-[11px] top-6 h-full w-[2px] bg-gradient-to-b from-blue-500/40 to-white/40"
                          aria-hidden="true"
                        />
                      )}
                      {isLast ? (
                        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/20 shadow-[0_0_10px_rgba(37,99,235,0.4)]">
                          <Circle size={14} weight="fill" className="text-blue-600" />
                        </span>
                      ) : (
                        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                          <CheckCircle size={16} weight="fill" className="text-emerald-600" />
                        </span>
                      )}
                      <div className="flex flex-1 flex-col gap-1 rounded-xl border border-white/50 bg-white/35 p-3 backdrop-blur-sm shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.6)]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <StatusBadge status={event.status} />
                          <span className="text-[11px] text-ink-soft">
                            {new Date(event.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-ink">{event.note}</span>
                        <span className="text-xs text-ink-soft">
                          Updated by <strong className="text-ink">{event.actor}</strong>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-xs text-ink-soft">No timeline events recorded.</p>
            )}
          </div>
        </div>

        {/* Action Panel Column */}
        <div className="flex flex-col gap-5">
          {/* Status Transition Panel */}
          <div className="glass-panel p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                Update Status
              </h2>
            </div>

            {saveSuccess && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/20 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 backdrop-blur-md shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.6)]">
                <CheckCircle size={16} weight="bold" /> Status & timeline persisted
              </div>
            )}

            {actionError && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/15 p-3 text-xs font-semibold text-rose-800 backdrop-blur-md">
                <WarningCircle size={16} weight="bold" className="shrink-0 mt-0.5" />
                <span>{actionError}</span>
              </div>
            )}

            {allowedNextStatuses.length > 0 ? (
              <>
                <div className="mb-3.5 flex flex-col gap-1.5">
                  <label htmlFor="status" className="text-xs font-semibold text-ink">
                    Next Workflow Status
                  </label>
                  <select
                    id="status"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="glass-input w-full px-3 py-2 text-sm font-medium cursor-pointer"
                  >
                    {allowedNextStatuses.map((statusCode) => (
                      <option key={statusCode} value={statusCode}>
                        {STATUS_LABELS[statusCode] || statusCode}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-4 flex flex-col gap-1.5">
                  <label htmlFor="note" className="text-xs font-semibold text-ink">
                    Officer Note / Remarks (persisted)
                  </label>
                  <textarea
                    id="note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="e.g. Field inspection conducted; dispatched maintenance crew"
                    className="glass-input w-full px-3 py-2 text-sm"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void handleUpdate()}
                  disabled={saving || !newStatus}
                  className="ios-btn-primary w-full py-2.5 text-sm font-semibold text-white disabled:opacity-60 cursor-pointer"
                >
                  {saving ? "Updating…" : "Update Status"}
                </button>
              </>
            ) : (
              <p className="rounded-xl border border-white/60 bg-white/40 px-3.5 py-3 text-xs font-medium text-ink-soft">
                This complaint is in terminal status (<strong>{STATUS_LABELS[complaint.status] || complaint.status}</strong>). No further workflow status transitions are permitted.
              </p>
            )}
          </div>

          {/* Officer Assignment Card */}
          <div className="glass-panel p-5">
            <div className="mb-3.5 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                Officer Assignment
              </h2>
            </div>

            {assignSuccess && (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-800">
                <CheckCircle size={15} weight="bold" /> Officer assignment saved
              </div>
            )}

            {assignError && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/15 p-2.5 text-xs font-semibold text-rose-800">
                <WarningCircle size={15} weight="bold" className="shrink-0 mt-0.5" />
                <span>{assignError}</span>
              </div>
            )}

            <div className="mb-3 flex flex-col gap-1.5">
              <label htmlFor="assignedOfficer" className="text-xs font-semibold text-ink">
                Assign to Officer
              </label>
              <select
                id="assignedOfficer"
                value={selectedOfficerId}
                onChange={(e) => setSelectedOfficerId(e.target.value)}
                className="glass-input w-full px-3 py-2 text-sm font-medium cursor-pointer"
              >
                <option value="">Unassigned</option>
                {officers.map((officer) => (
                  <option key={officer.id} value={officer.id}>
                    {officer.name} ({officer.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-3.5 flex flex-col gap-1.5">
              <label htmlFor="assignNote" className="text-xs font-semibold text-ink">
                Assignment Note (optional)
              </label>
              <input
                id="assignNote"
                type="text"
                value={assignNote}
                onChange={(e) => setAssignNote(e.target.value)}
                placeholder="e.g. Routing to field engineering team"
                className="glass-input w-full px-3 py-2 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={() => void handleAssignOfficer()}
              disabled={assigning}
              className="w-full rounded-xl border border-indigo-200 bg-indigo-600/90 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-600 disabled:opacity-60 cursor-pointer"
            >
              {assigning ? "Saving…" : "Save Assignment"}
            </button>
          </div>

          {/* Record Metadata Card */}
          <div className="glass-panel p-5">
            <div className="mb-3.5 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                Record Metadata
              </h2>
            </div>
            <div className="flex flex-col gap-3 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-white/50 bg-white/40 p-2.5">
                <span className="font-semibold text-ink-soft">Reference ID</span>
                <span className="font-mono font-bold text-primary">{displayReferenceId}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/50 bg-white/40 p-2.5">
                <span className="font-semibold text-ink-soft">City / Jurisdiction</span>
                <span className="font-medium text-ink text-right max-w-[180px] truncate">
                  {complaint.location.city || "General Jurisdiction"}
                </span>
              </div>
              {complaint.possibleDuplicateOfId && (
                <div className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50/70 p-2.5">
                  <span className="font-semibold text-purple-800">Duplicate Of</span>
                  <Link
                    to={`/officer/complaints/${complaint.possibleDuplicateOfId}`}
                    className="font-mono font-bold text-purple-700 hover:underline"
                  >
                    View primary →
                  </Link>
                </div>
              )}
              <div className="flex items-center justify-between rounded-xl border border-white/50 bg-white/40 p-2.5">
                <span className="font-semibold text-ink-soft">Department</span>
                <span className="font-medium text-ink text-right max-w-[180px] truncate">
                  {complaint.department || "Municipal General Services"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/50 bg-white/40 p-2.5">
                <span className="font-semibold text-ink-soft">Submitted On</span>
                <span className="text-ink">{new Date(complaint.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/50 bg-white/40 p-2.5">
                <span className="font-semibold text-ink-soft">Last Updated</span>
                <span className="text-ink">{new Date(complaint.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox Modal for Image/Video Evidence Preview */}
      {previewEvidence && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={() => setPreviewEvidence(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl border border-white/20 bg-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs text-white">
              <span className="truncate font-semibold">
                {previewEvidence.originalName || "Evidence Preview"}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={previewEvidence.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 hover:bg-white/20"
                >
                  Open original <ArrowSquareOut size={13} />
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewEvidence(null)}
                  className="rounded-lg p-1 hover:bg-white/20 cursor-pointer"
                  aria-label="Close preview"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex max-h-[80vh] items-center justify-center p-2">
              {previewEvidence.type === "video" ? (
                <video
                  src={previewEvidence.url}
                  controls
                  autoPlay
                  className="max-h-[75vh] max-w-full rounded-lg"
                />
              ) : (
                <img
                  src={previewEvidence.url}
                  alt={previewEvidence.originalName || "Evidence"}
                  className="max-h-[75vh] max-w-full rounded-lg object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon size={16} weight="bold" />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-[11px] font-semibold text-ink-soft">{label}</span>
        <span className="text-sm font-medium text-ink break-words">{value}</span>
      </div>
    </div>
  );
}
