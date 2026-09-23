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
    <div className="flex flex-col gap-5">
      <div>
        <Link
          to="/officer/complaints"
          className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/50 px-3.5 py-1.5 text-xs font-semibold text-ink-soft shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md transition-all hover:bg-white/80 hover:text-ink"
        >
          <ArrowLeft size={14} weight="bold" /> Back to Queue
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Main details */}
        <div className="flex flex-col gap-5">
          <div className="glass-panel p-6">
            <div className="mb-3.5 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-primary-soft/60 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                #{id ?? complaint.id}
              </span>
              <StatusBadge status={complaint.status} />
              <PriorityTag priority={complaint.priority} />
            </div>
            <h1 className="mb-2.5 text-2xl font-bold tracking-tight text-ink">{complaint.title}</h1>
            <p className="mb-5 text-sm leading-relaxed text-ink-soft">{complaint.description}</p>

            <div className="grid gap-3.5 border-t border-white/50 pt-5 sm:grid-cols-2">
              <div className="rounded-xl border border-white/60 bg-white/40 p-3.5 backdrop-blur-sm shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.7)]">
                <InfoRow icon={MapPin} label="Location" value={`${complaint.location.address} · ${complaint.location.ward}`} />
              </div>
              <div className="rounded-xl border border-white/60 bg-white/40 p-3.5 backdrop-blur-sm shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.7)]">
                <InfoRow icon={User} label="Reported by" value={complaint.citizenName} />
              </div>
            </div>

            {complaint.evidence.length > 0 && (
              <div className="mt-5 border-t border-white/50 pt-5">
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-ink-soft">Attached Evidence</p>
                <div className="flex gap-3">
                  {complaint.evidence.map((e) => (
                    <div
                      key={e.id}
                      className="flex h-24 w-24 flex-col items-center justify-center rounded-2xl border border-white/70 bg-white/50 text-xs font-medium text-ink-soft shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md"
                    >
                      <span className="text-xl">📸</span>
                      <span className="mt-1 text-[11px]">Photo 1</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="glass-panel p-6">
            <div className="mb-5 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">Activity Timeline</h2>
            </div>
            <ol className="flex flex-col gap-6">
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
                    <div className="flex flex-1 flex-col rounded-xl border border-white/50 bg-white/35 p-3 backdrop-blur-sm shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.6)]">
                      <span className="text-sm font-semibold text-ink">{event.note}</span>
                      <span className="mt-0.5 text-xs text-ink-soft">
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
          <div className="glass-panel p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">Update Status</h2>
            </div>

            {saved && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/20 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 backdrop-blur-md shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.6)]">
                <CheckCircle size={16} weight="bold" /> Status updated successfully
              </div>
            )}

            <div className="mb-3.5 flex flex-col gap-1.5">
              <label htmlFor="status" className="text-xs font-semibold text-ink">
                Status
              </label>
              <select
                id="status"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as ComplaintStatus)}
                className="glass-input w-full px-3 py-2 text-sm font-medium"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4 flex flex-col gap-1.5">
              <label htmlFor="note" className="text-xs font-semibold text-ink">
                Note (visible to citizen)
              </label>
              <textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="e.g. Repair crew dispatched, expected completion Friday"
                className="glass-input w-full px-3 py-2 text-sm"
              />
            </div>

            <button
              onClick={handleUpdate}
              disabled={saving}
              className="ios-btn-primary w-full py-2.5 text-sm font-semibold text-white disabled:opacity-60 cursor-pointer"
            >
              {saving ? "Updating…" : "Update Status"}
            </button>
          </div>

          <div className="glass-panel p-5">
            <div className="mb-3.5 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">Citizen Contact</h2>
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5 rounded-xl border border-white/50 bg-white/40 p-2.5 text-sm font-medium text-ink backdrop-blur-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600">
                  <User size={16} weight="bold" />
                </div>
                <span>{complaint.citizenName}</span>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-white/50 bg-white/40 p-2.5 text-sm font-medium text-ink-soft backdrop-blur-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600">
                  <Phone size={16} weight="bold" />
                </div>
                <span>+91 98765 43210</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon size={16} weight="bold" />
      </div>
      <div className="flex flex-col">
        <span className="text-[11px] font-semibold text-ink-soft">{label}</span>
        <span className="text-sm font-medium text-ink">{value}</span>
      </div>
    </div>
  );
}
