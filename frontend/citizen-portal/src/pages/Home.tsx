import { Link } from "react-router-dom";
import { FileText, MapPin, ClipboardText, ArrowRight, RoadHorizon, Drop, Lightning, Trash } from "@phosphor-icons/react";
const CATEGORIES = [
 { label: "Roads", icon: RoadHorizon },
  { label: "Water Supply", icon: Drop },
  { label: "Electricity", icon: Lightning },
  { label: "Sanitation", icon: Trash },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      {/* Hero — one clear action, fits one viewport, no clutter */}
      <section className="rounded-xl border border-border bg-surface p-6 sm:p-10">
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
              Your city, your voice
            </p>
            <h1 className="mb-3 text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
              Report a civic issue in minutes
            </h1>
            <p className="mb-6 max-w-[46ch] text-ink-soft">
              Potholes, water leaks, broken streetlights, garbage pileups — tell us
              where it is, and we'll route it to the right department.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/report"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-primary-strong active:translate-y-px"
              >
                <FileText size={18} /> Report an Issue
              </Link>
              <Link
                to="/complaints"
                className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-primary-soft/50"
              >
                <ClipboardText size={18} /> Track My Complaints
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">Issues near you</span>
              <Link to="/map" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                View map <ArrowRight size={12} />
              </Link>
            </div>
            <ul className="flex flex-col gap-2.5" aria-label="Recent nearby issues">
              {[
                { title: "Pothole on 4th Cross Rd", distance: "0.4 km away" },
                { title: "Streetlight outage, Park Ave", distance: "0.7 km away" },
                { title: "Overflowing bin, Market St", distance: "1.1 km away" },
              ].map((item) => (
                <li key={item.title} className="flex items-center gap-3 rounded-md bg-surface p-2.5 text-sm">
                  <MapPin size={16} className="shrink-0 text-primary" />
                  <span className="flex-1 text-ink">{item.title}</span>
                  <span className="shrink-0 text-xs text-ink-soft">{item.distance}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Category quick-links */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
          Report by category
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORIES.map(({ label, icon: Icon }) => (
            <Link
              key={label}
              to="/report"
              className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface p-5 text-center transition-colors hover:border-primary hover:bg-primary-soft/40"
            >
              <Icon size={22} className="text-primary" />
              <span className="text-sm font-medium text-ink">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="rounded-xl border border-border bg-surface p-6 sm:p-8">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-ink-soft">How it works</h2>
        <ol className="grid gap-6 sm:grid-cols-3">
          {[
            { step: "1", title: "Report", body: "Describe the issue, add a photo, and pin the location." },
            { step: "2", title: "Route", body: "We assign it to the right officer or department automatically." },
            { step: "3", title: "Track", body: "Follow status updates until it's resolved." },
          ].map(({ step, title, body }) => (
            <li key={step} className="flex flex-col gap-1.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">
                {step}
              </span>
              <span className="text-sm font-semibold text-ink">{title}</span>
              <span className="text-sm text-ink-soft">{body}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
