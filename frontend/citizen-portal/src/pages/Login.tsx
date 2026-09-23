import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Envelope, LockKey, Warning, User, ShieldCheck } from "@phosphor-icons/react";

export default function Login() {
  const navigate = useNavigate();
  const [role, setRole] = useState<"citizen" | "officer">("citizen");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Determine officer dashboard URL based on environment
  const officerDashboardUrl = `http://${window.location.hostname}:5174/officer?token=demo-token`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Enter both your email and password to continue.");
      return;
    }

    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 600));

      if (role === "citizen") {
        localStorage.setItem("cp_citizen_token", "demo-token");
        navigate("/");
      } else {
        localStorage.setItem("cp_officer_token", "demo-token");
        // Redirect to officer dashboard on port 5174
        window.location.href = officerDashboardUrl;
      }
    } catch {
      setError("We couldn't sign you in. Check your details and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* iOS Segmented Role Switcher: Citizen vs Officer */}
        <div className="glass-pill mb-6 inline-flex w-full rounded-full p-1 border border-white/60 bg-white/40 shadow-sm backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              setRole("citizen");
              setError(null);
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-xs font-bold transition-all duration-200 cursor-pointer ${
              role === "citizen"
                ? "bg-primary text-white shadow-[0_2px_8px_rgba(37,99,235,0.35),inset_0_1px_0.5px_rgba(255,255,255,0.5)]"
                : "text-ink-soft hover:text-ink hover:bg-white/40"
            }`}
          >
            <User size={16} weight={role === "citizen" ? "fill" : "regular"} />
            <span>Citizen Portal</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRole("officer");
              setError(null);
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-xs font-bold transition-all duration-200 cursor-pointer ${
              role === "officer"
                ? "bg-primary text-white shadow-[0_2px_8px_rgba(37,99,235,0.35),inset_0_1px_0.5px_rgba(255,255,255,0.5)]"
                : "text-ink-soft hover:text-ink hover:bg-white/40"
            }`}
          >
            <ShieldCheck size={16} weight={role === "officer" ? "fill" : "regular"} />
            <span>Officer Console</span>
          </button>
        </div>

        {/* Dynamic Header based on Role */}
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white shadow-[0_8px_24px_rgba(37,99,235,0.35),inset_0_1px_1px_rgba(255,255,255,0.6)]">
            CP
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink font-display">
              {role === "citizen" ? "Sign in to CivicPulse" : "Officer Console"}
            </h1>
            <p className="mt-0.5 text-xs text-ink-soft">
              {role === "citizen"
                ? "Report and track civic issues in your area."
                : "Sign in with your verified department credentials."}
            </p>
          </div>
        </div>

        {/* Liquid Glass Form */}
        <form
          onSubmit={handleSubmit}
          className="glass-panel p-6 shadow-ios-glass border border-white/70"
          noValidate
        >
          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/15 p-3 text-xs font-medium text-rose-800 backdrop-blur-md"
            >
              <Warning size={17} className="mt-0.5 shrink-0 text-rose-600" weight="fill" />
              <span>{error}</span>
            </div>
          )}

          <div className="mb-4 flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-semibold text-ink">
              {role === "citizen" ? "Email address" : "Official departmental email"}
            </label>
            <div className="relative">
              <Envelope size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="glass-input w-full py-2.5 pl-10 pr-3.5 text-sm"
                placeholder={role === "citizen" ? "you@example.com" : "officer@city.gov.in"}
              />
            </div>
          </div>

          <div className="mb-2 flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-semibold text-ink">
              Password
            </label>
            <div className="relative">
              <LockKey size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="glass-input w-full py-2.5 pl-10 pr-3.5 text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          {role === "citizen" && (
            <div className="mb-5 flex justify-end">
              <Link to="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`ios-btn-primary w-full py-3 text-sm font-semibold text-white shadow-md disabled:opacity-60 cursor-pointer ${
              role === "officer" ? "mt-4" : ""
            }`}
          >
            {loading
              ? "Signing in…"
              : role === "citizen"
              ? "Sign in as Citizen"
              : "Sign in as Officer"}
          </button>
        </form>

        {role === "citizen" && (
          <p className="mt-6 text-center text-sm text-ink-soft">
            New to CivicPulse?{" "}
            <Link to="/signup" className="font-semibold text-primary hover:underline">
              Create an account
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
