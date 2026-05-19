"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Save, ArrowLeft, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import type { Asset, OutputTemplate } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";

import { EmptyState } from "@/components/ui/EmptyState";
import { slugify } from "@/lib/slug";

export function NewAssetClient({ templates }: { templates: OutputTemplate[] }) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "");
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const computedId = idEdited ? id : (slugify(name) ? `asset-${slugify(name)}` : "");
  const template = templates.find((t) => t.id === templateId);

  // Pre-seed values from each field's `default` so the user only has to fill
  // the variable bits. They'll edit on the detail page after creation.
  const seededValues = useMemo<Record<string, unknown>>(() => {
    const out: Record<string, unknown> = {};
    if (!template) return out;
    for (const f of template.fields) {
      if (f.default !== undefined) out[f.name] = f.default;
    }
    return out;
  }, [template]);

  async function save() {
    if (!templateId) {
      toast.error("Pick a template");
      return;
    }
    if (!name.trim() || !computedId.trim()) {
      toast.error("Name is required");
      return;
    }
    const asset: Asset = {
      id: computedId,
      templateId,
      values: seededValues,
      name: name.trim(),
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    setBusy(true);
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(asset),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to create asset");
        return;
      }
      toast.success("Asset created — fill in the values next");
      router.push(`/assets/${encodeURIComponent(computedId)}`);
    } finally {
      setBusy(false);
    }
  }

  if (templates.length === 0) {
    return (
      <>
        <PageHeader
          title="New asset"
          description="Define a template first — assets are typed instances of templates."
          eyebrow={
            <Link href="/assets" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
              <ArrowLeft className="w-3 h-3" /> Assets
            </Link>
          }
        />
        <div className="flex-1 overflow-auto" style={{ background: "var(--bg)", padding: "24px 28px" }}>
          <EmptyState
            icon={<LayoutTemplate className="w-8 h-8" />}
            title="No templates yet"
            description="An asset is a concrete instance of a template — so we need a template to instance from. Create one first, then come back here."
            action={
              <Link href="/templates/new">
                <button className="btn primary"><LayoutTemplate className="w-3.5 h-3.5" /> New template</button>
              </Link>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New asset"
        description="A concrete instance of a template — pick the template, name the asset, then fill its fields on the detail page."
        eyebrow={
          <Link href="/assets" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
            <ArrowLeft className="w-3 h-3" /> Assets
          </Link>
        }
        actions={
          <button className="btn primary sm" onClick={save} disabled={busy || !name.trim() || !templateId}>
            <Save className="w-3.5 h-3.5" /> Create asset
          </button>
        }
      />
      <div className="flex-1 overflow-auto" style={{ background: "var(--bg)", padding: "24px 28px" }}>
        <div className="max-w-2xl">
          <section
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              padding: 22,
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              columnGap: 16,
              rowGap: 14,
              alignItems: "center",
            }}
          >
            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Template</label>
            <select
              className="input"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.category ? `[${t.category}] ` : ""}
                  {t.name}
                </option>
              ))}
            </select>

            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Extra bag — second checked"
              autoFocus
            />

            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>id</label>
            <input
              className="input mono"
              style={{ fontFamily: "var(--font-mono)" }}
              value={computedId}
              onChange={(e) => { setId(e.target.value); setIdEdited(true); }}
              placeholder="asset-extra-bag-2"
            />

            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Category</label>
            <input
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="extra-bag, sports, oversize, …"
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
              style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, minHeight: 56 }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short business note — what this specific asset is."
            />
          </section>

          {template ? (
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 12, padding: "0 4px" }}>
              <strong style={{ fontWeight: 500, color: "var(--text)" }}>{template.fields.length}</strong>{" "}
              field{template.fields.length === 1 ? "" : "s"} from{" "}
              <em style={{ color: "var(--text)" }}>{template.name}</em>.{" "}
              Field values open for editing on the detail page after you create the asset.
              {Object.keys(seededValues).length > 0 ? (
                <> {Object.keys(seededValues).length} field{Object.keys(seededValues).length === 1 ? " is" : "s are"} pre-filled from the template&apos;s defaults.</>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
