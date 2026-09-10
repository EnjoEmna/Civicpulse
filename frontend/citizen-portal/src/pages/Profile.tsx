import { useState, type FormEvent } from "react";
import { User, Envelope, Phone, MapPinLine, Bell, CheckCircle, SignOut } from "@phosphor-icons/react";
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
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-lg font-bold text-primary">
          {profile.name.split(" ").map((n) => n[0]).join("")}
        </span>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{profile.name}</h1>
          <p className="text-sm text-ink-soft">{profile.ward}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-6">
        {saved && (
          <div className="flex items-center gap-2 rounded-md bg-status-resolved-bg px-3 py-2.5 text-sm text-status-resolved">
            <CheckCircle size={18} /> Profile updated
          </div>
        )}

        <Field label="Full name" icon={User}>
          <input
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Field label="Email address" icon={Envelope}>
          <input
            type="email"
            value={profile.email}
            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Field label="Phone number" icon={Phone}>
          <input
            type="tel"
            value={profile.phone}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Field label="Ward / Area" icon={MapPinLine}>
          <input
            value={profile.ward ?? ""}
            onChange={(e) => setProfile({ ...profile, ward: e.target.value })}
            className={inputClass}
          />
        </Field>

        <div className="border-t border-border pt-5">
          <span className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Bell size={16} /> Notification preferences
          </span>
          <div className="flex flex-col gap-2.5">
            <Toggle
              label="Email updates on my complaints"
              checked={profile.notificationPrefs.email}
              onChange={(v) =>
                setProfile({ ...profile, notificationPrefs: { ...profile.notificationPrefs, email: v } })
              }
            />
            <Toggle
              label="SMS updates on my complaints"
              checked={profile.notificationPrefs.sms}
              onChange={(v) =>
                setProfile({ ...profile, notificationPrefs: { ...profile.notificationPrefs, sms: v } })
              }
            />
          </div>
        </div>

        <button
          type="submit"
          className="mt-1 rounded-md bg-primary py-2.5 text-sm font-semibold text-white transition-all hover:bg-primary-strong active:translate-y-px"
        >
          Save changes
        </button>
      </form>

      <button
        onClick={handleLogout}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-border py-2.5 text-sm font-semibold text-status-rejected hover:bg-status-rejected-bg"
      >
        <SignOut size={16} /> Sign out
      </button>
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium text-ink">
        <Icon size={15} className="text-ink-soft" /> {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-sm text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-border"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

const inputClass = "w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-ink focus:border-primary";
