"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { Asset, OutputTemplate, OutputTemplateField } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";

type Props = {
  initialAsset: Asset;
  templates: OutputTemplate[];
};

export function EditAssetClient({ initialAsset, templates }: Props) {
  const router = useRouter();
  const [asset, setAsset] = useState<Asset>(initialAsset);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const template = templates.find((t) => t.id === asset.templateId);

  function patch<K extends keyof Asset>(key: K, value: Asset[K]) {
    setAsset((a) => ({ ...a, [key]: value }));
    setDirty(true);
  }

  function patchValue(name: string, value: unknown) {
    setAsset((a) => ({ ...a, values: { ...a.values, [name]: value } }));
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(asset.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(asset),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Save failed");
        return;
      }
      toast.success("Asset saved");
      setDirty(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete asset "${asset.name ?? asset.id}"? Rules referencing it will need to pick another.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(asset.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Delete failed");
        return;
      }
      toast.success("Asset deleted");
      router.push("/assets");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={asset.name ?? asset.id}
        description={asset.description ?? (template ? `Instance of ${template.name}` : "Asset")}
        eyebrow={
          <Link href="/assets" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
            <ArrowLeft className="w-3 h-3" /> Assets
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
      <div className="flex-1 overflow-auto px-8 py-6 bg-muted/30">
        <div className="max-w-3xl flex flex-col gap-6">
          {!template ? (
            <div className="rounded-md border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900 px-4 py-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="text-[12px] text-amber-900 dark:text-amber-200">
                <strong>Template missing.</strong> This asset references{" "}
                <code className="font-mono">{asset.templateId}</code>, which isn&apos;t in this workspace. Re-create
                the template or change this asset&apos;s templateId before using it from a rule.
              </div>
            </div>
          ) : null}

          {/* Identity */}
          <section className="rounded-lg border bg-card shadow-sm">
            <header className="px-4 py-2.5 border-b bg-muted/40">
              <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/80 font-semibold">
                Identity
              </h2>
            </header>
            <div className="grid grid-cols-[100px_1fr] gap-3 items-center px-4 py-4">
              <label className="text-[12px] text-muted-foreground">id</label>
              <code className="text-[12px] font-mono text-muted-foreground">{asset.id}</code>
              <label className="text-[12px] text-muted-foreground">Template</label>
              {template ? (
                <Link
                  href={`/templates/${encodeURIComponent(template.id)}`}
                  className="text-[12.5px] hover:underline text-foreground"
                >
                  {template.name}{" "}
                  <span className="font-mono text-muted-foreground/70 text-[11px]">
                    · {template.id}
                  </span>
                </Link>
              ) : (
                <code className="text-[12px] font-mono text-amber-700">{asset.templateId}</code>
              )}
              <label className="text-[12px] text-muted-foreground">Name</label>
              <Input
                value={asset.name ?? ""}
                onChange={(e) => patch("name", e.target.value || undefined)}
                placeholder={asset.id}
                className="h-8 text-[13px]"
              />
              <label className="text-[12px] text-muted-foreground">Category</label>
              <Input
                value={asset.category ?? ""}
                onChange={(e) => patch("category", e.target.value || undefined)}
                placeholder="optional grouping (extra-bag, sports, …)"
                className="h-8 text-[13px]"
              />
              <label className="text-[12px] text-muted-foreground self-start mt-1.5">Description</label>
              <textarea
                value={asset.description ?? ""}
                onChange={(e) => patch("description", e.target.value || undefined)}
                rows={2}
                className="text-[12.5px] leading-snug rounded-md border border-input bg-background px-3 py-1.5 outline-none focus:ring-2 focus:ring-foreground/20 resize-y min-h-[44px] max-h-[120px]"
              />
            </div>
          </section>

          {/* Values */}
          <section className="rounded-lg border bg-card shadow-sm">
            <header className="px-4 py-2.5 border-b bg-muted/40">
              <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/80 font-semibold">
                Values
              </h2>
            </header>
            <div className="divide-y">
              {template ? (
                template.fields.map((field) => (
                  <FieldRow
                    key={field.name}
                    field={field}
                    value={asset.values[field.name]}
                    onChange={(v) => patchValue(field.name, v)}
                  />
                ))
              ) : (
                <FreeFormJsonEditor
                  value={asset.values}
                  onChange={(v) => patch("values", v as Record<string, unknown>)}
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: OutputTemplateField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-3 px-4 py-3 items-start">
      <div className="flex flex-col gap-0.5 pt-1.5 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] font-mono font-medium text-foreground truncate" title={field.name}>
            {field.name}
          </span>
          {field.required ? (
            <span className="req-pill">
              req
            </span>
          ) : null}
        </div>
        <span className="text-[10.5px] text-muted-foreground font-mono">{field.type}</span>
        {field.description ? (
          <span className="text-[10.5px] text-muted-foreground/80 leading-snug mt-0.5 line-clamp-3">
            {field.description}
          </span>
        ) : null}
      </div>
      <ValueInput field={field} value={value} onChange={onChange} />
    </div>
  );
}

function ValueInput({
  field,
  value,
  onChange,
}: {
  field: OutputTemplateField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "boolean") {
    return (
      <div className="flex gap-1.5">
        {[true, false].map((opt) => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onChange(opt)}
            className={`h-8 px-3 text-[12px] font-medium rounded-md border transition-colors ${
              value === opt ? "bg-foreground text-background border-foreground" : "bg-card border-border hover:border-foreground/30"
            }`}
          >
            {opt ? "Yes" : "No"}
          </button>
        ))}
      </div>
    );
  }
  if (field.type === "number" || field.type === "integer") {
    return (
      <Input
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        placeholder={field.examples?.[0] != null ? String(field.examples[0]) : "0"}
        className="h-8 text-[12.5px] max-w-[260px]"
      />
    );
  }
  if (field.type === "string-array" || field.type === "number-array") {
    const arr = Array.isArray(value) ? (value as Array<string | number>).join("\n") : "";
    return (
      <textarea
        rows={3}
        value={arr}
        onChange={(e) => {
          const items = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
          onChange(field.type === "number-array" ? items.map(Number) : items);
        }}
        placeholder="one value per line"
        className="text-[12px] font-mono px-2.5 py-1.5 rounded-md border border-border bg-background outline-none focus:ring-2 focus:ring-foreground/30"
      />
    );
  }
  if (field.type === "object" || field.type === "object-array" || field.type === "any") {
    return (
      <textarea
        rows={4}
        value={value == null ? "" : typeof value === "string" ? value : JSON.stringify(value, null, 2)}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            onChange(e.target.value);
          }
        }}
        placeholder='{ "foo": "bar" }'
        className="text-[12px] font-mono px-2.5 py-1.5 rounded-md border border-border bg-background outline-none focus:ring-2 focus:ring-foreground/30"
      />
    );
  }
  return (
    <Input
      value={typeof value === "string" ? value : value != null ? String(value) : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={
        field.examples?.[0] != null
          ? String(field.examples[0])
          : field.default != null
          ? String(field.default)
          : ""
      }
      className="h-8 text-[12.5px]"
    />
  );
}

function FreeFormJsonEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="px-4 py-4 flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setError(null);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
        rows={12}
        className="text-[12px] font-mono px-2.5 py-1.5 rounded-md border border-border bg-background outline-none focus:ring-2 focus:ring-foreground/30"
      />
      {error ? (
        <span className="text-[11px] text-amber-700 dark:text-amber-400">{error}</span>
      ) : null}
    </div>
  );
}
