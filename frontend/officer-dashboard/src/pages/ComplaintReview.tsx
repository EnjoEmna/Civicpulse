import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MapPin, User, Phone, CheckCircle, Circle } from "@phosphor-icons/react";
import { StatusBadge, PriorityTag } from "../components/StatusBadge";
import type { Complaint, ComplaintStatus } from "../types/complaint";

// TODO: replace with api.getComplaint(id) via useEffect
const MOCK: Complaint = {
  id: "CP-10482",
  title: "Large pothole near bus stop",
  description:
    "There's a deep pothole right at the bus stop on 4th Cross Rd. It fills with water when it rains and is a hazard for two-wheelers.",
  category: "roads",
  status: "in_progress",
  priority: "high",
  createdAt: "2026-09-02T10:00:00Z",
  updatedAt: "2026-09-06T14:00:00Z",
  citizenName: "Aditi Rao",
  location: { address: "4th Cross Rd, Banjara Hills", ward: "Ward 12", lat: 17.41, lng: 78.44 },
  evidence: [{ id: "e1", url: "", type: "image", uploadedAt: "2026-09-02T10:00:00Z" }],
  assignedOfficer: "Officer R. Naidu",
  timeline: [
    { id: "t1", status: "open", actor: "Aditi Rao", note: "Complaint submitted", timestamp: "2026-09-02T10:00:00Z" },
    { id: "t2", status: "open", actor: "System", note: "Assigned to Roads Dept, Ward 12", timestamp: "2026-09-02T14:00:00Z" },
    { id: "t3", status: "in_progress", actor: "Officer R. Naidu", note: "Site inspected, repair scheduled", timestamp: "2026-09-06T14:00:00Z" },
  ],
};

const STATUS_OPTIONS: { value: ComplaintStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "rejected", label: "Rejected" },
];

export default function ComplaintReview() {
  const { id } = useParams();
  const [complaint] = useState<Complaint>(MOCK); // TODO: fetch by id
  const [newStatus, setNewStatus] = useState<ComplaintStatus>(complaint.status);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleUpdate() {
    setSaving(true);
    // TODO: call api.updateStatus(id, newStatus, note)
    await new Promise((r) => setTimeout(r, 700));
    setSaving(false);
    setSaved(true);
    setNote("");
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div>
      <Link to="/officer/complaints" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink">
        <ArrowLeft size={16} /> Back to Queue
      </Link>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Main details */}
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-ink-soft">#{id ?? complaint.id}</span>
              <StatusBadge status={complaint.status} />
              <PriorityTag priority={complaint.priority} />
            </div>
            <h1 className="mb-2 text-xl font-bold tracking-tight text-ink">{complaint.title}</h1>
            <p className="mb-4 text-sm text-ink-soft">{complaint.description}</p>

            <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <InfoRow icon={MapPin} label="Location" value={`${complaint.location.address} · ${complaint.location.ward}`} />
              <InfoRow icon={User} label="Reported by" value={complaint.citizenName} />
            </div>

            {complaint.evidence.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">Evidence</p>
                <div className="flex gap-2">
                  {complaint.evidence.map((e) => (
                    <div key={e.id} className="flex h-20 w-20 items-center justify-center rounded-md bg-bg text-xs text-ink-soft">
                      Photo
                    </div>
                  ))}
                </div>
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

        {/* Action panel */}
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">Update Status</h2>

            {saved && (
              <div className="mb-3 flex items-center gap-2 rounded-md bg-status-resolved-bg px-3 py-2 text-sm text-status-resolved">
                <CheckCircle size={16} /> Status updated
              </div>
            )}

            <div className="mb-3 flex flex-col gap-1.5">
              <label htmlFor="status" className="text-sm font-medium text-ink">Status</label>
              <select
                id="status"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as ComplaintStatus)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-primary"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="mb-4 flex flex-col gap-1.5">
              <label htmlFor="note" className="text-sm font-medium text-ink">Note (visible to citizen)</label>
              <textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="e.g. Repair crew dispatched, expected completion Friday"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-primary"
              />
            </div>

            <button
              onClick={handleUpdate}
              disabled={saving}
              className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-white transition-all hover:bg-primary-strong active:translate-y-px disabled:opacity-60"
            >
              {saving ? "Updating…" : "Update Status"}
            </button>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">Citizen Contact</h2>
            <div className="flex items-center gap-2 text-sm text-ink">
              <User size={16} className="text-primary" /> {complaint.citizenName}
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
              <Phone size={16} className="text-primary" /> +91 98765 43210
            </div>
          </div>
        </div>
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
