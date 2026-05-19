"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { Asset, OutputTemplate, OutputTemplateField } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";

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
      <div className="flex-1 overflow-auto" style={{ background: "var(--bg)", padding: "24px 28px" }}>
        <div className="max-w-3xl flex flex-col gap-6">
          {!template ? (
            <div
              style={{
                border: "1px solid var(--warn-soft)",
                background: "var(--warn-soft)",
                borderRadius: 8,
                padding: "12px 14px",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <AlertTriangle
                className="w-4 h-4 shrink-0"
                style={{ color: "var(--warn)", marginTop: 2 }}
              />
              <div style={{ fontSize: 12, color: "var(--warn)", lineHeight: 1.5 }}>
                <strong>Template missing.</strong> This asset references{" "}
                <code style={{ fontFamily: "var(--font-mono)" }}>{asset.templateId}</code>, which isn&apos;t in this workspace. Re-create
                the template or change this asset&apos;s templateId before using it from a rule.
              </div>
            </div>
          ) : null}

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
                {asset.id}
              </code>
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Template</label>
              {template ? (
                <Link
                  href={`/templates/${encodeURIComponent(template.id)}`}
                  style={{ fontSize: 12.5, color: "var(--text)" }}
                  className="hover:underline"
                >
                  {template.name}{" "}
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: 11 }}>
                    · {template.id}
                  </span>
                </Link>
              ) : (
                <code style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--warn)" }}>
                  {asset.templateId}
                </code>
              )}
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Name</label>
              <input
                className="input"
                value={asset.name ?? ""}
                onChange={(e) => patch("name", e.target.value || undefined)}
                placeholder={asset.id}
              />
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Category</label>
              <input
                className="input"
                value={asset.category ?? ""}
                onChange={(e) => patch("category", e.target.value || undefined)}
                placeholder="optional grouping (extra-bag, sports, …)"
              />
              <label style={{ fontSize: 12, color: "var(--text-muted)", alignSelf: "flex-start", marginTop: 6 }}>
                Description
              </label>
              <textarea
                className="json-input"
                style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, minHeight: 52 }}
                value={asset.description ?? ""}
                onChange={(e) => patch("description", e.target.value || undefined)}
                rows={2}
              />
            </div>
          </section>

          {/* Values */}
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
              <h2 className="field-label" style={{ margin: 0 }}>Values</h2>
            </header>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {template ? (
                template.fields.map((field, i) => (
                  <div
                    key={field.name}
                    style={{
                      borderTop: i === 0 ? "0" : "1px solid var(--border)",
                    }}
                  >
                    <FieldRow
                      field={field}
                      value={asset.values[field.name]}
                      onChange={(v) => patchValue(field.name, v)}
                    />
                  </div>
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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "220px 1fr",
        gap: 16,
        padding: "14px 20px",
        alignItems: "flex-start",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 6, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 12.5,
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
              color: "var(--text)",
            }}
            className="truncate"
            title={field.name}
          >
            {field.name}
          </span>
          {field.required ? <span className="req-pill">req</span> : null}
        </div>
        <span style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          {field.type}
        </span>
        {field.description ? (
          <span
            style={{
              fontSize: 10.5,
              color: "var(--text-muted)",
              lineHeight: 1.4,
              marginTop: 2,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
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
      <div className="pill-toggle">
        {[true, false].map((opt) => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onChange(opt)}
            className={value === opt ? "on" : ""}
          >
            {opt ? "Yes" : "No"}
          </button>
        ))}
      </div>
    );
  }
  if (field.type === "number" || field.type === "integer") {
    return (
      <input
        className="input"
        style={{ maxWidth: 260 }}
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        placeholder={field.examples?.[0] != null ? String(field.examples[0]) : "0"}
      />
    );
  }
  if (field.type === "string-array" || field.type === "number-array") {
    const arr = Array.isArray(value) ? (value as Array<string | number>).join("\n") : "";
    return (
      <textarea
        className="json-input"
        rows={3}
        value={arr}
        onChange={(e) => {
          const items = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
          onChange(field.type === "number-array" ? items.map(Number) : items);
        }}
        placeholder="one value per line"
      />
    );
  }
  if (field.type === "object" || field.type === "object-array" || field.type === "any") {
    return (
      <textarea
        className="json-input"
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
      />
    );
  }
  return (
    <input
      className="input"
      value={typeof value === "string" ? value : value != null ? String(value) : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={
        field.examples?.[0] != null
          ? String(field.examples[0])
          : field.default != null
          ? String(field.default)
          : ""
      }
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
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 20 }}>
      <textarea
        className="json-input"
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
      />
      {error ? (
        <span style={{ fontSize: 11, color: "var(--warn)" }}>{error}</span>
      ) : null}
    </div>
  );
}
