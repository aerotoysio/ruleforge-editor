"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Trash2 } from "lucide-react";
import type { ReferenceSet } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { ReferenceTableEditor } from "@/components/refs/ReferenceTableEditor";

export function EditReferenceClient({ initial }: { initial: ReferenceSet }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [columns, setColumns] = useState<string[]>(initial.columns ?? []);
  const [rows, setRows] = useState<Record<string, unknown>[]>(initial.rows ?? []);
  const [version, setVersion] = useState<number>(initial.currentVersion ?? 1);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const next: ReferenceSet = {
        ...initial,
        name: name.trim() || initial.name,
        description: description.trim() || undefined,
        currentVersion: version,
        columns,
        rows,
        updatedAt: new Date().toISOString(),
      };
      const res = await fetch(`/api/refs/${encodeURIComponent(initial.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save");
        return;
      }
      toast.success("Saved");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete reference "${initial.name}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/refs/${encodeURIComponent(initial.id)}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete");
        return;
      }
      toast.success("Deleted");
      router.push("/references");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={`Reference · ${initial.name}`}
        description={`${initial.id} · ${columns.length} columns · ${rows.length} rows`}
        actions={
          <>
            <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={remove} disabled={busy}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <button className="btn primary sm" onClick={save} disabled={busy}>
              <Save className="w-3.5 h-3.5" /> Save
            </button>
          </>
        }
      />
      <div className="flex-1 overflow-auto" style={{ background: "var(--bg)", padding: "24px 28px" }}>
        <div className="max-w-5xl flex flex-col gap-6">
          <section
            className="grid grid-cols-3 gap-4"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              padding: 22,
            }}
          >
            <Field label="Name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="ID (read-only)">
              <input
                className="input mono"
                style={{ fontFamily: "var(--font-mono)" }}
                value={initial.id}
                readOnly
              />
            </Field>
            <Field label="Version">
              <input
                className="input"
                type="number"
                value={version}
                onChange={(e) => setVersion(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
            <Field label="Description" full>
              <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="(optional)" />
            </Field>
          </section>

          <section
            className="flex flex-col gap-3"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              padding: 22,
            }}
          >
            <h2 style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.012em", color: "var(--text)", margin: 0 }}>
              Columns &amp; rows
            </h2>
            <ReferenceTableEditor
              columns={columns}
              rows={rows}
              onColumnsChange={setColumns}
              onRowsChange={setRows}
            />
          </section>
        </div>
      </div>
    </>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? "col-span-3" : ""}`}>
      <span
        style={{
          fontSize: 10.5,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 600,
          color: "var(--text-muted)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
