import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Tray, Clock, CheckCircle, WarningCircle, ArrowRight } from "@phosphor-icons/react";
import { ComplaintList } from "../components/ComplaintList";
import type { Complaint } from "../types/complaint";

// TODO: replace with api.getDashboardStats() + api.getQueue({ limit: 5 })
const STATS = [
  {
    label: "Open",
    value: 24,
    icon: Tray,
    iconBg: "bg-gradient-to-br from-amber-400 to-amber-600",
    glow: "shadow-[0_4px_14px_rgba(245,158,11,0.35)]",
    badge: "Pending",
    badgeStyle: "bg-amber-500/15 text-amber-800 border-amber-300/60",
    subtext: "+3 today",
  },
  {
    label: "In Progress",
    value: 12,
    icon: Clock,
    iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
    glow: "shadow-[0_4px_14px_rgba(37,99,235,0.35)]",
    badge: "Active",
    badgeStyle: "bg-blue-500/15 text-blue-800 border-blue-300/60",
    subtext: "Site inspected",
  },
  {
    label: "Resolved (30d)",
    value: 96,
    icon: CheckCircle,
    iconBg: "bg-gradient-to-br from-emerald-400 to-teal-600",
    glow: "shadow-[0_4px_14px_rgba(16,185,129,0.35)]",
    badge: "98% on-time",
    badgeStyle: "bg-emerald-500/15 text-emerald-800 border-emerald-300/60",
    subtext: "This month",
  },
  {
    label: "Overdue",
    value: 5,
    icon: WarningCircle,
    iconBg: "bg-gradient-to-br from-rose-500 to-red-600",
    glow: "shadow-[0_4px_14px_rgba(239,68,68,0.35)]",
    badge: "Escalated",
    badgeStyle: "bg-rose-500/15 text-rose-800 border-rose-300/60",
    subtext: "Action required",
  },
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

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.35, ease: "easeOut" as const },
  }),
};

export default function Dashboard() {
  return (
    <div className="flex flex-col gap-6">
      {/* Clean iOS Page Header without harsh shelf line */}
      <div className="flex flex-col gap-1 pt-1 pb-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-blue-700 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            Overview
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">Good morning, Officer Naidu</h1>
        <p className="text-sm font-medium text-ink-soft">Here's what's on your queue today.</p>
      </div>

      {/* Control Center Style Widget Tiles — Proportional iPhone Squircle Widgets */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STATS.map(({ label, value, icon: Icon, iconBg, glow, badge, badgeStyle, subtext }, i) => (
          <motion.div
            key={label}
            custom={i}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            whileHover={{ scale: 1.02, y: -3 }}
            whileTap={{ scale: 0.98 }}
            className="ios-widget group flex flex-col justify-between p-5 transition-all duration-200 hover:shadow-ios-glass-hover min-h-[142px]"
          >
            {/* Top row: App icon glyph + Status badge */}
            <div className="flex items-center justify-between">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${iconBg} ${glow} text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] transition-transform duration-200 group-hover:scale-105`}
              >
                <Icon size={24} weight="bold" />
              </div>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border backdrop-blur-md ${badgeStyle}`}>
                {badge}
              </span>
            </div>

            {/* Bottom row: Large tabular figure + Label + Subtext */}
            <div className="mt-4">
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-extrabold tracking-tight text-ink font-mono">{value}</p>
                <span className="text-[11px] font-medium text-ink-soft/80">{subtext}</span>
              </div>
              <p className="mt-0.5 text-xs font-semibold text-ink-soft">{label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div>
        <div className="mb-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">Needs your attention</h2>
          </div>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="inline-block">
            <Link
              to="/officer/complaints"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/50 px-3 py-1 text-xs font-semibold text-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md transition-colors hover:bg-white/80"
            >
              View full queue <ArrowRight size={13} weight="bold" />
            </Link>
          </motion.div>
        </div>
        <ComplaintList complaints={RECENT} />
      </div>
    </div>
  );
}
