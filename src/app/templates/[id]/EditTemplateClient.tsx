"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Trash2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { OutputTemplate, OutputTemplateField, OutputTemplateFieldType } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";

const TYPES: OutputTemplateFieldType[] = [
  "string",
  "number",
  "integer",
  "boolean",
  "any",
  "string-array",
  "number-array",
  "object",
  "object-array",
];

export function EditTemplateClient({ initial }: { initial: OutputTemplate }) {
  const router = useRouter();
  const [tpl, setTpl] = useState<OutputTemplate>(initial);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  function patch<K extends keyof OutputTemplate>(key: K, value: OutputTemplate[K]) {
    setTpl((t) => ({ ...t, [key]: value }));
    setDirty(true);
  }

  function patchField(idx: number, patchObj: Partial<OutputTemplateField>) {
    setTpl((t) => ({
      ...t,
      fields: t.fields.map((f, i) => (i === idx ? { ...f, ...patchObj } : f)),
    }));
    setDirty(true);
  }

  function addField() {
    setTpl((t) => ({
      ...t,
      fields: [...t.fields, { name: "", type: "string" }],
    }));
    setDirty(true);
  }

  function removeField(idx: number) {
    setTpl((t) => ({ ...t, fields: t.fields.filter((_, i) => i !== idx) }));
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(tpl.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(tpl),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Save failed");
        return;
      }
      toast.success("Template saved");
      setDirty(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete template "${tpl.name}"? Rules referencing this template will lose their bindings.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(tpl.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Delete failed");
        return;
      }
      toast.success("Template deleted");
      router.push("/templates");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={tpl.name || "(unnamed template)"}
        description={tpl.description ?? "Output template"}
        eyebrow={
          <Link href="/templates" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
            <ArrowLeft className="w-3 h-3" /> Templates
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            <button className="btn ghost sm danger" onClick={remove} disabled={busy}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <button className="btn primary sm" onClick={save} disabled={busy || !dirty}>
              <Save className="w-3.5 h-3.5" /> {dirty ? "Save" : "Saved"}
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto" style={{ background: "var(--bg)", padding: "24px 28px" }}>
        <div className="max-w-3xl flex flex-col gap-6">
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
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Category</label>
              <input
                className="input"
                value={tpl.category ?? ""}
                onChange={(e) => patch("category", e.target.value)}
                placeholder="e.g. ancillary, tax, discount"
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
                onChange={(e) => patch("description", e.target.value)}
                rows={2}
              />
            </div>
          </section>

          {/* Fields */}
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
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2 className="field-label" style={{ margin: 0 }}>Fields</h2>
              <button className="btn ghost sm" onClick={addField}>
                <Plus className="w-3.5 h-3.5" /> Add field
              </button>
            </header>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {tpl.fields.length === 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                    margin: 0,
                    padding: "18px 20px",
                  }}
                >
                  No fields yet. Click <strong style={{ color: "var(--text)", fontStyle: "normal" }}>+ Add field</strong> to start defining the shape.
                </p>
              ) : (
                tpl.fields.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.5fr 130px 2fr 70px 28px",
                      gap: 10,
                      padding: "12px 16px",
                      borderTop: i === 0 ? "0" : "1px solid var(--border)",
                      alignItems: "flex-start",
                    }}
                  >
                    <input
                      className="input mono"
                      style={{ fontFamily: "var(--font-mono)" }}
                      value={f.name}
                      onChange={(e) => patchField(i, { name: e.target.value })}
                      placeholder="fieldName"
                    />
                    <select
                      className="input"
                      value={f.type}
                      onChange={(e) => patchField(i, { type: e.target.value as OutputTemplateFieldType })}
                    >
                      {TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <input
                      className="input"
                      value={f.description ?? ""}
                      onChange={(e) => patchField(i, { description: e.target.value })}
                      placeholder="What is this field?"
                    />
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 11,
                        color: "var(--text-muted)",
                        userSelect: "none",
                        marginTop: 6,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!f.required}
                        onChange={(e) => patchField(i, { required: e.target.checked || undefined })}
                      />
                      req
                    </label>
                    <button
                      type="button"
                      onClick={() => removeField(i)}
                      className="x"
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 5,
                        display: "inline-grid",
                        placeItems: "center",
                        color: "var(--text-muted)",
                        background: "transparent",
                        border: 0,
                        cursor: "pointer",
                      }}
                      aria-label="Remove field"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Example JSON (read-only preview) */}
          {tpl.example ? (
            <section className="flex flex-col gap-2">
              <h2 className="field-label">Example</h2>
              <pre
                style={{
                  fontSize: 11.5,
                  fontFamily: "var(--font-mono)",
                  lineHeight: 1.5,
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 7,
                  padding: "10px 12px",
                  overflow: "auto",
                  margin: 0,
                }}
              >
                {JSON.stringify(tpl.example, null, 2)}
              </pre>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
