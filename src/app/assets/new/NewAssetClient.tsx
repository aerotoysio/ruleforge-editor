"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Save, ArrowLeft, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import type { Asset, OutputTemplate } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
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
        <div className="flex-1 overflow-auto px-8 py-6 bg-muted/30">
          <EmptyState
            icon={<LayoutTemplate className="w-8 h-8" />}
            title="No templates yet"
            description="An asset is a concrete instance of a template — so we need a template to instance from. Create one first, then come back here."
            action={
              <Link href="/templates/new">
                <Button variant="default"><LayoutTemplate className="w-3.5 h-3.5" /> New template</Button>
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
          <Button variant="default" size="sm" onClick={save} disabled={busy || !name.trim() || !templateId}>
            <Save className="w-3.5 h-3.5" /> Create asset
          </Button>
        }
      />
      <div className="flex-1 overflow-auto px-8 py-6 bg-muted/30">
        <div className="max-w-2xl">
          <section className="rounded-lg border bg-card shadow-sm p-5 grid grid-cols-[100px_1fr] gap-4 items-center">
            <label className="text-[12px] text-muted-foreground">Template</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="h-9 text-[13px] px-2.5 rounded-md border border-input bg-background"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.category ? `[${t.category}] ` : ""}
                  {t.name}
                </option>
              ))}
            </select>

            <label className="text-[12px] text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Extra bag — second checked"
              className="h-9 text-[13px]"
              autoFocus
            />

            <label className="text-[12px] text-muted-foreground">id</label>
            <Input
              value={computedId}
              onChange={(e) => { setId(e.target.value); setIdEdited(true); }}
              className="h-9 text-[13px] font-mono"
              placeholder="asset-extra-bag-2"
            />

            <label className="text-[12px] text-muted-foreground">Category</label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="extra-bag, sports, oversize, …"
              className="h-9 text-[13px]"
            />

            <label className="text-[12px] text-muted-foreground self-start mt-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short business note — what this specific asset is."
              className="text-[12.5px] leading-snug rounded-md border border-input bg-background px-3 py-1.5 outline-none focus:ring-2 focus:ring-foreground/20 resize-y min-h-[44px] max-h-[140px]"
            />
          </section>

          {template ? (
            <p className="text-[11.5px] text-muted-foreground mt-3 px-1">
              <strong className="font-medium text-foreground">{template.fields.length}</strong>{" "}
              field{template.fields.length === 1 ? "" : "s"} from <em>{template.name}</em>.
              Field values open for editing on the detail page after you create the asset.
              {Object.keys(seededValues).length > 0 ? (
                <> {Object.keys(seededValues).length} field{Object.keys(seededValues).length === 1 ? " is" : "s are"} pre-filled from the template's defaults.</>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
