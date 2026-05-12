"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Sparkles } from "lucide-react";
import type { JsonSchema, Rule } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { slugify } from "@/lib/slug";

const EMPTY_OBJECT_SCHEMA: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {},
  required: [],
};

export function NewRuleClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [method, setMethod] = useState<"GET" | "POST">("POST");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const computedId = useMemo(() => {
    if (idEdited) return id;
    return slugify(name);
  }, [name, id, idEdited]);

  async function create() {
    if (!name.trim() || !computedId.trim() || !endpoint.trim()) {
      toast.error("Name and endpoint are required");
      return;
    }
    const rule: Rule = {
      id: computedId,
      name: name.trim(),
      description: description.trim() || undefined,
      endpoint: endpoint.trim(),
      method,
      status: "draft",
      currentVersion: 1,
      inputSchema: EMPTY_OBJECT_SCHEMA,
      outputSchema: EMPTY_OBJECT_SCHEMA,
      contextSchema: EMPTY_OBJECT_SCHEMA,
      instances: [
        { instanceId: "n-input", nodeId: "node-input", position: { x: 80, y: 240 }, label: "Start" },
        { instanceId: "n-output", nodeId: "node-output", position: { x: 720, y: 240 }, label: "End" },
      ],
      edges: [
        { id: "e-1", source: "n-input", target: "n-output", branch: "default" },
      ],
      bindings: {},
      tests: [],
      updatedAt: new Date().toISOString(),
    };

    setBusy(true);
    try {
      const res = await fetch(`/api/rules/${encodeURIComponent(rule.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rule),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to create rule");
        return;
      }
      toast.success("Rule created");
      router.push(`/rules/${encodeURIComponent(rule.id)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New rule"
        eyebrow="Rules"
        description="Give your rule a name and an endpoint. You'll define its schema and wire up nodes in the editor."
      />
      <div className="flex-1 overflow-auto bg-muted/30">
        <div className="max-w-2xl mx-auto px-8 py-8">
          <div className="rounded-lg border bg-card shadow-sm p-6 flex flex-col gap-5">
            <FieldRow label="Name" hint="Human-readable. Shows in lists and the editor toolbar.">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Passenger validation — type vs DOB"
                autoFocus
              />
            </FieldRow>

            <FieldRow label="ID" hint="URL-safe slug. Used as the folder name on disk.">
              <Input
                value={idEdited ? id : computedId}
                onChange={(e) => { setId(e.target.value); setIdEdited(true); }}
                placeholder="pax-validation"
                className="font-mono"
              />
            </FieldRow>

            <FieldRow label="Description">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this rule do? Optional but recommended."
              />
            </FieldRow>

            <div className="grid grid-cols-[100px_1fr] gap-3">
              <FieldRow label="Method">
                <Select value={method} onChange={(e) => setMethod(e.target.value as "GET" | "POST")}>
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                </Select>
              </FieldRow>
              <FieldRow label="Endpoint" hint="Path the engine exposes — e.g. /v1/validate/passengers">
                <Input
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="/v1/your/endpoint"
                  className="font-mono"
                />
              </FieldRow>
            </div>

            <div className="rounded-md border border-dashed bg-muted/30 px-3.5 py-3 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                The rule starts with empty input/output schemas and a minimal Input → Output graph.
                Define your schema in the editor's <span className="font-medium text-foreground">Schema tab</span>,
                then drag nodes from the right palette and bind their ports to your schema paths.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button className="btn ghost sm" onClick={() => router.push("/rules")} disabled={busy}>
                Cancel
              </button>
              <button className="btn primary sm" onClick={create} disabled={busy || !name.trim() || !computedId.trim() || !endpoint.trim()}>
                Create rule <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-[12px] font-medium text-foreground">{label}</label>
        {hint ? <span className="text-[10.5px] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}
