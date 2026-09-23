import { useState, type FormEvent } from "react";
import { User, Envelope, Phone, MapPinLine, Bell, CheckCircle, SignOut, ShieldCheck } from "@phosphor-icons/react";
import type { CitizenProfile } from "../types/complaint";

// TODO: replace with api.getProfile() via useEffect
const MOCK_PROFILE: CitizenProfile = {
  id: "u1",
  name: "Aditi Rao",
  email: "aditi.rao@example.com",
  phone: "+91 98765 43210",
  ward: "Ward 12 — Banjara Hills",
  notificationPrefs: { email: true, sms: false },
};

export default function Profile() {
  const [profile, setProfile] = useState<CitizenProfile>(MOCK_PROFILE);
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // TODO: call api.updateProfile(profile)
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function handleLogout() {
    localStorage.removeItem("cp_citizen_token");
    window.location.href = "/login";
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {/* Apple ID Style Profile Card Header */}
      <div className="glass-panel flex items-center gap-4 rounded-ios-2xl p-5 border border-white/70 shadow-ios-glass">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-xl font-bold text-white shadow-[0_4px_16px_rgba(37,99,235,0.4),inset_0_1px_1.5px_rgba(255,255,255,0.7)] ring-4 ring-white/60">
          {profile.name.split(" ").map((n) => n[0]).join("")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-ink font-display truncate">
              {profile.name}
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-2 py-0.5 text-[10px] font-bold text-emerald-800 backdrop-blur-sm">
              <ShieldCheck size={12} weight="fill" className="text-emerald-600" />
              Verified
            </span>
          </div>
          <p className="text-xs font-semibold text-ink-soft mt-0.5 truncate">{profile.ward}</p>
        </div>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSubmit} className="glass-panel flex flex-col gap-5 rounded-ios-2xl border border-white/70 p-6 sm:p-7 shadow-ios-glass">
        {saved && (
          <div className="flex items-center gap-2 rounded-ios-xl border border-emerald-400/40 bg-emerald-500/15 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 backdrop-blur-md shadow-sm">
            <CheckCircle size={18} weight="fill" className="text-emerald-600 shrink-0" />
            <span>Profile and notification preferences successfully saved.</span>
          </div>
        )}

        <div className="space-y-4">
          <Field label="Full Name" icon={User}>
            <input
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="glass-input w-full rounded-ios-xl px-3.5 py-2.5 text-xs sm:text-sm font-medium text-ink focus:outline-none"
            />
          </Field>

          <Field label="Email Address" icon={Envelope}>
            <input
              type="email"
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              className="glass-input w-full rounded-ios-xl px-3.5 py-2.5 text-xs sm:text-sm font-medium text-ink focus:outline-none"
            />
          </Field>

          <Field label="Phone Number" icon={Phone}>
            <input
              type="tel"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              className="glass-input w-full rounded-ios-xl px-3.5 py-2.5 text-xs sm:text-sm font-medium text-ink focus:outline-none"
            />
          </Field>

          <Field label="Ward / Registered Locality" icon={MapPinLine}>
            <input
              value={profile.ward ?? ""}
              onChange={(e) => setProfile({ ...profile, ward: e.target.value })}
              className="glass-input w-full rounded-ios-xl px-3.5 py-2.5 text-xs sm:text-sm font-medium text-ink focus:outline-none"
            />
          </Field>
        </div>

        {/* Inset Notifications Section */}
        <div className="border-t border-white/40 pt-5">
          <span className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink">
            <Bell size={16} className="text-primary" weight="duotone" /> Notification Channels
          </span>
          <div className="flex flex-col gap-2 rounded-ios-xl border border-white/50 bg-white/30 p-3.5 backdrop-blur-sm">
            <Toggle
              label="Email updates on my complaints"
              checked={profile.notificationPrefs.email}
              onChange={(v) =>
                setProfile({ ...profile, notificationPrefs: { ...profile.notificationPrefs, email: v } })
              }
            />
            <div className="h-px bg-white/40 w-full" />
            <Toggle
              label="SMS alerts for critical status changes"
              checked={profile.notificationPrefs.sms}
              onChange={(v) =>
                setProfile({ ...profile, notificationPrefs: { ...profile.notificationPrefs, sms: v } })
              }
            />
          </div>
        </div>

        <button
          type="submit"
          className="ios-btn-primary mt-2 rounded-ios-xl py-3 text-xs sm:text-sm font-bold text-white shadow-md cursor-pointer transition-all active:scale-[0.99]"
        >
          Save Changes
        </button>
      </form>

      {/* Frosted Destructive Sign Out Button */}
      <button
        onClick={handleLogout}
        className="flex w-full items-center justify-center gap-2 rounded-ios-xl border border-rose-300/50 bg-rose-500/10 py-3 text-xs font-bold text-rose-700 backdrop-blur-md transition-all hover:bg-rose-500/20 active:scale-[0.99] shadow-sm cursor-pointer"
      >
        <SignOut size={16} weight="bold" /> Sign Out from Citizen Portal
      </button>
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-soft">
        <Icon size={14} className="text-primary shrink-0" weight="duotone" /> {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span className="text-xs sm:text-sm font-semibold text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none shadow-inner ${
          checked ? "bg-primary" : "bg-slate-300/80"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}
