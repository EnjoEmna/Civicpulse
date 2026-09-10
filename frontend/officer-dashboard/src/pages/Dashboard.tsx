import { Link } from "react-router-dom";
import { Tray, Clock, CheckCircle, WarningCircle, ArrowRight } from "@phosphor-icons/react";
import { ComplaintList } from "../components/ComplaintList";
import type { Complaint } from "../types/complaint";

// TODO: replace with api.getDashboardStats() + api.getQueue({ limit: 5 })
const STATS = [
  { label: "Open", value: 24, icon: Tray, tone: "text-status-open", bg: "bg-status-open-bg" },
  { label: "In Progress", value: 12, icon: Clock, tone: "text-status-progress", bg: "bg-status-progress-bg" },
  { label: "Resolved (30d)", value: 96, icon: CheckCircle, tone: "text-status-resolved", bg: "bg-status-resolved-bg" },
  { label: "Overdue", value: 5, icon: WarningCircle, tone: "text-status-rejected", bg: "bg-status-rejected-bg" },
];

const RECENT: Complaint[] = [
  {
    id: "CP-10482", title: "Large pothole near bus stop", description: "", category: "roads", status: "in_progress",
    priority: "high", createdAt: "", updatedAt: "2026-09-09T09:00:00Z", citizenName: "Aditi Rao",
    location: { address: "4th Cross Rd", ward: "Ward 12", lat: 0, lng: 0 }, evidence: [], timeline: [], assignedOfficer: "You",
  },
  {
    id: "CP-10501", title: "Water pipeline leak flooding road", description: "", category: "water_supply", status: "open",
    priority: "urgent", createdAt: "", updatedAt: "2026-09-09T08:15:00Z", citizenName: "Vikram Shah",
    location: { address: "Lakeview Colony", ward: "Ward 12", lat: 0, lng: 0 }, evidence: [], timeline: [],
  },
  {
    id: "CP-10476", title: "Broken streetlight, school zone", description: "", category: "electricity", status: "open",
    priority: "medium", createdAt: "", updatedAt: "2026-09-08T17:40:00Z", citizenName: "Meena Iyer",
    location: { address: "Govt. School Rd", ward: "Ward 12", lat: 0, lng: 0 }, evidence: [], timeline: [],
  },
];

export default function Dashboard() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Good morning, Officer Naidu</h1>
        <p className="text-sm text-ink-soft">Here's what's on your queue today.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STATS.map(({ label, value, icon: Icon, tone, bg }) => (
          <div key={label} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
            <span className={`flex h-10 w-10 items-center justify-center rounded-md ${bg} ${tone}`}>
              <Icon size={20} weight="bold" />
            </span>
            <div>
              <p className="text-2xl font-bold leading-none text-ink">{value}</p>
              <p className="text-xs text-ink-soft">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Needs your attention</h2>
          <Link to="/officer/complaints" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            View full queue <ArrowRight size={14} />
          </Link>
        </div>
        <ComplaintList complaints={RECENT} />
      </div>
    </div>
  );
}
