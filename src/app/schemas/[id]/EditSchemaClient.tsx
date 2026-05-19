"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { JsonSchema, SchemaTemplate } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { SchemaEditor } from "@/components/schema-editor/SchemaEditor";

export function EditSchemaClient({ initial }: { initial: SchemaTemplate }) {
  const router = useRouter();
  const [tpl, setTpl] = useState<SchemaTemplate>(initial);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  function patch<K extends keyof SchemaTemplate>(key: K, value: SchemaTemplate[K]) {
    setTpl((t) => ({ ...t, [key]: value }));
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/schema-templates/${encodeURIComponent(tpl.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(tpl),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Save failed");
        return;
      }
      toast.success("Schema saved. Referencing rules pick it up on next reload.");
      setDirty(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete schema "${tpl.name}"? Rules referencing this template will fall back to their on-disk snapshot.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/schema-templates/${encodeURIComponent(tpl.id)}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Delete failed");
        return;
      }
      toast.success("Schema deleted");
      router.push("/schemas");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={tpl.name || "(unnamed schema)"}
        description={
          tpl.description ??
          (tpl.intent === "input"
            ? "Input schema template"
            : tpl.intent === "output"
            ? "Output schema template"
            : tpl.intent === "context"
            ? "Context schema template"
            : "Schema template")
        }
        eyebrow={
          <Link href="/schemas" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
            <ArrowLeft className="w-3 h-3" /> Schemas
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              className="btn ghost sm"
              style={{ color: "var(--danger)" }}
              onClick={remove}
              disabled={busy}
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <button className="btn primary sm" onClick={save} disabled={busy || !dirty}>
              <Save className="w-3.5 h-3.5" /> {dirty ? "Save" : "Saved"}
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto" style={{ background: "var(--bg)", padding: "24px 28px" }}>
        <div
          className="flex flex-col gap-6"
          style={{ maxWidth: 1480, marginInline: "auto", width: "100%" }}
        >
          {/* Identity */}
          <section
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              overflow: "hidden",
            }}
          >
            <header
              style={{
                padding: "12px 18px",
                borderBottom: "1px solid var(--border)",
                background: "var(--panel-2)",
              }}
            >
              <h2 className="field-label" style={{ margin: 0 }}>Identity</h2>
            </header>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr",
                columnGap: 16,
                rowGap: 12,
                alignItems: "center",
                padding: "18px 20px",
              }}
            >
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>id</label>
              <code style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                {tpl.id}
              </code>
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Name</label>
              <input
                className="input"
                value={tpl.name}
                onChange={(e) => patch("name", e.target.value)}
              />
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Intent</label>
              <select
                className="input"
                value={tpl.intent ?? ""}
                onChange={(e) =>
                  patch("intent", (e.target.value || undefined) as SchemaTemplate["intent"])
                }
              >
                <option value="input">Input — request shape</option>
                <option value="context">Context — per-evaluation values</option>
                <option value="output">Output — envelope-level response</option>
                <option value="">Any / unspecified</option>
              </select>
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Category</label>
              <input
                className="input"
                value={tpl.category ?? ""}
                onChange={(e) => patch("category", e.target.value || undefined)}
                placeholder="passenger, booking, fare, …"
              />
              <label
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  alignSelf: "flex-start",
                  marginTop: 6,
                }}
              >
                Description
              </label>
              <textarea
                className="json-input"
                style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, minHeight: 52 }}
                value={tpl.description ?? ""}
                onChange={(e) => patch("description", e.target.value || undefined)}
                rows={2}
              />
            </div>
          </section>

          {/* Schema editor */}
          <section
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              overflow: "hidden",
            }}
          >
            <header
              style={{
                padding: "12px 18px",
                borderBottom: "1px solid var(--border)",
                background: "var(--panel-2)",
              }}
            >
              <h2 className="field-label" style={{ margin: 0 }}>Schema</h2>
            </header>
            <div style={{ padding: 22 }}>
              <SchemaEditor
                schema={tpl.schema}
                onChange={(next: JsonSchema) => patch("schema", next)}
              />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
