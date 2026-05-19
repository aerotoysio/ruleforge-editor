"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Save, Trash2, Plus, X, AlertTriangle } from "lucide-react";
import type { NodeDef, NodePort, NodeOutput, NodeCategory, NodePortType, EdgeBranch } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PageHeader } from "@/components/ui/PageHeader";
import { slugify } from "@/lib/slug";

// All 20 categories the engine currently implements (per ENGINE_CAPABILITIES.md).
// `supported` is now a historic flag — we keep it but everything's supported.
const CATEGORIES: { value: NodeCategory; label: string; supported: boolean }[] = [
  { value: "input",     label: "Input",      supported: true },
  { value: "output",    label: "Output",     supported: true },
  { value: "constant",  label: "Constant",   supported: true },
  { value: "product",   label: "Product",    supported: true },
  { value: "mutator",   label: "Mutator",    supported: true },
  { value: "filter",    label: "Filter",     supported: true },
  { value: "logic",     label: "Logic",      supported: true },
  { value: "switch",    label: "Switch",     supported: true },
  { value: "assert",    label: "Assert",     supported: true },
  { value: "bucket",    label: "Bucket",     supported: true },
  { value: "calc",      label: "Calc",       supported: true },
  { value: "reference", label: "Reference",  supported: true },
  { value: "api",       label: "API",        supported: true },
  { value: "iterator",  label: "Iterator",   supported: true },
  { value: "merge",     label: "Merge",      supported: true },
  { value: "sort",      label: "Sort",       supported: true },
  { value: "limit",     label: "Limit",      supported: true },
  { value: "distinct",  label: "Distinct",   supported: true },
  { value: "groupBy",   label: "Group by",   supported: true },
  { value: "ruleRef",   label: "Sub-rule",   supported: true },
];

const PORT_TYPES: NodePortType[] = [
  "string", "number", "integer", "boolean", "date", "any",
  "string-array", "number-array", "object", "object-array", "reference",
];

type Mode = { kind: "new" } | { kind: "edit"; isSeed: boolean };

type Props = {
  initial?: NodeDef;
  mode: Mode;
};

const EMPTY_NODE: NodeDef = {
  id: "",
  name: "",
  description: "",
  category: "filter",
  ports: { inputs: [], params: [], outputs: [] },
  defaults: {},
  ui: { badge: "", icon: "", accent: "#64748b" },
  tags: [],
  updatedAt: new Date(0).toISOString(),
};

