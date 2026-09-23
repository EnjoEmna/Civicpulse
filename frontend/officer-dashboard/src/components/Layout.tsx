import { NavLink, useLocation, useOutlet } from "react-router-dom";
import { SquaresFour, ClipboardText, MapTrifold, SignOut, Bell } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";

const NAV_ITEMS = [
  { to: "/officer", label: "Dashboard", icon: SquaresFour, end: true },
  { to: "/officer/complaints", label: "Complaint Queue", icon: ClipboardText, end: false },
  { to: "/officer/map", label: "Issue Map", icon: MapTrifold, end: false },
];

export function Layout() {
  const location = useLocation();
  const outlet = useOutlet();

  function handleLogout() {
    localStorage.removeItem("cp_officer_token");
    window.location.href = "/officer/login";
  }

  return (
    <div className="flex min-h-[100dvh]">
      {/* Sidebar — Apple Frosted Medium-Dark Twilight Glass Navigation Panel */}
      <aside className="glass-sidebar relative hidden w-64 shrink-0 flex-col md:flex">
        <div className="flex items-center gap-3 px-6 py-6 border-b border-white/12">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,0.4),inset_0_1px_1px_rgba(255,255,255,0.5)]">
            CP
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-tight text-white">CivicPulse</p>
            <p className="text-[11px] font-medium text-blue-200/70">First Officer Console</p>
          </div>
        </div>

        <div className="px-3 pt-5 pb-2">
          <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-white/45">Navigation</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1.5 px-3" aria-label="Primary">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm transition-all duration-200 ${
                  isActive
                    ? "bg-white/20 text-white shadow-[0_3px_12px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.4)] border border-white/25 font-bold backdrop-blur-md"
                    : "text-white/75 font-medium hover:bg-white/10 hover:text-white"
                }`
              }
            >
              <Icon size={19} weight="duotone" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Live Officer status chip in sidebar */}
        <div className="mx-3 my-4 rounded-2xl border border-white/12 bg-white/8 p-3.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-semibold text-white">System Online</span>
          </div>
          <p className="mt-0.5 text-[11px] text-white/50">Ward 12 · On Duty</p>
        </div>

        <div className="p-3 border-t border-white/12">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-white/75 transition-colors hover:bg-rose-500/20 hover:text-rose-200"
          >
            <SignOut size={18} weight="duotone" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Glass header — Apple Dynamic Navigation Bar */}
        <header className="glass-bar sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 sm:px-8">
          <NavLink to="/officer" className="flex items-center gap-2.5 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white shadow-md">
              CP
            </div>
            <span className="text-sm font-bold tracking-tight text-ink">Officer Console</span>
          </NavLink>

          {/* Ward pill */}
          <div className="hidden md:flex items-center gap-2 rounded-full border border-white/70 bg-white/50 px-3.5 py-1 text-xs font-medium text-ink-soft shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_2px_8px_rgba(15,23,42,0.04)] backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            <span>Ward 12 — Banjara Hills</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              aria-label="Notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/70 bg-white/50 text-ink-soft shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_2px_6px_rgba(15,23,42,0.04)] backdrop-blur-md transition-all hover:bg-white/80 hover:text-ink active:scale-95"
            >
              <Bell size={18} weight="duotone" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
            </button>
            <div className="flex items-center gap-2 rounded-full border border-white/70 bg-white/50 p-1 pr-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_2px_6px_rgba(15,23,42,0.04)] backdrop-blur-md">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-bold text-white shadow-sm">
                RN
              </span>
              <span className="text-xs font-semibold text-ink hidden sm:inline">Officer Naidu</span>
            </div>
          </div>
        </header>

        {/* Main Content Area with Smooth Page-to-Page Transitions */}
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8 overflow-x-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {outlet && (
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                transition={{
                  duration: 0.26,
                  ease: [0.16, 1, 0.3, 1], // Apple iOS smooth cubic-bezier
                }}
                className="w-full"
              >
                {outlet}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Bottom tab bar for tablets/officers in the field — Apple iPhone Frosted Tab Bar */}
        <nav
          className="glass-bar grid grid-cols-3 border-t border-white/60 md:hidden sticky bottom-0 z-30 pb-safe shadow-[0_-4px_20px_rgba(15,23,42,0.05)]"
          aria-label="Primary"
        >
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2 text-[11px] font-semibold transition-all ${
                  isActive
                    ? "text-blue-600"
                    : "text-ink-soft/75 hover:text-ink"
                }`
              }
            >
              <Icon size={22} weight="duotone" />
              {label === "Complaint Queue" ? "Queue" : label === "Issue Map" ? "Map" : label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
