import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MapPin, User, CheckCircle, Circle, Image as ImageIcon, Clock } from "@phosphor-icons/react";
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
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back Button */}
      <Link
        to="/complaints"
        className="glass-pill inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink border border-white/60 bg-white/40 shadow-sm backdrop-blur-md transition-all active:scale-95"
      >
        <ArrowLeft size={14} weight="bold" /> Back to My Complaints
      </Link>

      {/* Main Details Card */}
      <div className="glass-panel rounded-ios-2xl p-6 sm:p-7 shadow-ios-glass border border-white/70">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <span className="font-mono text-xs font-bold text-ink-soft/80 bg-white/50 border border-white/70 px-2.5 py-1 rounded-lg backdrop-blur-sm">
            #{id ?? complaint.id}
          </span>
          <StatusBadge status={complaint.status} />
        </div>

        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink font-display mb-2">
          {complaint.title}
        </h1>
        <p className="text-sm text-ink-soft leading-relaxed mb-6">
          {complaint.description}
        </p>

        {/* Squircle Inset Info Tiles */}
        <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-white/40">
          <InfoTile icon={MapPin} label="Location" value={complaint.location.address} />
          <InfoTile icon={User} label="Assigned Officer" value={complaint.assignedOfficer ?? "Pending assignment"} />
        </div>

        {/* Evidence Photos */}
        {complaint.evidence.length > 0 && (
          <div className="mt-5 border-t border-white/40 pt-4">
            <span className="text-xs font-semibold text-ink-soft uppercase tracking-wider block mb-2.5">
              Attached Evidence ({complaint.evidence.length})
            </span>
            <div className="flex gap-3">
              {complaint.evidence.map((e) => (
                <div
                  key={e.id}
                  className="flex h-20 w-24 flex-col items-center justify-center gap-1 rounded-ios-xl border border-white/70 bg-white/40 backdrop-blur-sm text-ink-soft hover:border-primary/60 hover:bg-white/60 transition-all shadow-sm cursor-pointer"
                >
                  <ImageIcon size={22} className="text-primary/70" />
                  <span className="text-[11px] font-semibold text-ink">Photo Evidence</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* iOS Activity Timeline Card */}
      <div className="glass-panel rounded-ios-2xl p-6 sm:p-7 shadow-ios-glass border border-white/70">
        <div className="flex items-center gap-2 mb-5">
          <Clock size={18} className="text-primary" weight="duotone" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink">
            Activity & Resolution Timeline
          </h2>
        </div>

        <ol className="flex flex-col gap-6">
          {complaint.timeline.map((event, i) => {
            const isLast = i === complaint.timeline.length - 1;
            return (
              <li key={event.id} className="relative flex gap-3.5">
                {!isLast && (
                  <span
                    className="absolute left-[11px] top-6 h-full w-0.5 bg-gradient-to-b from-primary/50 to-blue-200"
                    aria-hidden="true"
                  />
                )}
                <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center">
                  {isLast ? (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 shadow-[0_0_12px_rgba(37,99,235,0.7)] ring-4 ring-blue-100">
                      <Circle size={10} weight="fill" className="text-white animate-pulse" />
                    </div>
                  ) : (
                    <CheckCircle size={22} weight="fill" className="shrink-0 text-emerald-500 shadow-sm" />
                  )}
                </div>

                <div className="flex flex-col gap-1 -mt-0.5">
                  <span className="text-sm font-semibold text-ink leading-tight">{event.note}</span>
                  <div className="flex items-center gap-2 text-xs text-ink-soft">
                    <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/50">
                      {event.actor}
                    </span>
                    <span>·</span>
                    <span>{new Date(event.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-ios-xl border border-white/50 bg-white/30 p-3 backdrop-blur-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-primary border border-blue-400/20 shadow-sm">
        <Icon size={18} weight="duotone" />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider">{label}</span>
        <span className="text-xs sm:text-sm font-semibold text-ink truncate">{value}</span>
      </div>
    </div>
  );
}
