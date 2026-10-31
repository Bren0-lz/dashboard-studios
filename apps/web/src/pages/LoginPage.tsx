import { useState } from "react";
import type { SessionInfo } from "@dash/shared";
import { api } from "../lib/api";

export function LoginPage({ onLogin }: { onLogin: (session: SessionInfo) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await api<SessionInfo>("/auth/login", { method: "POST", body: { email, password } }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <span className="brand-name">Studios Aryana</span>
        <h1>Painel de vendas</h1>
        <p className="muted">Entre com o mesmo e-mail e senha do CRM.</p>
        <label className="field">
          <span>E-mail</span>
          <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="field">
          <span>Senha</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="primary-button wide" disabled={busy}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
