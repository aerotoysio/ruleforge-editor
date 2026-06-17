"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Copy, Check, Trash2, ShieldAlert, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/PageHeader";

type ApiKeyInfo = {
  id: string;
  name: string;
  prefix: string;
  createdBy: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  revoked: boolean;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

const th: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 10.5,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  textAlign: "left",
};
const td: React.CSSProperties = { padding: "10px 14px", verticalAlign: "middle" };
const mono = "var(--font-mono, ui-monospace, monospace)";

export function KeysClient({
  initialKeys,
  isAdmin,
  mode,
}: {
  initialKeys: ApiKeyInfo[];
  isAdmin: boolean;
  mode: string;
}) {
  const [keys, setKeys] = useState<ApiKeyInfo[]>(initialKeys);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [minted, setMinted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    const res = await fetch("/api/keys");
    if (res.ok) {
      const d = await res.json();
      setKeys(d.keys ?? []);
    }
  }

  async function createKey() {
    const n = name.trim();
    if (!n) {
      toast.error("Give the key a name first");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error ?? "Failed to create key");
        return;
      }
      setMinted(d.key);
      setCopied(false);
      setName("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string, label: string) {
    if (
      !confirm(
        `Revoke "${label}"?\n\nThe engine will reject this key immediately — any integration still using it will start getting 401s.`,
      )
    )
      return;
    const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Key revoked — the engine rejects it on the next call");
      await refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Failed to revoke");
    }
  }

  function copyMinted() {
    if (!minted) return;
    navigator.clipboard.writeText(minted).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const activeCount = keys.filter((k) => !k.revoked).length;

  return (
    <>
      <PageHeader
        eyebrow="Engine access"
        title="API keys"
        description="Keys that let external systems call the rules engine. Minted here and validated by the engine against the shared workspace — revoke a key and the engine rejects it instantly."
      />

      <div style={{ padding: "10px 28px 40px", maxWidth: 940 }}>
        {!isAdmin ? (
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: 16,
              color: "var(--text-muted)",
            }}
          >
            <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 600 }}>Admins only</div>
              <div style={{ fontSize: 13 }}>
                Managing engine API keys requires an administrator role. Ask a workspace admin to mint a key for your integration.
              </div>
            </div>
          </div>
        ) : (
          <>
            {minted && (
              <div
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 18,
                  background: "var(--color-bg)",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 3 }}>Copy your new key now</div>
                <div style={{ color: "var(--text-muted)", fontSize: 12.5, marginBottom: 12 }}>
                  This is the only time the full key is shown. Store it somewhere safe — if it leaks, revoke it here and mint a new one.
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <code
                    style={{
                      flex: 1,
                      fontFamily: mono,
                      fontSize: 13,
                      padding: "9px 11px",
                      background: "var(--color-bg-elevated, rgba(127,127,127,0.10))",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      overflowX: "auto",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {minted}
                  </code>
                  <Button variant="outline" size="sm" onClick={copyMinted}>
                    {copied ? <Check /> : <Copy />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setMinted(null)}>
                    Done
                  </Button>
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: 12.5, marginTop: 12 }}>
                  Send it as the <code style={{ fontFamily: mono }}>X-AERO-Key</code> header (or{" "}
                  <code style={{ fontFamily: mono }}>Authorization: Bearer …</code>) on every engine call.
                </div>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) createKey();
              }}
              style={{ display: "flex", gap: 8, marginBottom: 20 }}
            >
              <div style={{ flex: "1 1 380px", maxWidth: 380 }}>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name this key — e.g. “Booking site (prod)”"
                />
              </div>
              <Button type="submit" disabled={busy}>
                <Plus />
                {busy ? "Creating…" : "New key"}
              </Button>
            </form>

            {keys.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "center",
                  border: "1px dashed var(--color-border)",
                  borderRadius: 10,
                  padding: "40px 20px",
                  color: "var(--text-muted)",
                }}
              >
                <KeyRound size={26} style={{ opacity: 0.6 }} />
                <div style={{ fontWeight: 600 }}>No keys yet</div>
                <div style={{ fontSize: 13, maxWidth: 380 }}>
                  Mint a key above to let a booking site, partner system, or test harness call the engine. Until a key exists, the
                  engine stays open for local development.
                </div>
              </div>
            ) : (
              <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={th}>Name</th>
                      <th style={th}>Key</th>
                      <th style={th}>Created</th>
                      <th style={th}>Last used</th>
                      <th style={th}>Status</th>
                      <th style={{ ...th, textAlign: "right" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => (
                      <tr key={k.id} style={{ borderTop: "1px solid var(--color-border)", opacity: k.revoked ? 0.55 : 1 }}>
                        <td style={{ ...td, fontWeight: 500 }}>{k.name || "Untitled key"}</td>
                        <td style={{ ...td, fontFamily: mono, color: "var(--text-muted)" }}>{k.prefix}…</td>
                        <td style={{ ...td, color: "var(--text-muted)" }}>{fmtDate(k.createdAt)}</td>
                        <td style={{ ...td, color: "var(--text-muted)" }}>{k.lastUsedAt ? fmtDate(k.lastUsedAt) : "Never"}</td>
                        <td style={td}>
                          {k.revoked ? <Badge variant="secondary">Revoked</Badge> : <Badge variant="default">Active</Badge>}
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          {!k.revoked && (
                            <Button variant="destructive" size="sm" onClick={() => revoke(k.id, k.name)}>
                              <Trash2 />
                              Revoke
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 16, fontSize: 12.5, color: "var(--text-muted)" }}>
              {activeCount === 0
                ? "No active keys — the engine is open (any caller is allowed). Mint a key to require authentication."
                : `${activeCount} active key${activeCount === 1 ? "" : "s"}. The engine requires a valid X-AERO-Key on every call.`}
              {mode === "external"
                ? " User sign-in is delegated to the PSS gateway; these keys secure the engine’s machine API regardless."
                : ""}
            </div>
          </>
        )}
      </div>
    </>
  );
}
