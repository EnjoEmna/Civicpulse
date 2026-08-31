import type { ComplaintStatus } from "../types/complaint";

const STYLES: Record<ComplaintStatus, string> = {
  submitted: "bg-amber-100 text-amber-800",
  in_review: "bg-sky-100 text-sky-800",
  in_progress: "bg-indigo-100 text-indigo-800",
  resolved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};

const LABELS: Record<ComplaintStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  in_progress: "In progress",
  resolved: "Resolved",
  rejected: "Rejected",
};

export default function StatusBadge({ status }: { status: ComplaintStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
