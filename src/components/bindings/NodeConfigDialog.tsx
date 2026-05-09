"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Check, Wand2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { useRuleStore } from "@/lib/store/rule-store";
import { useNodesStore } from "@/lib/store/nodes-store";
import { useReferencesStore } from "@/lib/store/references-store";
import { ShuttlePicker, type ShuttleItem } from "./ShuttlePicker";
import { DateBindingPicker } from "./DateBindingPicker";
import { MarketsPicker } from "./MarketsPicker";
import { TemplateFillEditor } from "./TemplateFillEditor";
import { walkSchema, type SchemaPathNode } from "@/lib/schema/path-walker";
import { cn } from "@/lib/utils";
import type { JsonSchema, NodePort, PortBinding } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  instanceId: string;
};

/**
 * Single popup that configures an entire filter node — all ports inline as
 * form sections, one Save commits everything. Replaces the per-port
 * BindingPickerDialog for filter nodes.
 *
 *   Section 1: "Field to test"      — source port (path picker)
 *   Section 2: "Values" (or similar) — literal / match port
 *   Section 3: "Advanced" (collapsed) — onMissing, arraySelector, etc.
 *
 * For non-filter nodes we'd compose the same way, just labelled differently
 * — for now this is filter-only.
 */
export function NodeConfigDialog({ open, onClose, instanceId }: Props) {
  const rule = useRuleStore((s) => s.rule);
  const nodeDefs = useNodesStore((s) => s.nodes);
  const setNodeBindings = useRuleStore((s) => s.setNodeBindings);
  const updateInstance = useRuleStore((s) => s.updateInstance);
  const removeInstance = useRuleStore((s) => s.removeInstance);
  const select = useRuleStore((s) => s.select);

  const instance = rule?.instances.find((i) => i.instanceId === instanceId);
  const def = instance ? nodeDefs.find((n) => n.id === instance.nodeId) : undefined;
  const initialBindings = rule?.bindings[instanceId];

  // Local draft — committed only on Save. Includes label and description
  // edits so renames don't escape via accidental close.
  const [draft, setDraft] = useState<Record<string, PortBinding>>(initialBindings?.bindings ?? {});
  const [labelDraft, setLabelDraft] = useState<string>(instance?.label ?? "");
  const [descriptionDraft, setDescriptionDraft] = useState<string>(instance?.description ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(initialBindings?.bindings ?? {});
      setLabelDraft(instance?.label ?? "");
      setDescriptionDraft(instance?.description ?? "");
      setAdvancedOpen(false);
    }
  }, [open, initialBindings, instance?.label, instance?.description]);

  if (!rule || !instance || !def) return null;

  // Categorise ports: primary (visible by default) vs advanced (collapsed).
  // arraySelector is a primary business choice ("any pax is gold" vs "every
  // pax is gold" vs "no pax is gold") — not advanced. caseInsensitive / trim /
  // onMissing are recovery / formatting toggles, hide them by default.
  const ADVANCED_NAMES = new Set(["onMissing", "caseInsensitive", "trim"]);
  const allPorts = [...(def.ports.inputs ?? []), ...(def.ports.params ?? [])];
  const primary = allPorts.filter((p) => !ADVANCED_NAMES.has(p.name));
  const advanced = allPorts.filter((p) => ADVANCED_NAMES.has(p.name));

  function setBinding(portName: string, b: PortBinding | null) {
    setDraft((prev) => {
      const next = { ...prev };
      if (b === null) delete next[portName];
      else next[portName] = b;
      return next;
    });
  }

  function commit() {
    // Persist bindings
    setNodeBindings(instanceId, {
      instanceId,
      ruleId: rule!.id,
      bindings: draft,
      extras: initialBindings?.extras,
    });
    // Persist label/description on the instance. Trim and treat empty as
    // "unset" — that way a wiped field falls back to def.name on display.
    const trimmedLabel = labelDraft.trim();
    const trimmedDesc = descriptionDraft.trim();
    if ((instance!.label ?? "") !== trimmedLabel || (instance!.description ?? "") !== trimmedDesc) {
      updateInstance(instanceId, (i) => ({
        ...i,
        label: trimmedLabel || undefined,
        description: trimmedDesc || undefined,
      }));
    }
    onClose();
  }

  // Guard against accidental close-with-unsaved-changes — Esc or backdrop click
  // would otherwise silently discard the draft.
  const hasUnsavedChanges =
    !shallowEqualBindings(draft, initialBindings?.bindings ?? {}) ||
    (instance.label ?? "") !== labelDraft.trim() ||
    (instance.description ?? "") !== descriptionDraft.trim();

  function tryClose() {
    if (hasUnsavedChanges) {
      const ok = confirm("You have unsaved changes. Close without saving?");
      if (!ok) return;
    }
    onClose();
  }

  const accent = def.ui?.accent ?? "#64748b";
  const badge = def.ui?.badge ?? "?";

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) tryClose(); }}>
      <DialogContent className="max-w-[900px] sm:max-w-[900px] p-0 gap-0 flex flex-col h-[640px]">
        {/* Header */}
        <header className="px-5 pr-12 py-3 border-b shrink-0 flex items-center gap-3 bg-card">
          <span
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-[10px] font-bold font-mono tracking-wide shrink-0"
            style={{ background: accent, color: "#fff" }}
          >
            {badge}
          </span>
          <div className="flex flex-col leading-tight min-w-0 flex-1">
            <DialogTitle className="text-[15px] font-semibold tracking-tight text-foreground">
              {instance.label ?? def.name}
            </DialogTitle>
            <DialogDescription className="text-[12px] text-muted-foreground mt-0.5 max-w-prose line-clamp-2">
              {def.description ?? `Configure this ${def.category} node.`}
            </DialogDescription>
          </div>
        </header>

        {/* Body — sections per port. For nodes with no configurable ports
            (rare — terminals, simple merge), show a friendly empty state. */}
        <div className="flex-1 overflow-auto px-6 py-5 flex flex-col gap-5">
          {/* Identity — label + description. These travel with the node-instance
              (not the bindings), so a third-party reading the canvas can scan
              "filter for AU market" without opening every node. Default placeholder
              uses def.name so an unedited card still reads sensibly. */}
          <section className="flex flex-col gap-2">
            <label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/80 font-semibold">
              Identity
            </label>
            <div className="flex flex-col gap-1.5">
              <Input
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                placeholder={def.name}
                className="h-8 text-[13px] font-medium"
                aria-label="Node label"
              />
              <textarea
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                placeholder={`What does this ${def.category} do in this rule? (e.g. "Filter for AU market" — shown on the canvas card)`}
                rows={2}
                className="w-full text-[12.5px] leading-snug rounded-md border border-input bg-background px-3 py-1.5 outline-none focus:ring-2 focus:ring-foreground/20 placeholder:text-muted-foreground/70 resize-y min-h-[44px] max-h-[120px]"
                aria-label="Node description"
              />
            </div>
            <p className="text-[10.5px] text-muted-foreground/70">
              Label and description are per-instance. The default label is the node-def name; the description shows on the canvas card so the rule reads as prose.
            </p>
          </section>

          {primary.length === 0 && advanced.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/30 px-4 py-6 text-center">
              <p className="text-[13px] text-foreground font-medium">No ports to wire up</p>
              <p className="text-[11.5px] text-muted-foreground mt-1 max-w-sm mx-auto">
                This node has no configurable ports — it works the same in every rule.
                Edit its label and description above, or remove it via the Delete button below.
              </p>
            </div>
          ) : null}
          {primary.map((port) => (
            <PortSection
              key={port.name}
              port={port}
              binding={draft[port.name]}
              onChange={(b) => setBinding(port.name, b)}
              inputSchema={rule.inputSchema}
            />
          ))}

          {advanced.length > 0 ? (
            <div className="border-t pt-4">
              <button
                type="button"
                onClick={() => setAdvancedOpen((o) => !o)}
                className="flex items-center gap-1.5 text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground/80 font-semibold hover:text-foreground transition-colors"
              >
                {advancedOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Advanced
              </button>
              {advancedOpen ? (
                <div className="mt-3 flex flex-col gap-4">
                  {advanced.map((port) => (
                    <PortSection
                      key={port.name}
                      port={port}
                      binding={draft[port.name]}
                      onChange={(b) => setBinding(port.name, b)}
                      inputSchema={rule.inputSchema}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <footer className="px-5 py-3 border-t shrink-0 flex items-center bg-muted/20 gap-2">
          {/* Delete on the left, padded away from save-cancel */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (!confirm(`Delete "${instance.label ?? def.name}" from this rule?`)) return;
              removeInstance(instanceId);
              select({ kind: "none" });
              onClose();
            }}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>

          <span className="text-[10.5px] text-muted-foreground ml-3 hidden md:inline">
            Saves to the rule in memory. Hit <strong>Save</strong> in the toolbar to persist to disk.
          </span>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={tryClose}>Cancel</Button>
            <Button variant="default" size="sm" onClick={commit} disabled={!hasUnsavedChanges}>
              <Check className="w-3.5 h-3.5" /> {hasUnsavedChanges ? "Save" : "Saved"}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------
// Per-port inline section — picks the right editor based on type.
// ------------------------------------------------------------------

function PortSection({
  port,
  binding,
  onChange,
  inputSchema,
}: {
  port: NodePort;
  binding: PortBinding | undefined;
  onChange: (b: PortBinding | null) => void;
  inputSchema: JsonSchema;
}) {
  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-baseline gap-2">
        <span className="text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground/80 font-semibold">
          {humanLabel(port.name)}
        </span>
        {port.required ? (
          <span className="text-[9.5px] uppercase tracking-wider px-1 h-3.5 inline-flex items-center rounded bg-red-50 text-red-700 border border-red-200 font-medium dark:bg-red-950/30 dark:text-red-300 dark:border-red-900">
            req
          </span>
        ) : null}
      </header>
      {port.description ? (
        <p className="text-[12px] text-muted-foreground -mt-1 leading-relaxed">{port.description}</p>
      ) : null}
      <PortEditor port={port} binding={binding} onChange={onChange} inputSchema={inputSchema} />
    </section>
  );
}

function PortEditor({
  port,
  binding,
  onChange,
  inputSchema,
}: {
  port: NodePort;
  binding: PortBinding | undefined;
  onChange: (b: PortBinding | null) => void;
  inputSchema: JsonSchema;
}) {
  // Port supports template-fill (e.g. constant node's value port).
  // Render a "From template" / "Free literal" toggle when both kinds are
  // allowed, or go straight to the template-fill editor when it's the only
  // option. The literal side falls through to the rest of this function.
  const allowsTemplate = port.bindingKinds?.includes("template-fill") ?? false;
  if (allowsTemplate) {
    return (
      <TemplatePortEditor
        port={port}
        binding={binding}
        onChange={onChange}
        inputSchema={inputSchema}
      />
    );
  }

  // Enum string param → button group
  if (port.enum && port.enum.length > 0) {
    const value = binding?.kind === "literal" ? binding.value : undefined;
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {port.enum.map((opt) => {
          const isActive = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ kind: "literal", value: opt.value })}
              className={cn(
                "text-left flex flex-col gap-0.5 px-3 py-2 rounded-md border transition-colors",
                isActive
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card border-border hover:border-foreground/30",
              )}
            >
              <span className="text-[12.5px] font-medium leading-tight">{opt.label}</span>
              {opt.description ? (
                <span className={cn("text-[10.5px] leading-snug", isActive ? "opacity-80" : "text-muted-foreground")}>
                  {opt.description}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  // Date port
  if (port.type === "date") {
    // If binding is path/context → render a schema tree to pick a date field.
    // If binding is a date predicate → DateBindingPicker.
    // Use bindingKinds to decide what's primary.
    const allowsField = !port.bindingKinds || port.bindingKinds.includes("path") || port.bindingKinds.includes("context");
    const allowsDateMode = !port.bindingKinds || port.bindingKinds.includes("date");
    const primary: "field" | "date" = port.bindingKinds?.[0] === "date" ? "date" : allowsField ? "field" : "date";

    if (primary === "field") {
      return (
        <SchemaFieldPicker
          schema={inputSchema}
          port={port}
          value={binding?.kind === "path" ? binding.path : ""}
          onPick={(p) => onChange({ kind: "path", path: p })}
        />
      );
    }
    return (
      <DateBindingPicker
        value={binding?.kind === "date" ? binding : { kind: "date", mode: "absolute", date: new Date().toISOString().slice(0, 10) }}
        onChange={(next) => onChange(next)}
      />
    );
  }

  // Number / integer port
  if (port.type === "number" || port.type === "integer") {
    // If port allows path, prefer the schema picker. Otherwise number input.
    if (!port.bindingKinds || port.bindingKinds.includes("path")) {
      return (
        <SchemaFieldPicker
          schema={inputSchema}
          port={port}
          value={binding?.kind === "path" ? binding.path : ""}
          onPick={(p) => onChange({ kind: "path", path: p })}
        />
      );
    }
    return (
      <Input
        type="number"
        value={binding?.kind === "literal" && typeof binding.value === "number" ? binding.value : ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange({ kind: "literal", value: v === "" ? "" : Number(v) });
        }}
        placeholder="0"
      />
    );
  }

  // String / object-array source ports → schema field picker
  if (port.type === "string" || port.type === "object-array" || port.type === "object") {
    if (!port.bindingKinds || port.bindingKinds.includes("path")) {
      return (
        <SchemaFieldPicker
          schema={inputSchema}
          port={port}
          value={binding?.kind === "path" ? binding.path : ""}
          onPick={(p) => onChange({ kind: "path", path: p })}
        />
      );
    }
  }

  // string-array / number-array — values port. Shuttle for ref-select, otherwise textarea.
  if (port.type === "string-array" || port.type === "number-array") {
    return (
      <ArrayValuesEditor
        port={port}
        binding={binding}
        onChange={onChange}
      />
    );
  }

  // Boolean
  if (port.type === "boolean") {
    const value = binding?.kind === "literal" ? binding.value : undefined;
    return (
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => onChange({ kind: "literal", value: true })}
          className={cn(
            "h-8 px-3 text-[12px] font-medium rounded-md border transition-colors",
            value === true ? "bg-foreground text-background border-foreground" : "bg-card border-border hover:border-foreground/30",
          )}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange({ kind: "literal", value: false })}
          className={cn(
            "h-8 px-3 text-[12px] font-medium rounded-md border transition-colors",
            value === false ? "bg-foreground text-background border-foreground" : "bg-card border-border hover:border-foreground/30",
          )}
        >
          No
        </button>
      </div>
    );
  }

  // Fallback: free text
  return (
    <Input
      value={binding?.kind === "literal" && typeof binding.value === "string" ? binding.value : ""}
      onChange={(e) => onChange({ kind: "literal", value: e.target.value })}
      placeholder="value"
    />
  );
}

// ------------------------------------------------------------------
// Template-fill editor — toggle between picking a template and authoring
// a free-form object literal. Pairs with `node-constant.value`.
// ------------------------------------------------------------------

function TemplatePortEditor({
  port,
  binding,
  onChange,
  inputSchema,
}: {
  port: NodePort;
  binding: PortBinding | undefined;
  onChange: (b: PortBinding | null) => void;
  inputSchema: JsonSchema;
}) {
  const allowsLiteral = port.bindingKinds?.includes("literal") ?? false;
  const showToggle = allowsLiteral; // template-fill is implied by being here
  const isTemplate = binding?.kind === "template-fill" || (binding == null && !allowsLiteral);

  function pickTemplateMode() {
    if (binding?.kind !== "template-fill") {
      onChange({ kind: "template-fill", templateId: "", fields: {} });
    }
  }
  function pickLiteralMode() {
    if (binding?.kind !== "literal") {
      onChange({ kind: "literal", value: {} });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {showToggle ? (
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5 self-start">
          <button
            type="button"
            onClick={pickTemplateMode}
            className={cn(
              "px-3 h-7 text-[12px] font-medium rounded transition-colors",
              isTemplate ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            From template
          </button>
          <button
            type="button"
            onClick={pickLiteralMode}
            className={cn(
              "px-3 h-7 text-[12px] font-medium rounded transition-colors",
              !isTemplate ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Free literal
          </button>
        </div>
      ) : null}

      {isTemplate ? (
        <TemplateFillEditor
          value={
            binding?.kind === "template-fill"
              ? binding
              : { kind: "template-fill", templateId: "", fields: {} }
          }
          onChange={(b) => onChange(b)}
          inputSchema={inputSchema}
        />
      ) : (
        // Literal mode for object/any ports — let the user paste a JSON blob.
        // Keep it simple here; ObjectShapeEditor (key/value with inline binding
        // kind) is the bigger fallback if we want it later. For now a JSON
        // textarea keeps the surface small.
        <textarea
          rows={6}
          className="w-full text-[12px] font-mono px-2.5 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-foreground/30"
          value={
            binding?.kind === "literal"
              ? typeof binding.value === "string"
                ? binding.value
                : JSON.stringify(binding.value, null, 2)
              : ""
          }
          onChange={(e) => {
            const txt = e.target.value;
            // Try JSON first; fall back to a string literal so the user can
            // type freely without parse errors blocking each keystroke.
            try {
              const parsed = JSON.parse(txt);
              onChange({ kind: "literal", value: parsed });
            } catch {
              onChange({ kind: "literal", value: txt });
            }
          }}
          placeholder='{ "type": "BAG", "amount": 50, … }'
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Schema field picker — compact tree with hint-driven chip strip
// ------------------------------------------------------------------

function SchemaFieldPicker({
  schema,
  port,
  value,
  onPick,
}: {
  schema: JsonSchema;
  port: NodePort;
  value: string;
  onPick: (p: string) => void;
}) {
  const tree = useMemo(() => walkSchema(schema, "$"), [schema]);
  const [filter, setFilter] = useState("");
  const f = filter.trim().toLowerCase();

  const compatibleChoices = useMemo(() => {
    const flat: SchemaPathNode[] = [];
    const visit = (n: SchemaPathNode) => {
      if (n.depth > 0 && portTypeMatches(n, port.type)) flat.push(n);
      n.children?.forEach(visit);
    };
    if (tree) visit(tree);
    if (f) return flat.filter((n) => n.path.toLowerCase().includes(f) || n.label.toLowerCase().includes(f));
    return flat;
  }, [tree, port.type, f]);

  const suggested = useMemo(() => {
    if (!port.hint || compatibleChoices.length === 0) return [];
    const namePattern = port.hint.namePattern ? new RegExp(port.hint.namePattern, "i") : null;
    const fieldPattern = port.hint.fieldHint ? new RegExp(port.hint.fieldHint, "i") : null;
    return compatibleChoices.filter((n) => {
      const segments = n.path.split(/[.\[\]]+/);
      const last = segments[segments.length - 1] || segments[segments.length - 2] || "";
      if (fieldPattern && fieldPattern.test(last)) return true;
      if (namePattern && segments.some((s) => namePattern.test(s))) return true;
      return false;
    }).slice(0, 6);
  }, [port.hint, compatibleChoices]);

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={value}
        onChange={(e) => onPick(e.target.value)}
        placeholder="$.field.path"
        className="font-mono"
      />
      {suggested.length > 0 ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Wand2 className="w-2.5 h-2.5 text-amber-500" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium mr-1">Best match:</span>
          {suggested.map((n) => (
            <button
              key={n.path}
              onClick={() => onPick(n.path)}
              className={cn(
                "font-mono text-[10.5px] px-1.5 h-5 rounded border transition-colors max-w-[60%] truncate",
                value === n.path
                  ? "bg-foreground text-background border-foreground"
                  : "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900",
              )}
            >
              {n.path}
            </button>
          ))}
        </div>
      ) : null}
      <div className="rounded-md border bg-card max-h-[200px] overflow-auto">
        <div className="px-2 py-1.5 border-b bg-muted/30 sticky top-0">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search fields…"
            className="h-7 text-[11.5px]"
          />
        </div>
        <div className="p-1">
          {tree ? (
            <SchemaTreeNode
              node={tree}
              selectedPath={value}
              onPick={onPick}
              portType={port.type}
              filter={f}
            />
          ) : (
            <div className="px-2 py-2 text-[11.5px] text-muted-foreground italic">No schema yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SchemaTreeNode({
  node,
  selectedPath,
  onPick,
  portType,
  filter,
}: {
  node: SchemaPathNode;
  selectedPath: string;
  onPick: (path: string) => void;
  portType: NodePort["type"];
  filter: string;
}) {
  const isRoot = node.depth === 0;
  const compatible = portTypeMatches(node, portType);
  const matchesFilter = !filter || node.path.toLowerCase().includes(filter) || node.label.toLowerCase().includes(filter);
  if (filter && !(matchesFilter || hasMatchingChild(node, filter))) return null;
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isSelected = node.path === selectedPath;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => compatible && !isRoot && onPick(node.path)}
        disabled={!compatible || isRoot}
        className={cn(
          "text-left flex items-center gap-2 px-1.5 py-1 rounded text-[12px] transition-colors",
          isSelected ? "bg-foreground text-background"
          : isRoot ? "text-muted-foreground/70 cursor-default font-semibold uppercase tracking-wide text-[10px]"
          : compatible ? "hover:bg-muted/60 text-foreground"
          : "text-muted-foreground/50 cursor-not-allowed",
        )}
        style={{ paddingLeft: 6 + node.depth * 12 }}
      >
        <span className={cn("font-mono truncate", isRoot ? "" : "text-[11.5px]")}>{isRoot ? "request" : node.label}</span>
        {!isRoot ? (
          <span className={cn("text-[10px] tabular-nums ml-auto pl-2", isSelected ? "opacity-80" : "text-muted-foreground/70")}>
            {prettyTypeOf(node)}
          </span>
        ) : null}
      </button>
      {hasChildren && node.children!.map((child, i) => (
        <SchemaTreeNode key={i} node={child} selectedPath={selectedPath} onPick={onPick} portType={portType} filter={filter} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------
// Array values editor — shuttle (from ref) or textarea (literal)
// ------------------------------------------------------------------

function ArrayValuesEditor({
  port,
  binding,
  onChange,
}: {
  port: NodePort;
  binding: PortBinding | undefined;
  onChange: (b: PortBinding) => void;
}) {
  const loaded = useReferencesStore((s) => s.loaded);
  const load = useReferencesStore((s) => s.load);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const allowsRefSelect = !port.bindingKinds || port.bindingKinds.includes("ref-select");
  const allowsLiteral = !port.bindingKinds || port.bindingKinds.includes("literal");
  const allowsMarkets = !!port.bindingKinds && port.bindingKinds.includes("markets-select");

  // If the port is markets-only (e.g. node-filter-markets.literal), render the
  // markets picker directly — no mode toggle.
  if (allowsMarkets && !allowsRefSelect && !allowsLiteral) {
    const seed: Extract<PortBinding, { kind: "markets-select" }> =
      binding?.kind === "markets-select"
        ? binding
        : { kind: "markets-select", referenceId: "ref-airports", valueColumn: "code", include: [], exclude: [] };
    return <MarketsPicker value={seed} onChange={(b) => onChange(b)} />;
  }

  // When the port has a `defaultRef` and the user hasn't picked anything yet,
  // act as if "From reference" was already selected with the default table —
  // ref-bound filters (cabin, pax-type) open straight to the picker so the
  // user doesn't have to swap tabs. The binding only commits to the draft
  // when the user actually edits something in the picker.
  const effectiveBinding =
    binding ??
    (port.defaultRef && allowsRefSelect
      ? {
          kind: "ref-select" as const,
          referenceId: port.defaultRef.referenceId,
          valueColumn: port.defaultRef.valueColumn ?? "",
        }
      : undefined);
  const isRefSelect = effectiveBinding?.kind === "ref-select";

  return (
    <div className="flex flex-col gap-2">
      {(allowsRefSelect && allowsLiteral) ? (
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5 self-start">
          <button
            type="button"
            onClick={() => {
              if (binding?.kind !== "literal") onChange({ kind: "literal", value: [] });
            }}
            className={cn(
              "px-3 h-7 text-[12px] font-medium rounded transition-colors",
              !isRefSelect ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Type values
          </button>
          <button
            type="button"
            onClick={() => {
              if (binding?.kind !== "ref-select") {
                // Pre-fill with the port's natural reference if it has one
                // (e.g. cabin filter → ref-cabin-classes). The user can still
                // change the dropdown — this just spares them the question
                // "which table?" for nodes that obviously map to one.
                onChange({
                  kind: "ref-select",
                  referenceId: port.defaultRef?.referenceId ?? "",
                  valueColumn: port.defaultRef?.valueColumn ?? "",
                });
              }
            }}
            className={cn(
              "px-3 h-7 text-[12px] font-medium rounded transition-colors",
              isRefSelect ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            From reference
          </button>
        </div>
      ) : null}

      {isRefSelect ? (
        <RefSelectInline binding={effectiveBinding as Extract<PortBinding, { kind: "ref-select" }>} onChange={(b) => onChange(b)} />
      ) : (
        <textarea
          rows={6}
          className="w-full text-[12px] font-mono px-2.5 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-foreground/30"
          value={
            binding?.kind === "literal" && Array.isArray(binding.value)
              ? (binding.value as Array<string | number>).join("\n")
              : ""
          }
          onChange={(e) => {
            const items = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
            const value = port.type === "number-array" ? items.map(Number) : items;
            onChange({ kind: "literal", value });
          }}
          placeholder={port.type === "number-array" ? "1\n2\n3" : "ADT\nCHD\nINF"}
        />
      )}
    </div>
  );
}

function RefSelectInline({
  binding,
  onChange,
}: {
  binding: Extract<PortBinding, { kind: "ref-select" }>;
  onChange: (b: Extract<PortBinding, { kind: "ref-select" }>) => void;
}) {
  const refs = useReferencesStore((s) => s.references);
  const ref = refs.find((r) => r.id === binding.referenceId);

  // Pick value column auto if not set
  useEffect(() => {
    if (ref && !binding.valueColumn && ref.columns.length > 0) {
      onChange({ ...binding, valueColumn: ref.columns[0] });
    }
  }, [ref, binding, onChange]);

  const items = useMemo<ShuttleItem[]>(() => {
    if (!ref) return [];
    const labelCol = ref.columns.find((c) => ["name", "label", "title"].includes(c.toLowerCase())) ?? ref.columns[1] ?? ref.columns[0];
    const codeCol = binding.valueColumn || ref.columns[0];
    return ref.rows.map((row) => {
      const code = String(row[codeCol] ?? "");
      const label = labelCol && row[labelCol] != null ? String(row[labelCol]) : code;
      return { value: code, label, hint: code !== label ? code : undefined };
    });
  }, [ref, binding.valueColumn]);

  const selected = binding.whereValues ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
        <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">From</span>
        <select
          value={binding.referenceId}
          onChange={(e) =>
            onChange({
              ...binding,
              referenceId: e.target.value,
              valueColumn: "",
              whereColumn: undefined,
              whereValues: undefined,
            })
          }
          className="h-8 text-[12px] px-2 rounded border border-border bg-background"
        >
          <option value="">— choose a reference table —</option>
          {refs.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {ref ? (
        <ShuttlePicker
          items={items}
          selected={selected}
          onChange={(next) => onChange({ ...binding, whereColumn: binding.valueColumn, whereValues: next })}
        />
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------

function portTypeMatches(node: SchemaPathNode, portType: NodePort["type"]): boolean {
  const t = node.type;
  const fmt = node.schema?.format;
  const isDateFormat = fmt === "date" || fmt === "date-time" || fmt === "time";
  if (portType === "any") return true;
  if (portType === "object-array") return t === "array";
  if (portType === "object") return t === "object";
  if (portType === "string-array" || portType === "number-array") return t === "array";
  if (portType === "string") return t === "string" && !isDateFormat;
  if (portType === "number" || portType === "integer") return t === "number" || t === "integer";
  if (portType === "date") return t === "string" && (isDateFormat || !fmt);
  if (portType === "boolean") return t === "boolean";
  return true;
}

function hasMatchingChild(node: SchemaPathNode, filter: string): boolean {
  if (!node.children) return false;
  return node.children.some(
    (c) => c.path.toLowerCase().includes(filter) || c.label.toLowerCase().includes(filter) || hasMatchingChild(c, filter),
  );
}

function prettyTypeOf(node: SchemaPathNode): string {
  const fmt = node.schema?.format;
  if (node.type === "string" && (fmt === "date" || fmt === "date-time")) return "date";
  if (node.type === "string" && fmt === "email") return "email";
  return node.type;
}

function shallowEqualBindings(a: Record<string, PortBinding>, b: Record<string, PortBinding>): boolean {
  // Compare via JSON.stringify of each value — bindings are small structured
  // objects; this is plenty fast and catches deep changes (e.g. include[]).
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!(k in b)) return false;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
  }
  return true;
}

function humanLabel(portName: string): string {
  // Translate engine port names → friendlier headings the user reads.
  const map: Record<string, string> = {
    source: "Field to test",
    match: "What it should match",
    literal: "Values",
    days: "Which weekdays",
    min: "Minimum",
    max: "Maximum",
    target: "Field to update",
    from: "Where the value comes from",
    expression: "Expression",
    referenceId: "Reference table",
    valueColumn: "Column to copy",
    onMissing: "When the field is missing",
    arraySelector: "When source has multiple values",
    caseInsensitive: "Ignore upper/lower case",
    trim: "Trim whitespace",
    mode: "How to combine",
    as: "Loop variable name",
    value: "Value",
  };
  return map[portName] ?? portName;
}
