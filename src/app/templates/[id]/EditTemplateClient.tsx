"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Trash2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { OutputTemplate, OutputTemplateField, OutputTemplateFieldType } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";

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
            <Button variant="ghost" size="sm" onClick={remove} disabled={busy} className="text-destructive hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
            <Button variant="default" size="sm" onClick={save} disabled={busy || !dirty}>
              <Save className="w-3.5 h-3.5" /> {dirty ? "Save" : "Saved"}
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="max-w-3xl flex flex-col gap-6">
          {/* Identity */}
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/80 font-semibold">
              Identity
            </h2>
            <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
              <label className="text-[12px] text-muted-foreground">id</label>
              <code className="text-[12px] font-mono text-muted-foreground">{tpl.id}</code>
              <label className="text-[12px] text-muted-foreground">Name</label>
              <Input
                value={tpl.name}
                onChange={(e) => patch("name", e.target.value)}
                className="h-8 text-[13px]"
              />
              <label className="text-[12px] text-muted-foreground">Category</label>
              <Input
                value={tpl.category ?? ""}
                onChange={(e) => patch("category", e.target.value)}
                placeholder="e.g. ancillary, tax, discount"
                className="h-8 text-[13px]"
              />
              <label className="text-[12px] text-muted-foreground self-start mt-1.5">Description</label>
              <textarea
                value={tpl.description ?? ""}
                onChange={(e) => patch("description", e.target.value)}
                rows={2}
                className="text-[12.5px] leading-snug rounded-md border border-input bg-background px-3 py-1.5 outline-none focus:ring-2 focus:ring-foreground/20 resize-y min-h-[44px] max-h-[120px]"
              />
            </div>
          </section>

          {/* Fields */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/80 font-semibold">
                Fields
              </h2>
              <Button variant="ghost" size="sm" onClick={addField}>
                <Plus className="w-3.5 h-3.5" /> Add field
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              {tpl.fields.length === 0 ? (
                <p className="text-[12px] text-muted-foreground italic px-3 py-4 border border-dashed rounded">
                  No fields yet. Add one to start defining the shape.
                </p>
              ) : (
                tpl.fields.map((f, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1.5fr_120px_2fr_60px_28px] gap-2 px-3 py-2 rounded border bg-card items-start"
                  >
                    <Input
                      value={f.name}
                      onChange={(e) => patchField(i, { name: e.target.value })}
                      placeholder="fieldName"
                      className="h-8 text-[12.5px] font-mono"
                    />
                    <select
                      value={f.type}
                      onChange={(e) => patchField(i, { type: e.target.value as OutputTemplateFieldType })}
                      className="h-8 text-[12px] px-2 rounded border border-input bg-background"
                    >
                      {TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <Input
                      value={f.description ?? ""}
                      onChange={(e) => patchField(i, { description: e.target.value })}
                      placeholder="What is this field?"
                      className="h-8 text-[12px]"
                    />
                    <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground select-none mt-1">
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
                      className="w-7 h-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 mt-0.5"
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
              <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/80 font-semibold">
                Example
              </h2>
              <pre className="text-[11.5px] font-mono leading-snug bg-muted/40 border rounded px-3 py-2 overflow-auto">
                {JSON.stringify(tpl.example, null, 2)}
              </pre>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
