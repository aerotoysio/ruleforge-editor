"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import type { SchemaTemplate } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { slugify } from "@/lib/slug";

const EMPTY_OBJECT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object" as const,
  properties: {},
  required: [] as string[],
};

export function NewSchemaClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [intent, setIntent] = useState<SchemaTemplate["intent"]>("input");
  const [busy, setBusy] = useState(false);

  const computedId = idEdited ? id : (slugify(name) ? `schema-${slugify(name)}` : "");

  async function create() {
    if (!name.trim() || !computedId.trim()) {
      toast.error("Name is required");
      return;
    }
    const tpl: SchemaTemplate = {
      id: computedId,
      name: name.trim(),
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      intent,
      schema: EMPTY_OBJECT_SCHEMA,
      updatedAt: new Date().toISOString(),
    };
    setBusy(true);
    try {
      const res = await fetch("/api/schema-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(tpl),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to create schema");
        return;
      }
      toast.success("Schema template created — define its shape next");
      router.push(`/schemas/${encodeURIComponent(computedId)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New schema template"
        description="A reusable JSON Schema shape that one or more rules can reference. Define the fields after creation on the edit page."
        eyebrow={
          <Link href="/schemas" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
            <ArrowLeft className="w-3 h-3" /> Schemas
          </Link>
        }
        actions={
          <button
            className="btn primary sm"
            onClick={create}
            disabled={busy || !name.trim() || !computedId.trim()}
          >
            Create schema <ArrowRight className="w-3.5 h-3.5" />
          </button>
        }
      />
      <div className="flex-1 overflow-auto" style={{ background: "var(--bg)", padding: "24px 28px" }}>
        <div className="max-w-2xl flex flex-col gap-4">
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
              rowGap: 12,
              alignItems: "center",
            }}
          >
            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Price quote request"
              autoFocus
            />

            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>id</label>
            <input
              className="input mono"
              style={{ fontFamily: "var(--font-mono)" }}
              value={computedId}
              onChange={(e) => { setId(e.target.value); setIdEdited(true); }}
              placeholder="schema-quote-request"
            />

            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Intent</label>
            <select
              className="input"
              value={intent ?? ""}
              onChange={(e) => setIntent((e.target.value || undefined) as SchemaTemplate["intent"])}
            >
              <option value="input">Input — request shape rules consume</option>
              <option value="context">Context — per-evaluation values</option>
              <option value="output">Output — envelope-level response shape</option>
              <option value="">Any / unspecified</option>
            </select>

            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Category</label>
            <input
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="passenger, booking, fare, …"
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
              style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, minHeight: 52 }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What does this schema represent? Rules referencing this template will inherit the shape."
            />
          </section>
        </div>
      </div>
    </>
  );
}
