import { NavLink, Outlet } from "react-router-dom";
import { SquaresFour, ClipboardText, MapTrifold, SignOut, Bell } from "@phosphor-icons/react";

const NAV_ITEMS = [
  { to: "/officer", label: "Dashboard", icon: SquaresFour, end: true },
  { to: "/officer/complaints", label: "Complaint Queue", icon: ClipboardText, end: false },
  { to: "/officer/map", label: "Issue Map", icon: MapTrifold, end: false },
];

export function Layout() {
  function handleLogout() {
    localStorage.removeItem("cp_officer_token");
    window.location.href = "/officer/login";
  }

  return (
    <div className="flex min-h-[100dvh] bg-bg">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-white md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-sm font-bold text-sidebar">
            CP
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold">CivicPulse</p>
            <p className="text-[11px] text-white/60">Officer Console</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Primary">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          className="mx-3 mb-5 flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white"
        >
          <SignOut size={18} /> Sign out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-6">
          <NavLink to="/officer" className="flex items-center gap-2 md:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-white">
              CP
            </span>
            <span className="text-sm font-bold text-ink">Officer Console</span>
          </NavLink>
          <span className="hidden text-sm font-medium text-ink-soft md:block">Ward 12 — Banjara Hills</span>
          <div className="flex items-center gap-3">
            <button aria-label="Notifications" className="relative rounded-md p-2 text-ink-soft hover:bg-primary-soft/50">
              <Bell size={18} />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-status-rejected" />
            </button>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
              RN
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>

        {/* Bottom tab bar for tablets/officers in the field */}
        <nav className="grid grid-cols-3 border-t border-border bg-surface md:hidden" aria-label="Primary">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                  isActive ? "text-primary" : "text-ink-soft"
                }`
              }
            >
              <Icon size={20} />
              {label === "Complaint Queue" ? "Queue" : label === "Issue Map" ? "Map" : label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
