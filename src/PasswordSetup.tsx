import { useState } from "react";
import { ArrowRight, LockKey } from "@phosphor-icons/react";
import type { User } from "../shared/types";
import { api } from "./api";
import BrandLogo from "./BrandLogo";

export default function PasswordSetup({ user, onSaved, onLogout, error: workspaceError }: {
  user: User; onSaved: (user: User) => Promise<void>; onLogout: () => Promise<void>; error: string;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (busy) return;
    setError("");
    if (password !== confirmation) { setError("The passwords do not match. Enter the same password in both boxes."); return; }
    setBusy(true);
    try {
      const saved = await api<User>("/auth/password", { method: "POST", body: JSON.stringify({ newPassword: password }) });
      await onSaved(saved);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="password-setup-page">
    <form className="login-form password-setup-form" aria-label="Create your personal password" aria-busy={busy}
      onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="brand"><BrandLogo /></div>
      <div className="eyebrow">FIRST SIGN-IN · ROLL NO. {user.rollNumber}</div>
      <h2>Create your password</h2>
      <p>Welcome, {user.name}. Replace your temporary code with a password only you know.</p>
      <label className="field">New password
        <input type="password" required minLength={12} maxLength={256} autoComplete="new-password" autoFocus
          aria-describedby="personal-password-help" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
      </label>
      <p id="personal-password-help" className="password-setup-help">Use at least 12 characters. A short sentence is easy to remember.</p>
      <label className="field">Confirm new password
        <input type="password" required minLength={12} maxLength={256} autoComplete="new-password"
          value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} />
      </label>
      {(error || workspaceError) && <p className="error" role="alert">{error || workspaceError}</p>}
      <button className="btn btn-primary full" disabled={busy}>{busy ? "Saving password…" : "Save password and continue"}<ArrowRight size={17} /></button>
      <p className="password-setup-help"><LockKey size={14} aria-hidden="true" /> Next time, sign in with your roll number and this new password.</p>
      <button className="btn full" type="button" disabled={busy} onClick={() => void onLogout()}>Sign out</button>
    </form>
  </main>;
}
