"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import type { ReferenceSet } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";

import { ReferenceTableEditor } from "@/components/refs/ReferenceTableEditor";
import { slugify } from "@/lib/slug";

export function NewReferenceClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [columns, setColumns] = useState<string[]>(["key", "value"]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);

  const computedId = idEdited ? id : (slugify(name) ? `ref-${slugify(name)}` : "");

  async function save() {
    if (!name.trim() || !computedId.trim()) {
      toast.error("Name is required");
      return;
    }
    if (columns.length === 0) {
      toast.error("At least one column is required");
      return;
    }
    const ref: ReferenceSet = {
      id: computedId,
      name: name.trim(),
      description: description.trim() || undefined,
      currentVersion: 1,
      columns,
      rows,
      updatedAt: new Date().toISOString(),
    };
    setBusy(true);
    try {
      const res = await fetch("/api/refs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ref),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save");
        return;
      }
      toast.success("Reference saved");
      router.push(`/references/${encodeURIComponent(computedId)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New reference"
        description="A reference set is a tabular lookup. Define the columns, then add rows."
        actions={
          <button className="btn primary" onClick={save} disabled={busy || !name.trim()}>
            <Save className="w-3.5 h-3.5" /> Save reference
          </button>
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
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bag price matrix" />
            </Field>
            <Field label="ID">
              <input
                className="input mono"
                style={{ fontFamily: "var(--font-mono)" }}
                value={computedId}
                onChange={(e) => { setId(e.target.value); setIdEdited(true); }}
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
