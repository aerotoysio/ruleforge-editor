"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@aerotoys.io");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const next = new URLSearchParams(window.location.search).get("next") || "/";
        router.push(next);
        router.refresh();
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error || "Login failed");
        setBusy(false);
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "var(--bg, #0b0b0c)", padding: 24, zIndex: 50 }}>
      <form
        onSubmit={onSubmit}
        style={{ width: "100%", maxWidth: 360, background: "var(--surface, #fff)", border: "1px solid var(--border, #e4e4e7)", borderRadius: 14, padding: 28, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 12px 40px rgba(0,0,0,0.15)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--accent, #2563eb)", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800 }}>R</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em", color: "var(--text, #18181b)" }}>RuleForge</div>
            <div style={{ fontSize: 11, color: "var(--text-muted, #71717a)" }}>Sign in to continue</div>
          </div>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted, #52525b)" }}>Email</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted, #52525b)" }}>Password</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error ? <div style={{ fontSize: 12.5, color: "#dc2626" }}>{error}</div> : null}
        <button type="submit" disabled={busy} className="btn primary" style={{ marginTop: 4, justifyContent: "center", opacity: busy ? 0.7 : 1 }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div style={{ fontSize: 11.5, color: "var(--text-muted, #a1a1aa)", textAlign: "center" }}>
          Demo: <code>demo@aerotoys.io</code> / <code>demo</code>
        </div>
      </form>
    </div>
  );
}
