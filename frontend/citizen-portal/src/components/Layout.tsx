import { NavLink, Outlet } from "react-router-dom";
import { House, FileText, ClipboardText, MapPin, User } from "@phosphor-icons/react";

const NAV_ITEMS = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/report", label: "Report Issue", icon: FileText, end: false },
  { to: "/complaints", label: "My Complaints", icon: ClipboardText, end: false },
  { to: "/map", label: "Civic Map", icon: MapPin, end: false },
  { to: "/profile", label: "Profile", icon: User, end: false },
];

export function Layout() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-app items-center justify-between px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-white">
              CP
            </span>
            <span className="text-lg font-bold tracking-tight text-ink">CivicPulse</span>
          </NavLink>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary-soft text-primary"
                      : "text-ink-soft hover:bg-primary-soft/60 hover:text-ink"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <NavLink
            to="/report"
            className="hidden rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-strong md:inline-block"
          >
            Report an Issue
          </NavLink>
        </div>
      </header>

      <main className="mx-auto w-full max-w-app flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      {/* Bottom tab bar — mobile only, this is a citizen-facing app used heavily on phones */}
      <nav
        className="sticky bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface md:hidden"
        aria-label="Primary"
      >
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
            <Icon size={20} weight={"regular"} />
            {label === "Report Issue" ? "Report" : label === "My Complaints" ? "Complaints" : label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
