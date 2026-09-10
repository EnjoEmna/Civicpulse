import type { ComplaintStatus } from "../types/complaint";

const STATUS_CONFIG: Record<ComplaintStatus, { label: string; text: string; bg: string }> = {
  open: { label: "Open", text: "text-status-open", bg: "bg-status-open-bg" },
  in_progress: { label: "In Progress", text: "text-status-progress", bg: "bg-status-progress-bg" },
  resolved: { label: "Resolved", text: "text-status-resolved", bg: "bg-status-resolved-bg" },
  rejected: { label: "Rejected", text: "text-status-rejected", bg: "bg-status-rejected-bg" },
};

export function StatusBadge({ status }: { status: ComplaintStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.bg} ${cfg.text}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {cfg.label}
    </span>
  );
}
