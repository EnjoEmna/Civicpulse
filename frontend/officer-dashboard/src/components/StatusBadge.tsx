import type { ComplaintStatus, ComplaintPriority } from "../types/complaint";

const STATUS_CONFIG: Record<ComplaintStatus, { label: string; text: string; bg: string }> = {
  open: { label: "Open", text: "text-status-open", bg: "bg-status-open-bg" },
  in_progress: { label: "In Progress", text: "text-status-progress", bg: "bg-status-progress-bg" },
  resolved: { label: "Resolved", text: "text-status-resolved", bg: "bg-status-resolved-bg" },
  rejected: { label: "Rejected", text: "text-status-rejected", bg: "bg-status-rejected-bg" },
};

export function StatusBadge({ status }: { status: ComplaintStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

const PRIORITY_CONFIG: Record<ComplaintPriority, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-slate-100 text-slate-600" },
  medium: { label: "Medium", className: "bg-status-progress-bg text-status-progress" },
  high: { label: "High", className: "bg-status-open-bg text-status-open" },
  urgent: { label: "Urgent", className: "bg-status-rejected-bg text-status-rejected" },
};

export function PriorityTag({ priority }: { priority: ComplaintPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