export function NodeDefEditor({ initial, mode }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<NodeDef>(initial ?? EMPTY_NODE);
  const [idEdited, setIdEdited] = useState(mode.kind === "edit");
  const [busy, setBusy] = useState(false);

  const computedId = useMemo(() => {
    if (idEdited) return draft.id;
    const s = slugify(draft.name);
    return s ? `node-${s}` : "";
  }, [draft.name, draft.id, idEdited]);

  const id = mode.kind === "new" ? computedId : draft.id;
  const isUnsupported = !CATEGORIES.find((c) => c.value === draft.category)?.supported;

  function patch(p: Partial<NodeDef>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function patchPorts(p: Partial<NodeDef["ports"]>) {
    setDraft((d) => ({ ...d, ports: { ...d.ports, ...p } }));
  }

  function patchUi(p: Partial<NonNullable<NodeDef["ui"]>>) {
    setDraft((d) => ({ ...d, ui: { ...d.ui, ...p } }));
  }

  async function save() {
    if (!draft.name.trim() || !id.trim()) {
      toast.error("Name and id are required");
      return;
    }
    const payload: NodeDef = { ...draft, id, name: draft.name.trim(), updatedAt: new Date().toISOString() };
    setBusy(true);
    try {
      const url = mode.kind === "new" ? "/api/nodes" : `/api/nodes/${encodeURIComponent(id)}`;
      const method = mode.kind === "new" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Save failed");
        return;
      }
      toast.success(mode.kind === "new" ? "Node created" : "Node saved");
      if (mode.kind === "new") router.push(`/nodes/${encodeURIComponent(id)}`);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete node "${draft.name}"? Rules referencing it will keep working but show a "missing node" placeholder.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/nodes/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Delete failed");
        return;
      }
      toast.success("Node deleted");
      router.push("/nodes");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/nodes" className="hover:text-foreground transition-colors inline-flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Nodes
          </Link>
        }
        title={mode.kind === "new" ? "New node" : draft.name || "Untitled node"}
        description={mode.kind === "new"
          ? "Define a new business-intention building block. You'll be able to drag it onto any rule canvas."
          : "Edit the node's metadata, ports, and defaults. Rules referencing this node pick up changes immediately."}
        actions={
          <div className="flex items-center gap-2">
            {mode.kind === "edit" && !mode.isSeed ? (
              <Button variant="ghost" size="sm" onClick={remove} disabled={busy} className="text-destructive">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            ) : null}
            <Button variant="default" size="sm" onClick={save} disabled={busy}>
              <Save className="w-3.5 h-3.5" /> {mode.kind === "new" ? "Create" : "Save"}
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-auto" style={{ background: "var(--bg)" }}>
        <div className="max-w-3xl mx-auto px-8 py-8 flex flex-col gap-5">
          {mode.kind === "edit" && mode.isSeed ? (
            <div
              style={{
                border: "1px solid var(--accent-soft)",
                background: "var(--accent-soft)",
                borderRadius: 8,
                padding: "10px 14px",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <AlertTriangle
                className="w-4 h-4 shrink-0"
                style={{ marginTop: 2, color: "var(--accent)" }}
              />
              <div style={{ fontSize: 12, color: "var(--accent)", lineHeight: 1.5 }}>
                <strong>Built-in node.</strong> Saving creates a workspace-local override at{" "}
                <code style={{ fontFamily: "var(--font-mono)" }}>/nodes/{id}.json</code>.{" "}
                Future updates to the seed library won&rsquo;t replace your override.
              </div>
            </div>
          ) : null}

          {isUnsupported ? (
            <div
              style={{
                border: "1px solid var(--warn-soft)",
                background: "var(--warn-soft)",
                borderRadius: 8,
                padding: "10px 14px",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <AlertTriangle
                className="w-4 h-4 shrink-0"
                style={{ marginTop: 2, color: "var(--warn)" }}
              />
              <div style={{ fontSize: 12, color: "var(--warn)", lineHeight: 1.5 }}>
                <strong>Pending engine support.</strong> The{" "}
                <code style={{ fontFamily: "var(--font-mono)" }}>{draft.category}</code> category is declared
                but currently throws at evaluation time. You can author against it; rules will load but won&rsquo;t run until the engine ships
                support.
              </div>
            </div>
          ) : null}

          {/* Basics */}
          <Section title="Basics">
            <FieldRow label="Name" hint="Human-readable, shown in the palette and rule editor.">
              <Input
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="String filter — is one of"
                autoFocus={mode.kind === "new"}
              />
            </FieldRow>
            <FieldRow label="ID" hint="URL-safe slug. Used as the filename.">
              <Input
                value={id}
                onChange={(e) => { patch({ id: e.target.value }); setIdEdited(true); }}
                placeholder="node-filter-string-in"
                className="font-mono"
                disabled={mode.kind === "edit"}
              />
            </FieldRow>
            <FieldRow label="Description" hint="Plain-language explanation of what this node does for a business user.">
              <textarea
                rows={2}
                className="w-full text-[13px] px-2.5 py-1.5 rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-foreground/30"
                value={draft.description ?? ""}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="Pass when source's string value matches one of the literal options."
              />
            </FieldRow>
            <FieldRow label="Category">
              <Select value={draft.category} onChange={(e) => patch({ category: e.target.value as NodeCategory })}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}{c.supported ? "" : " (pending engine support)"}
                  </option>
                ))}
              </Select>
            </FieldRow>
          </Section>

          {/* Display */}
          <Section title="Display">
            <div className="grid grid-cols-[1fr_140px_140px] gap-3">
              <FieldRow label="Badge" hint="Short tag shown on the node header (≤4 chars looks best).">
                <Input
                  value={draft.ui?.badge ?? ""}
                  onChange={(e) => patchUi({ badge: e.target.value })}
                  placeholder="STR"
                  className="font-mono"
                />
              </FieldRow>
              <FieldRow label="Icon" hint="lucide name">
                <Input
                  value={draft.ui?.icon ?? ""}
                  onChange={(e) => patchUi({ icon: e.target.value })}
                  placeholder="filter"
                  className="font-mono"
                />
              </FieldRow>
              <FieldRow label="Accent" hint="hex">
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={draft.ui?.accent ?? "#64748b"}
                    onChange={(e) => patchUi({ accent: e.target.value })}
                    className="w-9 h-9 rounded border border-border bg-background cursor-pointer"
                  />
                  <Input
                    value={draft.ui?.accent ?? ""}
                    onChange={(e) => patchUi({ accent: e.target.value })}
                    className="font-mono"
                  />
                </div>
              </FieldRow>
            </div>
          </Section>

          {/* Ports — Inputs */}
          <Section
            title="Inputs"
            subtitle="Path-bound ports: each rule wires these to a JSONPath in its input/context schema."
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => patchPorts({ inputs: [...(draft.ports.inputs ?? []), { name: "", type: "any" }] })}
              >
                <Plus className="w-3 h-3" /> Add input
              </Button>
            }
          >
            <PortList
              ports={draft.ports.inputs ?? []}
              onChange={(inputs) => patchPorts({ inputs })}
            />
          </Section>

          {/* Ports — Params */}
          <Section
            title="Parameters"
            subtitle="Literal-bound ports: each rule sets these to a fixed value or reference."
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => patchPorts({ params: [...(draft.ports.params ?? []), { name: "", type: "string" }] })}
              >
                <Plus className="w-3 h-3" /> Add param
              </Button>
            }
          >
            <PortList
              ports={draft.ports.params ?? []}
              onChange={(params) => patchPorts({ params })}
            />
          </Section>

          {/* Outputs */}
          <Section
            title="Outputs / branches"
            subtitle="Edges leaving instances of this node carry one of these branches."
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => patchPorts({ outputs: [...(draft.ports.outputs ?? []), { name: "out", branch: "default" }] })}
              >
                <Plus className="w-3 h-3" /> Add output
              </Button>
            }
          >
            <OutputList
              outputs={draft.ports.outputs ?? []}
              onChange={(outputs) => patchPorts({ outputs })}
            />
          </Section>

          {/* Tags */}
          <Section title="Tags">
            <Input
              value={(draft.tags ?? []).join(", ")}
              onChange={(e) => patch({ tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              placeholder="filter, string"
            />
          </Section>
        </div>
      </div>
    </>
  );
}

// ---------- helpers ----------

function Section({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 18px",
          borderBottom: "1px solid var(--border)",
          background: "var(--panel-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          <div className="field-label">{title}</div>
          {subtitle ? (
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{subtitle}</div>
          ) : null}
        </div>
        {action}
      </div>
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
    </div>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-[11.5px] font-medium text-foreground">{label}</label>
        {hint ? <span className="text-[10.5px] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function PortList({ ports, onChange }: { ports: NodePort[]; onChange: (next: NodePort[]) => void }) {
  if (ports.length === 0) {
    return <div className="text-[11.5px] text-muted-foreground italic px-1 py-1">No ports yet — click Add above.</div>;
  }
  return (
    <div className="flex flex-col gap-2">
      {ports.map((port, i) => (
        <div key={i} className="grid grid-cols-[140px_120px_auto_1fr_auto] gap-2 items-start rounded-md border bg-background px-2.5 py-2">
          <Input
            value={port.name}
            onChange={(e) => onChange(ports.map((p, j) => (j === i ? { ...p, name: e.target.value } : p)))}
            placeholder="port name"
            className="font-mono text-[12px]"
          />
          <Select
            value={port.type}
            onChange={(e) => onChange(ports.map((p, j) => (j === i ? { ...p, type: e.target.value as NodePortType } : p)))}
          >
            {PORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground px-1.5 h-7">
            <input
              type="checkbox"
              checked={!!port.required}
              onChange={(e) => onChange(ports.map((p, j) => (j === i ? { ...p, required: e.target.checked } : p)))}
            />
            req
          </label>
          <Input
            value={port.description ?? ""}
            onChange={(e) => onChange(ports.map((p, j) => (j === i ? { ...p, description: e.target.value || undefined } : p)))}
            placeholder="description (optional)"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange(ports.filter((_, j) => j !== i))}
            title="Remove port"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function OutputList({ outputs, onChange }: { outputs: NodeOutput[]; onChange: (next: NodeOutput[]) => void }) {
  if (outputs.length === 0) {
    return <div className="text-[11.5px] text-muted-foreground italic px-1 py-1">No outputs yet — click Add above.</div>;
  }
  return (
    <div className="flex flex-col gap-2">
      {outputs.map((out, i) => (
        <div key={i} className="grid grid-cols-[140px_120px_1fr_auto] gap-2 items-start rounded-md border bg-background px-2.5 py-2">
          <Input
            value={out.name}
            onChange={(e) => onChange(outputs.map((o, j) => (j === i ? { ...o, name: e.target.value } : o)))}
            placeholder="port name"
            className="font-mono text-[12px]"
          />
          <Select
            value={out.branch ?? "default"}
            onChange={(e) => onChange(outputs.map((o, j) => (j === i ? { ...o, branch: e.target.value as EdgeBranch } : o)))}
          >
            <option value="default">default</option>
            <option value="pass">pass</option>
            <option value="fail">fail</option>
          </Select>
          <Input
            value={out.description ?? ""}
            onChange={(e) => onChange(outputs.map((o, j) => (j === i ? { ...o, description: e.target.value || undefined } : o)))}
            placeholder="description (optional)"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange(outputs.filter((_, j) => j !== i))}
            title="Remove output"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
