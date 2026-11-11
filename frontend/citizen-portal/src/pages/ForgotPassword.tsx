import { Link } from "react-router-dom";
import { ArrowLeft, Info, Key, ShieldCheck } from "@phosphor-icons/react";

export default function ForgotPassword() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-5">
        <Link
          to="/login"
          className="glass-pill inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/45 px-3.5 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink"
        >
          <ArrowLeft size={14} weight="bold" />
          Back to Sign In
        </Link>

        <div className="glass-panel rounded-ios-2xl border border-white/70 p-6 sm:p-7 shadow-ios-glass space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
              <Key size={22} weight="bold" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-ink font-display">
                Password Recovery &amp; Security
              </h1>
              <p className="text-xs text-ink-soft">
                CivicPulse account access assistance
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-blue-300/50 bg-blue-500/10 p-3.5 text-xs leading-relaxed text-ink">
            <Info size={18} weight="fill" className="mt-0.5 shrink-0 text-blue-600" />
            <p>
              Automated email or SMS password-reset links are disabled in this local
              environment because no external mail or OTP verification provider is
              configured. To protect your account, passwords cannot be reset without
              identity verification.
            </p>
          </div>

          <div className="space-y-3 text-xs leading-relaxed text-ink-soft">
            <div className="rounded-xl border border-white/60 bg-white/45 p-3.5">
              <p className="font-bold text-ink flex items-center gap-1.5 mb-1">
                <ShieldCheck size={15} className="text-primary" weight="bold" />
                Already know your current password?
              </p>
              <p>
                Sign in with your existing password, then open{" "}
                <strong className="text-ink">Profile &rarr; Change Password</strong>{" "}
                to set a new password securely.
              </p>
            </div>

            <div className="rounded-xl border border-white/60 bg-white/45 p-3.5">
              <p className="font-bold text-ink mb-1">
                Locked out of a local/demo account?
              </p>
              <p>
                Contact your CivicPulse municipal administrator to verify your account
                details or register a new citizen account below.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              to="/login"
              className="ios-btn-primary flex-1 py-2.5 text-center text-xs font-semibold text-white shadow-md"
            >
              Return to Sign In
            </Link>
            <Link
              to="/signup"
              className="flex-1 rounded-xl border border-white/70 bg-white/60 py-2.5 text-center text-xs font-semibold text-ink hover:bg-white/90"
            >
              Create New Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
