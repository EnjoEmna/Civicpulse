import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { api } from "../api/client";
import type { CurrentUserProfile } from "../types/complaint";

export function Layout() {
  const location = useLocation();
  const outlet = useOutlet();
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .getProfile()
      .then((res) => {
        if (!cancelled && res?.data) {
          setProfile(res.data);
        }
      })
      .catch(() => {
        // Silently preserve graceful fallback
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const officerName = profile?.name?.trim() || "Officer Console";
  const officerInitials =
    profile?.name
      ?.trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "OC";

  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      {/* Standalone Reusable Sidebar with Fixed Viewport Height */}
      <Sidebar />

      {/* Main Content Column with Independent Vertical Scroll */}
      <div className="flex min-w-0 flex-1 flex-col h-screen overflow-y-auto">
        {/* Top Navigation Bar — Cleaned per specification */}
        <header className="glass-bar sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 sm:px-8 shrink-0">
          {/* Mobile Branding Link */}
          <NavLink to="/officer" className="flex items-center gap-2.5 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white shadow-md">
              CP
            </div>
            <span className="text-sm font-bold tracking-tight text-ink">
              Officer Console
            </span>
          </NavLink>

          {/* Spacer to push profile button to the right on desktop */}
          <div className="hidden md:block" />

          {/* Top-Right Officer Profile Navigation Button */}
          <div className="flex items-center gap-3">
            <Link
              to="/officer/profile"
              aria-label="View Officer Profile"
              className="group flex items-center gap-2 rounded-full border border-white/70 bg-white/50 p-1 pr-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_2px_6px_rgba(15,23,42,0.04)] backdrop-blur-md transition-all duration-200 hover:bg-white/80 hover:shadow-md hover:border-blue-400/40 active:scale-95 cursor-pointer"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-bold text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
                {officerInitials}
              </span>
              <span className="text-xs font-semibold text-ink hidden sm:inline group-hover:text-blue-600 transition-colors">
                {officerName}
              </span>
            </Link>
          </div>
        </header>

        {/* Main Content Area with Smooth Page-to-Page Transitions */}
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8 overflow-x-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {outlet && (
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.995 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="h-full"
              >
                {outlet}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
