"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Workflow, ArrowRight } from "lucide-react";

const DEMO = [
  { label: "Admin", email: "demo@aerotoys.io", hint: "sees everything" },
  { label: "Tax Team", email: "tax@aerotoys.io", hint: "tax rules only" },
  { label: "Offer Team", email: "offer@aerotoys.io", hint: "offer rules only" },
];

const fieldStyle: React.CSSProperties = {
  height: 40,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  padding: "0 12px",
  color: "#fff",
  fontSize: 14,
  outline: "none",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@aerotoys.io");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doLogin(em: string, pw: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: em, password: pw }),
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

  function quick(em: string) {
    setEmail(em);
    setPassword("demo");
    void doLogin(em, "demo");
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        padding: 24,
        overflow: "hidden",
        background: "#0a0a0f",
      }}
    >
      <style>{`
        .rf-login-input:focus{border-color:rgba(168,85,247,0.75)!important;box-shadow:0 0 0 3px rgba(168,85,247,0.18)}
        .rf-login-input::placeholder{color:rgba(231,231,238,0.35)}
        .rf-chip:hover{background:rgba(255,255,255,0.10)!important}
        .rf-signin:hover{filter:brightness(1.08)}
        @keyframes rf-float{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-14px,0)}}
      `}</style>

      {/* aurora background */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(58% 50% at 18% 12%, rgba(99,102,241,0.32), transparent 70%)," +
            "radial-gradient(55% 48% at 85% 88%, rgba(217,70,239,0.22), transparent 70%)," +
            "radial-gradient(45% 42% at 92% 8%, rgba(56,189,248,0.18), transparent 70%)",
          animation: "rf-float 14s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.35))",
        }}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void doLogin(email, password);
        }}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 380,
          background: "rgba(18,18,24,0.72)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 18,
          padding: "30px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
          color: "#e7e7ee",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 11, marginBottom: 4 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "linear-gradient(135deg,#6366f1,#a855f7 55%,#d946ef)",
              display: "grid",
              placeItems: "center",
              boxShadow: "0 8px 24px rgba(139,92,246,0.45)",
            }}
          >
            <Workflow size={26} color="#fff" strokeWidth={2.2} />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 21, letterSpacing: "-0.02em", color: "#fff" }}>RuleForge</div>
            <div style={{ fontSize: 12, color: "rgba(231,231,238,0.6)", marginTop: 3 }}>
              AI-authored · human-verified · engine-executed
            </div>
          </div>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: "rgba(231,231,238,0.7)" }}>EMAIL</span>
          <input
            className="rf-login-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            style={fieldStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: "rgba(231,231,238,0.7)" }}>PASSWORD</span>
          <input
            className="rf-login-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            required
            style={fieldStyle}
          />
        </label>

        {error ? (
          <div
            style={{
              fontSize: 12.5,
              color: "#fca5a5",
              background: "rgba(220,38,38,0.12)",
              border: "1px solid rgba(248,113,113,0.3)",
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="rf-signin"
          style={{
            marginTop: 2,
            height: 42,
            border: 0,
            borderRadius: 10,
            cursor: busy ? "default" : "pointer",
            fontWeight: 700,
            fontSize: 14,
            color: "#fff",
            background: "linear-gradient(135deg,#6366f1,#a855f7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: busy ? 0.7 : 1,
            boxShadow: "0 8px 24px rgba(99,102,241,0.4)",
            transition: "filter .12s",
          }}
        >
          {busy ? "Signing in…" : <>Sign in <ArrowRight size={16} /></>}
        </button>

        <div style={{ marginTop: 2 }}>
          <div style={{ fontSize: 11, color: "rgba(231,231,238,0.5)", textAlign: "center", marginBottom: 9 }}>
            Quick demo sign-in · password <code style={{ color: "rgba(231,231,238,0.78)" }}>demo</code>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => quick(d.email)}
                disabled={busy}
                title={`${d.email} — ${d.hint}`}
                className="rf-chip"
                style={{
                  flex: 1,
                  padding: "8px 6px",
                  borderRadius: 9,
                  cursor: busy ? "default" : "pointer",
                  background: email === d.email ? "rgba(139,92,246,0.22)" : "rgba(255,255,255,0.05)",
                  border: email === d.email ? "1px solid rgba(168,85,247,0.6)" : "1px solid rgba(255,255,255,0.10)",
                  color: "#e7e7ee",
                  fontSize: 11.5,
                  fontWeight: 600,
                  transition: "all .12s",
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}
