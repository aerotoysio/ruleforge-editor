"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { OutputTemplate } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";

import { Input } from "@/components/ui/Input";
import { slugify } from "@/lib/slug";

export function NewTemplateClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const computedId = idEdited ? id : (slugify(name) ? `tmpl-${slugify(name)}` : "");

  async function save() {
    if (!name.trim() || !computedId.trim()) {
      toast.error("Name is required");
      return;
    }
    const tpl: OutputTemplate = {
      id: computedId,
      name: name.trim(),
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      fields: [],
      updatedAt: new Date().toISOString(),
    };
    setBusy(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(tpl),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to create template");
        return;
      }
      toast.success("Template created");
      router.push(`/templates/${encodeURIComponent(computedId)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New output template"
        description="A reusable shape for the objects a rule emits — bag-fee line, tax line, discount line. Add fields after creating it."
        eyebrow={
          <Link href="/templates" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
            <ArrowLeft className="w-3 h-3" /> Templates
          </Link>
        }
        actions={
          <button className="btn primary" onClick={save} disabled={busy || !name.trim()}>
            <Save className="w-3.5 h-3.5" /> Create template
          </button>
        }
      />
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="max-w-2xl flex flex-col gap-4">
          <section className="rounded-md border bg-card p-5 grid grid-cols-[100px_1fr] gap-4 items-center">
            <label className="text-[12px] text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bag fee line"
              className="h-9 text-[13px]"
              autoFocus
            />
            <label className="text-[12px] text-muted-foreground">id</label>
            <Input
              value={computedId}
              onChange={(e) => { setId(e.target.value); setIdEdited(true); }}
              className="h-9 text-[13px] font-mono"
              placeholder="tmpl-bag-fee-line"
            />
            <label className="text-[12px] text-muted-foreground">Category</label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="ancillary, tax, discount, …"
              className="h-9 text-[13px]"
            />
            <label className="text-[12px] text-muted-foreground self-start mt-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What kind of object does this template describe?"
              className="text-[12.5px] leading-snug rounded-md border border-input bg-background px-3 py-1.5 outline-none focus:ring-2 focus:ring-foreground/20 resize-y min-h-[44px] max-h-[140px]"
            />
          </section>
        </div>
      </div>
    </>
  );
}
