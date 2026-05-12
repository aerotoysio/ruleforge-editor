"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import type { ReferenceSet } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";

import { Input } from "@/components/ui/Input";
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
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="max-w-5xl flex flex-col gap-6">
          <section
            className="rounded p-5 grid grid-cols-3 gap-4"
            style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
          >
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bag price matrix" />
            </Field>
            <Field label="ID">
              <Input
                value={computedId}
                onChange={(e) => { setId(e.target.value); setIdEdited(true); }}
                className="mono"
              />
            </Field>
            <Field label="Description" full>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="(optional)" />
            </Field>
          </section>

          <section
            className="rounded p-5 flex flex-col gap-3"
            style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
          >
            <h2 className="text-[14px] font-medium tracking-tight">Columns &amp; rows</h2>
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
    <label className={`flex flex-col gap-1 ${full ? "col-span-3" : ""}`}>
      <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-dim)" }}>{label}</span>
      {children}
    </label>
  );
}
