import React, { useState } from "react";
import { useAuth } from "../auth.jsx";

export default function AuthBar() {
  const { isAuthConfigured, user, displayName, signInGoogle, signInEmail, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isAuthConfigured) return null;

  if (user) {
    return (
      <div className="authbar">
        <span className="authbar-user">👤 {displayName}</span>
        <button className="btn btn-ghost small" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  async function sendLink() {
    if (!email.trim()) return;
    setBusy(true);
    const { error } = (await signInEmail(email.trim())) || {};
    setBusy(false);
    if (error) return;
    setSent(true);
  }

  return (
    <div className="authbar">
      {!open ? (
        <button className="btn btn-ghost small" onClick={() => setOpen(true)}>
          Sign in
        </button>
      ) : (
        <div className="auth-panel card">
          <h3>Sign in to create & save sets</h3>
          <button className="btn btn-primary" onClick={() => signInGoogle()}>
            Continue with Google
          </button>
          <div className="or">or</div>
          {sent ? (
            <p className="muted small">Check your email for a magic link ✉️</p>
          ) : (
            <div className="stack">
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendLink()}
              />
              <button className="btn" disabled={busy || !email.trim()} onClick={sendLink}>
                {busy ? "Sending…" : "Email me a magic link"}
              </button>
            </div>
          )}
          <button className="btn btn-ghost small" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
