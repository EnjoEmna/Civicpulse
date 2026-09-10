import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Envelope, LockKey, Warning } from "@phosphor-icons/react";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Enter both your email and password to continue.");
      return;
    }

    setLoading(true);
    try {
      // TODO: wire to api.login(email, password) once /auth/officer-login is live
      await new Promise((r) => setTimeout(r, 600));
      localStorage.setItem("cp_officer_token", "demo-token");
      navigate("/officer");
    } catch {
      setError("We couldn't sign you in. Check your credentials and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-white text-base font-bold text-sidebar">
            CP
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-white">Officer Console</h1>
          <p className="text-sm text-white/60">Sign in with your department credentials.</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-surface p-6 shadow-lg" noValidate>
          {error && (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-md bg-status-rejected-bg px-3 py-2.5 text-sm text-status-rejected">
              <Warning size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mb-4 flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-ink">
              Official email
            </label>
            <div className="relative">
              <Envelope size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-surface py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-ink-soft/60 focus:border-primary"
                placeholder="officer@city.gov.in"
              />
            </div>
          </div>

          <div className="mb-5 flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-ink">
              Password
            </label>
            <div className="relative">
              <LockKey size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-surface py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-ink-soft/60 focus:border-primary"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-white transition-all hover:bg-primary-strong active:translate-y-px disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-white/50">
          Access is restricted to verified department accounts. Contact your admin for credentials.
        </p>
      </div>
    </div>
  );
}
