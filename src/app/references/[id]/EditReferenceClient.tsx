"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Trash2 } from "lucide-react";
import type { ReferenceSet } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
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
            <Button variant="destructive" onClick={remove} disabled={busy}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
            <Button variant="default" onClick={save} disabled={busy}>
              <Save className="w-3.5 h-3.5" /> Save
            </Button>
          </>
        }
      />
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="max-w-5xl flex flex-col gap-6">
          <section
            className="rounded p-5 grid grid-cols-3 gap-4"
            style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
          >
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="ID (read-only)">
              <Input value={initial.id} readOnly className="mono" />
            </Field>
            <Field label="Version">
              <Input
                type="number"
                value={version}
                onChange={(e) => setVersion(Math.max(1, Number(e.target.value) || 1))}
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
