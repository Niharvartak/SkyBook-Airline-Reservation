import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { apiFetch } from "./api";

function AuthShell({
  title, subtitle, children, onNavigate,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  onNavigate: (path: string) => void;
}) {
  return (
    <main className="auth-page">
      <div className="auth-page-bg" aria-hidden="true"><div className="auth-bg-plane">✈</div></div>
      <section className="auth-page-panel">
        <button type="button" className="text-btn auth-back-btn" onClick={() => onNavigate("/")} aria-label="Back to home">← SkyBook</button>
        <div className="auth-logo"><span className="logo-icon">✈</span> Sky<span>Book</span></div>
        <span className="admin-badge">ACCOUNT RECOVERY</span>
        <h1>{title}</h1>
        <p className="auth-sub">{subtitle}</p>
        {children}
      </section>
    </main>
  );
}

export function ForgotPasswordPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    message: string;
    delivery?: string;
    deliveryNote?: string;
    devResetUrl?: string;
    expiresInMinutes?: number;
  } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      }, false);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to process the request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email on your SkyBook account and we'll generate a one-time reset link."
      onNavigate={onNavigate}
    >
      {result ? (
        <div className="auth-recovery-result">
          <div className="state-box success" role="status">
            <span className="state-icon">✓</span>
            {result.message}
          </div>
          {result.devResetUrl ? (
            <div className="auth-dev-reset">
              <strong>Development reset link</strong>
              <p>
                {result.deliveryNote || "Email delivery is not configured in this environment."}
                {" "}This one-time link expires in {result.expiresInMinutes || 30} minutes and is only returned in non-production builds.
              </p>
              <button
                type="button"
                className="primary-btn"
                onClick={() => onNavigate(result.devResetUrl!.replace(window.location.origin, ""))}
              >
                Open reset link
              </button>
              <code>{result.devResetUrl}</code>
            </div>
          ) : (
            <p className="auth-sub">
              If email delivery is configured in production, the link will arrive shortly. Contact support if it does not.
            </p>
          )}
          <button type="button" className="text-btn" onClick={() => onNavigate("/login")}>Back to sign in</button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="forgot-email">Email address
            <input
              id="forgot-email"
              className="booking-field"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
          </label>
          {error && <div className="state-box error" role="alert"><span className="state-icon">⚠</span>{error}</div>}
          <button className="primary-btn auth-submit" type="submit" disabled={busy}>{busy ? "Generating…" : "Send reset link"}</button>
        </form>
      )}
      <p className="auth-route-switch">
        Remembered it? <button type="button" className="text-btn" onClick={() => onNavigate("/login")}>Sign in</button>
      </p>
    </AuthShell>
  );
}

export function ResetPasswordPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password: form.password }),
      }, false);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password.");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Invalid reset link" subtitle="This link is missing its one-time token." onNavigate={onNavigate}>
        <div className="state-box error" role="alert"><span className="state-icon">⚠</span>Request a new password reset link to continue.</div>
        <button type="button" className="primary-btn auth-submit" onClick={() => onNavigate("/forgot-password")}>Request a new link</button>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="Your password has been reset. Sign in with your new password." onNavigate={onNavigate}>
        <div className="state-box success" role="status"><span className="state-icon">✓</span>All set — your new password is active.</div>
        <button type="button" className="primary-btn auth-submit" onClick={() => onNavigate("/login")}>Go to sign in</button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Reset links are single-use and expire 30 minutes after they are generated." onNavigate={onNavigate}>
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="reset-password">New password
          <input
            id="reset-password"
            className="booking-field"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="At least 6 characters"
            value={form.password}
            onChange={event => setForm(current => ({ ...current, password: event.target.value }))}
          />
        </label>
        <label htmlFor="reset-confirm">Confirm new password
          <input
            id="reset-confirm"
            className="booking-field"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Repeat your new password"
            value={form.confirm}
            onChange={event => setForm(current => ({ ...current, confirm: event.target.value }))}
          />
        </label>
        {error && <div className="state-box error" role="alert"><span className="state-icon">⚠</span>{error}</div>}
        <button className="primary-btn auth-submit" type="submit" disabled={busy}>{busy ? "Updating…" : "Reset password"}</button>
      </form>
    </AuthShell>
  );
}
