import type { ComplaintStatus, ComplaintPriority } from "../types/complaint";

const STATUS_CONFIG: Record<
  string,
  { label: string; text: string; bg: string; border: string; glow: string }
> = {
  SUBMITTED: {
    label: "Submitted",
    text: "text-amber-800",
    bg: "bg-amber-400/20",
    border: "border-amber-400/35",
    glow: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]",
  },
  open: {
    label: "Submitted",
    text: "text-amber-800",
    bg: "bg-amber-400/20",
    border: "border-amber-400/35",
    glow: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]",
  },
  UNDER_REVIEW: {
    label: "Under Review",
    text: "text-indigo-800",
    bg: "bg-indigo-500/20",
    border: "border-indigo-400/35",
    glow: "bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.6)]",
  },
  under_review: {
    label: "Under Review",
    text: "text-indigo-800",
    bg: "bg-indigo-500/20",
    border: "border-indigo-400/35",
    glow: "bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.6)]",
  },
  ASSIGNED: {
    label: "Assigned",
    text: "text-cyan-800",
    bg: "bg-cyan-500/20",
    border: "border-cyan-400/35",
    glow: "bg-cyan-600 shadow-[0_0_8px_rgba(6,182,212,0.6)]",
  },
  assigned: {
    label: "Assigned",
    text: "text-cyan-800",
    bg: "bg-cyan-500/20",
    border: "border-cyan-400/35",
    glow: "bg-cyan-600 shadow-[0_0_8px_rgba(6,182,212,0.6)]",
  },
  IN_PROGRESS: {
    label: "In Progress",
    text: "text-blue-800",
    bg: "bg-blue-500/20",
    border: "border-blue-400/35",
    glow: "bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.6)]",
  },
  in_progress: {
    label: "In Progress",
    text: "text-blue-800",
    bg: "bg-blue-500/20",
    border: "border-blue-400/35",
    glow: "bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.6)]",
  },
  RESOLVED: {
    label: "Resolved",
    text: "text-emerald-800",
    bg: "bg-emerald-500/20",
    border: "border-emerald-400/35",
    glow: "bg-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.6)]",
  },
  resolved: {
    label: "Resolved",
    text: "text-emerald-800",
    bg: "bg-emerald-500/20",
    border: "border-emerald-400/35",
    glow: "bg-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.6)]",
  },
  REJECTED: {
    label: "Rejected",
    text: "text-rose-800",
    bg: "bg-rose-500/20",
    border: "border-rose-400/35",
    glow: "bg-rose-600 shadow-[0_0_8px_rgba(225,29,72,0.6)]",
  },
  rejected: {
    label: "Rejected",
    text: "text-rose-800",
    bg: "bg-rose-500/20",
    border: "border-rose-400/35",
    glow: "bg-rose-600 shadow-[0_0_8px_rgba(225,29,72,0.6)]",
  },
  NEEDS_INFORMATION: {
    label: "Needs Info",
    text: "text-orange-800",
    bg: "bg-orange-500/20",
    border: "border-orange-400/35",
    glow: "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]",
  },
  needs_information: {
    label: "Needs Info",
    text: "text-orange-800",
    bg: "bg-orange-500/20",
    border: "border-orange-400/35",
    glow: "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]",
  },
  DUPLICATE_SUSPECTED: {
    label: "Duplicate Suspected",
    text: "text-purple-800",
    bg: "bg-purple-500/20",
    border: "border-purple-400/35",
    glow: "bg-purple-600 shadow-[0_0_8px_rgba(147,51,234,0.6)]",
  },
  duplicate_suspected: {
    label: "Duplicate Suspected",
    text: "text-purple-800",
    bg: "bg-purple-500/20",
    border: "border-purple-400/35",
    glow: "bg-purple-600 shadow-[0_0_8px_rgba(147,51,234,0.6)]",
  },
};

export function StatusBadge({ status }: { status?: ComplaintStatus | string }) {
  const normalizedKey = status ? String(status).trim() : "";
  const directMatch = STATUS_CONFIG[normalizedKey] || STATUS_CONFIG[normalizedKey.toUpperCase()];

  const cfg =
    directMatch ??
    (normalizedKey
      ? {
          label: normalizedKey
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (c) => c.toUpperCase()),
          text: "text-slate-700",
          bg: "bg-slate-400/15",
          border: "border-slate-300/40",
          glow: "bg-slate-500 shadow-[0_0_8px_rgba(100,116,139,0.5)]",
        }
      : {
          label: "Pending",
          text: "text-slate-600",
          bg: "bg-slate-400/10",
          border: "border-slate-300/30",
          glow: "bg-slate-400",
        });

  return (
    <span
      className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold backdrop-blur-md border ${cfg.bg} ${cfg.text} ${cfg.border} shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.7)]`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${cfg.glow}`}
        aria-hidden="true"
      />
      {cfg.label}
    </span>
  );
}

const PRIORITY_CONFIG: Record<
  string,
  { label: string; text: string; bg: string; border: string }
> = {
  low: {
    label: "Low",
    text: "text-slate-600",
    bg: "bg-slate-500/10",
    border: "border-slate-300/60",
  },
  medium: {
    label: "Medium",
    text: "text-blue-700",
    bg: "bg-blue-500/15",
    border: "border-blue-300/60",
  },
  high: {
    label: "High",
    text: "text-amber-700",
    bg: "bg-amber-500/15",
    border: "border-amber-300/60",
  },
  urgent: {
    label: "Urgent",
    text: "text-rose-700",
    bg: "bg-rose-500/15",
    border: "border-rose-300/60",
  },
  critical: {
    label: "Critical",
    text: "text-rose-800",
    bg: "bg-rose-600/20",
    border: "border-rose-400/50",
  },
};

export function PriorityTag({ priority }: { priority?: ComplaintPriority | string }) {
  const key = priority ? String(priority).toLowerCase().trim() : "medium";
  const cfg = PRIORITY_CONFIG[key] ?? {
    label: key.charAt(0).toUpperCase() + key.slice(1),
    text: "text-slate-700",
    bg: "bg-slate-500/10",
    border: "border-slate-300/50",
  };

  return (
    <span
      className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-semibold backdrop-blur-md border ${cfg.bg} ${cfg.text} ${cfg.border} shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.7)]`}
    >
      {cfg.label}
    </span>
  );
}
