import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  User,
  Envelope,
  IdentificationBadge,
  CalendarBlank,
  ShieldCheck,
  LockKey,
  ArrowLeft,
  ArrowsClockwise,
  CheckCircle,
} from "@phosphor-icons/react";
import { api } from "../api/client";
import type { CurrentUserProfile } from "../types/complaint";

export default function OfficerProfile() {
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadProfile() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProfile();
      setProfile(res.data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load officer profile.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  const initials =
    profile?.name
      ?.trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "OP";

  const formattedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Verified Personnel";

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Back navigation */}
      <div>
        <Link
          to="/officer"
          className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/50 px-3.5 py-1.5 text-xs font-semibold text-ink-soft shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md transition-all hover:bg-white/80 hover:text-ink"
        >
          <ArrowLeft size={14} weight="bold" /> Back to Dashboard
        </Link>
      </div>

      {/* Header Profile Hero Card */}
      <div className="glass-panel p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-2xl font-bold text-white shadow-[0_8px_20px_rgba(37,99,235,0.35),inset_0_1px_1px_rgba(255,255,255,0.4)]">
              {initials}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-ink">
                  {profile?.name || "Municipal Officer"}
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              </div>
              <p className="text-sm font-medium text-ink-soft">
                {profile?.email || "officer@civicpulse.internal"}
              </p>
            </div>
          </div>

          <div className="self-start sm:self-auto">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/70 bg-white/60 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)]">
              <ShieldCheck size={16} weight="duotone" className="text-blue-600" />
              Role: {profile?.role || "OFFICER"}
            </span>
          </div>
        </div>
      </div>

      {/* Strict Read-Only Notice Banner */}
      <div className="glass-panel flex items-start gap-3 border-blue-500/30 bg-blue-50/40 p-4 text-xs text-blue-950 backdrop-blur-md">
        <LockKey size={18} weight="duotone" className="shrink-0 text-blue-600 mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <p className="font-bold">Administrative Personnel Record — Read-Only</p>
          <p className="text-blue-900/80 leading-relaxed">
            This profile is synchronized with central municipal directory services. Personnel details cannot be edited or modified directly from the officer workstation.
          </p>
        </div>
      </div>

      {/* Content State Handling */}
      {loading ? (
        <div className="glass-panel flex items-center justify-center p-14 text-sm text-ink-soft">
          <ArrowsClockwise size={20} className="animate-spin text-primary mr-2" />
          Loading authenticated officer credentials…
        </div>
      ) : error ? (
        <div className="glass-panel flex flex-col gap-3 border-rose-500/30 p-6 text-sm text-rose-800">
          <p className="font-semibold">Unable to fetch profile information.</p>
          <p className="text-xs text-rose-700">{error}</p>
          <button
            type="button"
            onClick={loadProfile}
            className="self-start rounded-lg border border-white/70 bg-white/60 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-white"
          >
            Retry
          </button>
        </div>
      ) : profile ? (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Official Information Card (Read-Only) */}
          <div className="glass-panel p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                Official Information
              </h2>
            </div>

            <div className="flex flex-col divide-y divide-white/50 text-sm">
              <div className="flex items-center gap-3 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                  <User size={16} weight="bold" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-ink-soft">Full Name</span>
                  <span className="font-medium text-ink">{profile.name}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
                  <Envelope size={16} weight="bold" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-ink-soft">Official Email</span>
                  <span className="font-medium text-ink">{profile.email}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                  <IdentificationBadge size={16} weight="bold" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-ink-soft">Officer ID</span>
                  <span className="font-mono text-xs font-medium text-ink break-all">
                    {profile.id}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                  <CalendarBlank size={16} weight="bold" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-ink-soft">Member Since</span>
                  <span className="font-medium text-ink">{formattedDate}</span>
                </div>
              </div>
            </div>
          </div>

          {/* System Clearances & Permissions (Read-Only) */}
          <div className="glass-panel p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                Authorized Operational Clearances
              </h2>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-white/60 bg-white/40 p-3 backdrop-blur-sm">
                <div className="flex items-center gap-2.5">
                  <CheckCircle size={17} weight="fill" className="text-emerald-600 shrink-0" />
                  <span className="font-semibold text-ink">Departmental Queue Access</span>
                </div>
                <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-800">
                  Granted
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/60 bg-white/40 p-3 backdrop-blur-sm">
                <div className="flex items-center gap-2.5">
                  <CheckCircle size={17} weight="fill" className="text-emerald-600 shrink-0" />
                  <span className="font-semibold text-ink">Status Transition Control</span>
                </div>
                <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-800">
                  Granted
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/60 bg-white/40 p-3 backdrop-blur-sm">
                <div className="flex items-center gap-2.5">
                  <CheckCircle size={17} weight="fill" className="text-emerald-600 shrink-0" />
                  <span className="font-semibold text-ink">Spatial Intelligence & Hotspots</span>
                </div>
                <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-800">
                  Granted
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/60 bg-white/40 p-3 backdrop-blur-sm">
                <div className="flex items-center gap-2.5">
                  <CheckCircle size={17} weight="fill" className="text-emerald-600 shrink-0" />
                  <span className="font-semibold text-ink">Duplicate Surveillance Engine</span>
                </div>
                <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-800">
                  Active
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
