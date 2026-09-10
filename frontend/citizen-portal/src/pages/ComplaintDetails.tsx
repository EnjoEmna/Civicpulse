import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MapPin, User, CheckCircle, Circle } from "@phosphor-icons/react";
import { StatusBadge } from "../components/StatusBadge";
import type { Complaint } from "../types/complaint";

// TODO: replace with api.getComplaint(id) via useEffect
const MOCK: Complaint = {
  id: "CP-10482",
  title: "Large pothole near bus stop",
  description:
    "There's a deep pothole right at the bus stop on 4th Cross Rd. It fills with water when it rains and is a hazard for two-wheelers.",
  category: "roads",
  status: "in_progress",
  createdAt: "2026-09-02T10:00:00Z",
  updatedAt: "2026-09-06T14:00:00Z",
  location: { address: "4th Cross Rd, Banjara Hills", lat: 17.41, lng: 78.44 },
  evidence: [{ id: "e1", url: "", type: "image", uploadedAt: "2026-09-02T10:00:00Z" }],
  assignedOfficer: "Officer R. Naidu",
  timeline: [
    { id: "t1", status: "open", actor: "You", note: "Complaint submitted", timestamp: "2026-09-02T10:00:00Z" },
    { id: "t2", status: "open", actor: "System", note: "Assigned to Roads Dept, Ward 12", timestamp: "2026-09-02T14:00:00Z" },
    { id: "t3", status: "in_progress", actor: "Officer R. Naidu", note: "Site inspected, repair scheduled", timestamp: "2026-09-06T14:00:00Z" },
  ],
};

export default function ComplaintDetails() {
  const { id } = useParams();
  const complaint = MOCK; // TODO: fetch by id

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/complaints" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink">
        <ArrowLeft size={16} /> Back to My Complaints
      </Link>

      <div className="mb-6 rounded-xl border border-border bg-surface p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs text-ink-soft">#{id ?? complaint.id}</span>
          <StatusBadge status={complaint.status} />
        </div>
        <h1 className="mb-2 text-xl font-bold tracking-tight text-ink">{complaint.title}</h1>
        <p className="mb-4 text-sm text-ink-soft">{complaint.description}</p>

        <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <InfoRow icon={MapPin} label="Location" value={complaint.location.address} />
          <InfoRow icon={User} label="Assigned to" value={complaint.assignedOfficer ?? "Not yet assigned"} />
        </div>

        {complaint.evidence.length > 0 && (
          <div className="mt-4 flex gap-2 border-t border-border pt-4">
            {complaint.evidence.map((e) => (
              <div key={e.id} className="flex h-16 w-16 items-center justify-center rounded-md bg-bg text-xs text-ink-soft">
                Photo
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-soft">Timeline</h2>
        <ol className="flex flex-col gap-5">
          {complaint.timeline.map((event, i) => {
            const isLast = i === complaint.timeline.length - 1;
            return (
              <li key={event.id} className="relative flex gap-3 pb-1">
                {!isLast && <span className="absolute left-[9px] top-6 h-full w-px bg-border" aria-hidden="true" />}
                {isLast ? (
                  <Circle size={20} weight="fill" className="shrink-0 text-primary" />
                ) : (
                  <CheckCircle size={20} weight="fill" className="shrink-0 text-status-resolved" />
                )}
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-ink">{event.note}</span>
                  <span className="text-xs text-ink-soft">
                    {event.actor} · {new Date(event.timestamp).toLocaleString()}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={16} className="mt-0.5 shrink-0 text-primary" />
      <div className="flex flex-col">
        <span className="text-xs text-ink-soft">{label}</span>
        <span className="text-sm text-ink">{value}</span>
      </div>
    </div>
  );
}
