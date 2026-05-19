"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Check, Wand2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
 * form sections, one Save commits everything.
 *
 *   Section 1: Identity              — label + description (per-instance)
 *   Section 2: Primary ports         — visible by default
 *   Section 3: Advanced (collapsed)  — onMissing / caseInsensitive / trim
 *
 * Styled with the design's popup vocabulary (`.popup-head`, `.popup-body`,
 * `.popup-foot`, `.field-group`, `.field-label`, …). See globals.css for
 * the source-of-truth styling — keep tweaks there, not inline.
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
  // arraySelector is a primary business choice — not advanced. caseInsensitive
  // / trim / onMissing are recovery / formatting toggles, hide them by default.
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
    setNodeBindings(instanceId, {
      instanceId,
      ruleId: rule!.id,
      bindings: draft,
      extras: initialBindings?.extras,
    });
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
      <DialogContent
        className="max-w-[920px] sm:max-w-[920px] p-0 gap-0 flex flex-col h-[660px] overflow-hidden"
        style={{ background: "var(--panel)" }}
      >
        <header className="popup-head">
          <span className="badge" style={{ background: accent }}>
            {badge}
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="title">
              {instance.label ?? def.name}
            </DialogTitle>
            <DialogDescription className="subtitle">
              {def.description ?? `Configure this ${def.category} node.`}
            </DialogDescription>
          </div>
        </header>

        <div className="popup-body">
          {/* Identity — label + description. These travel with the node-instance
              (not the bindings), so a third-party reading the canvas can scan
              "filter for AU market" without opening every node. */}
          <section className="field-group">
            <span className="field-label">Identity</span>
            <input
              className="input"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              placeholder={def.name}
              aria-label="Node label"
            />
            <textarea
              className="json-input"
              style={{ fontFamily: "var(--font-sans)", fontSize: 12, minHeight: 56 }}
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              placeholder={`What does this ${def.category} do in this rule? (e.g. "Filter for AU market")`}
              rows={2}
              aria-label="Node description"
            />
            <p className="field-hint">
              Label and description are per-instance. The default label is the node-def name; the description shows on the canvas card so the rule reads as prose.
            </p>
          </section>

          {primary.length === 0 && advanced.length === 0 ? (
            <div className="struct-rows-empty">
              <strong style={{ color: "var(--text)" }}>No ports to wire up</strong>
              <div style={{ marginTop: 4 }}>
                This node has no configurable ports — it works the same in every rule.
                Edit its label/description above, or remove it via the Delete button below.
              </div>
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
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <button
                type="button"
                onClick={() => setAdvancedOpen((o) => !o)}
                className="field-label"
                style={{ cursor: "pointer", background: "transparent", border: 0, padding: 0 }}
              >
                {advancedOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Advanced
              </button>
              {advancedOpen ? (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 18 }}>
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

        <footer className="popup-foot">
          <button
            type="button"
            className="btn ghost sm"
            style={{ color: "var(--danger)" }}
            onClick={() => {
              if (!confirm(`Delete "${instance.label ?? def.name}" from this rule?`)) return;
              removeInstance(instanceId);
              select({ kind: "none" });
              onClose();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>

          <span className="meta hidden md:inline">
            Saves to the rule in memory. Hit <strong style={{ color: "var(--text)" }}>Save</strong> in the toolbar to persist to disk.
          </span>

          <div className="actions">
            <button type="button" className="btn ghost sm" onClick={tryClose}>Cancel</button>
            <button
              type="button"
              className="btn primary sm"
              onClick={commit}
              disabled={!hasUnsavedChanges}
            >
              <Check className="w-3.5 h-3.5" /> {hasUnsavedChanges ? "Save" : "Saved"}
            </button>
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
    <section className="field-group">
      <span className="field-label">
        {humanLabel(port.name)}
        {port.required ? <span className="req-pill">req</span> : null}
      </span>
      {port.description ? (
        <p className="field-hint">{port.description}</p>
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

  // Enum string param → option-card grid
  if (port.enum && port.enum.length > 0) {
    const value = binding?.kind === "literal" ? binding.value : undefined;
    return (
      <div className="grid grid-cols-2 gap-2">
        {port.enum.map((opt) => {
          const isActive = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ kind: "literal", value: opt.value })}
              className={cn("option-card", isActive && "on")}
            >
              <span className="opt-name">{opt.label}</span>
              {opt.description ? <span className="opt-desc">{opt.description}</span> : null}
            </button>
          );
        })}
      </div>
    );
  }

  // Date port
  if (port.type === "date") {
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
      <input
        className="input"
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
    if (port.bindingKinds?.includes("literal")) {
      return <JsonLiteralEditor port={port} binding={binding} onChange={onChange} />;
    }
  }

  // string-array / number-array — shuttle for ref-select, otherwise textarea.
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
      <div className="pill-toggle">
        <button
          type="button"
          onClick={() => onChange({ kind: "literal", value: true })}
          className={cn(value === true && "on")}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange({ kind: "literal", value: false })}
          className={cn(value === false && "on")}
        >
          No
        </button>
      </div>
    );
  }

  // Fallback: free text
  return (
    <input
      className="input"
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
  const showToggle = allowsLiteral;
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
        <div className="pill-toggle">
          <button type="button" onClick={pickTemplateMode} className={cn(isTemplate && "on")}>
            From template
          </button>
          <button type="button" onClick={pickLiteralMode} className={cn(!isTemplate && "on")}>
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
        <textarea
          className="json-input"
          rows={6}
          value={
            binding?.kind === "literal"
              ? typeof binding.value === "string"
                ? binding.value
                : JSON.stringify(binding.value, null, 2)
              : ""
          }
          onChange={(e) => {
            const txt = e.target.value;
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
      <input
        className="input mono"
        style={{ fontFamily: "var(--font-mono)" }}
        value={value}
        onChange={(e) => onPick(e.target.value)}
        placeholder="$.field.path"
      />
      {suggested.length > 0 ? (
        <div className="best-match-strip">
          <span className="lead">
            <Wand2 className="w-3 h-3" /> Best match
          </span>
          {suggested.map((n) => (
            <button
              key={n.path}
              onClick={() => onPick(n.path)}
              className={cn("best-match-chip", value === n.path && "on")}
              title={n.path}
            >
              {n.path}
            </button>
          ))}
        </div>
      ) : null}
      <div className="schema-tree">
        <div className="schema-tree-search">
          <input
            className="input"
            style={{ height: 26, fontSize: 11.5 }}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search fields…"
          />
        </div>
        <div className="schema-tree-rows">
          {tree ? (
            <SchemaTreeNode
              node={tree}
              selectedPath={value}
              onPick={onPick}
              portType={port.type}
              filter={f}
            />
          ) : (
            <div className="schema-row disabled">No schema yet.</div>
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
          "schema-row",
          isSelected && "on",
          isRoot && "root",
          !compatible && !isRoot && "disabled",
        )}
        style={{ paddingLeft: 6 + node.depth * 12 }}
      >
        <span className="mono">{isRoot ? "request" : node.label}</span>
        {!isRoot ? <span className="type">{prettyTypeOf(node)}</span> : null}
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

  if (allowsMarkets && !allowsRefSelect && !allowsLiteral) {
    const seed: Extract<PortBinding, { kind: "markets-select" }> =
      binding?.kind === "markets-select"
        ? binding
        : { kind: "markets-select", referenceId: "ref-airports", valueColumn: "code", include: [], exclude: [] };
    return <MarketsPicker value={seed} onChange={(b) => onChange(b)} />;
  }

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
        <div className="pill-toggle">
          <button
            type="button"
            onClick={() => {
              if (binding?.kind !== "literal") onChange({ kind: "literal", value: [] });
            }}
            className={cn(!isRefSelect && "on")}
          >
            Type values
          </button>
          <button
            type="button"
            onClick={() => {
              if (binding?.kind !== "ref-select") {
                onChange({
                  kind: "ref-select",
                  referenceId: port.defaultRef?.referenceId ?? "",
                  valueColumn: port.defaultRef?.valueColumn ?? "",
                });
              }
            }}
            className={cn(isRefSelect && "on")}
          >
            From reference
          </button>
        </div>
      ) : null}

      {isRefSelect ? (
        <RefSelectInline binding={effectiveBinding as Extract<PortBinding, { kind: "ref-select" }>} onChange={(b) => onChange(b)} />
      ) : (
        <textarea
          className="json-input"
          rows={6}
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
        <span className="field-label" style={{ letterSpacing: "0.06em" }}>From</span>
        <select
          className="input"
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

// ------------------------------------------------------------------
// JSON literal editor — for object / object-array ports
// ------------------------------------------------------------------

type RowField = {
  field: string;
  label: string;
  type: "string" | "number" | "any";
  required?: boolean;
  placeholder?: string;
  description?: string;
};

const STRUCTURED_ROW_SCHEMAS: Record<string, RowField[]> = {
  cases: [
    {
      field: "match",
      label: "Match",
      type: "any",
      required: true,
      placeholder: '"gold" / 1 / true',
      description: "Compared with the switch's input value (== exact match).",
    },
    {
      field: "name",
      label: "Case name",
      type: "string",
      required: true,
      placeholder: "premium",
      description: "Emitted as the switch's output when this case wins.",
    },
  ],
  buckets: [
    {
      field: "name",
      label: "Bucket name",
      type: "string",
      required: true,
      placeholder: "treatment",
      description: "Emitted as the bucket node's output.",
    },
    {
      field: "weight",
      label: "Weight",
      type: "number",
      required: true,
      placeholder: "50",
      description: "Relative weight; ratios determine assignment probability.",
    },
  ],
};

function JsonLiteralEditor({
  port,
  binding,
  onChange,
}: {
  port: NodePort;
  binding: PortBinding | undefined;
  onChange: (b: PortBinding | null) => void;
}) {
  const rowSchema = port.type === "object-array" ? STRUCTURED_ROW_SCHEMAS[port.name] : undefined;
  const [mode, setMode] = useState<"structured" | "json">(rowSchema ? "structured" : "json");

  const initial = useMemo(() => {
    if (binding?.kind === "literal") {
      if (typeof binding.value === "string") return binding.value;
      return JSON.stringify(binding.value, null, 2);
    }
    return port.type === "object-array" ? "[\n  \n]" : "{\n  \n}";
  }, [binding, port.type]);

  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(initial);
    setError(null);
  }, [initial]);

  const rows: Record<string, unknown>[] =
    binding?.kind === "literal" && Array.isArray(binding.value)
      ? (binding.value as Record<string, unknown>[])
      : [];

  function commitRows(next: Record<string, unknown>[]) {
    onChange({ kind: "literal", value: next });
  }

  const jsonPlaceholder =
    port.type === "object-array"
      ? port.name === "cases"
        ? '[\n  { "match": "gold",   "name": "premium" },\n  { "match": "silver", "name": "standard" }\n]'
        : port.name === "buckets"
        ? '[\n  { "name": "treatment", "weight": 50 },\n  { "name": "control",   "weight": 50 }\n]'
        : "[\n  { ... }\n]"
      : '{ "key": "value" }';

  return (
    <div className="flex flex-col gap-2">
      {rowSchema ? (
        <div className="flex items-center justify-between">
          <div className="pill-toggle">
            <button
              type="button"
              onClick={() => setMode("structured")}
              className={cn(mode === "structured" && "on")}
            >
              Structured
            </button>
            <button
              type="button"
              onClick={() => setMode("json")}
              className={cn(mode === "json" && "on")}
            >
              Raw JSON
            </button>
          </div>
          {mode === "structured" ? (
            <button
              type="button"
              onClick={() => commitRows([...rows, blankRow(rowSchema)])}
              className="btn ghost sm"
              title="Add a new row"
            >
              + Add row
            </button>
          ) : null}
        </div>
      ) : null}

      {rowSchema && mode === "structured" ? (
        <StructuredRowEditor
          rowSchema={rowSchema}
          rows={rows}
          onChange={commitRows}
        />
      ) : (
        <>
          <textarea
            className="json-input"
            rows={6}
            value={text}
            onChange={(e) => {
              const next = e.target.value;
              setText(next);
              if (next.trim() === "") {
                onChange(null);
                setError(null);
                return;
              }
              try {
                const parsed = JSON.parse(next);
                onChange({ kind: "literal", value: parsed });
                setError(null);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
            placeholder={jsonPlaceholder}
          />
          {error ? <span style={{ fontSize: 10.5, color: "var(--warn)" }}>{error}</span> : null}
        </>
      )}
    </div>
  );
}

function blankRow(rowSchema: RowField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of rowSchema) {
    out[f.field] = f.type === "number" ? 0 : "";
  }
  return out;
}

function StructuredRowEditor({
  rowSchema,
  rows,
  onChange,
}: {
  rowSchema: RowField[];
  rows: Record<string, unknown>[];
  onChange: (next: Record<string, unknown>[]) => void;
}) {
  function patchRow(idx: number, field: string, value: unknown) {
    const next = rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r));
    onChange(next);
  }
  function removeRow(idx: number) {
    onChange(rows.filter((_, i) => i !== idx));
  }

  if (rows.length === 0) {
    return (
      <div className="struct-rows-empty">
        No rows yet. Click <strong style={{ color: "var(--text)" }}>+ Add row</strong> to start.
      </div>
    );
  }

  const gridCols = `${rowSchema.map(() => "1fr").join(" ")} 28px`;

  return (
    <div className="struct-rows">
      <div className="struct-rows-head" style={{ gridTemplateColumns: gridCols }}>
        {rowSchema.map((f) => (
          <div key={f.field} title={f.description}>
            {f.label}
            {f.required ? <span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span> : null}
          </div>
        ))}
        <div />
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          className="struct-rows-row"
          style={{ gridTemplateColumns: gridCols }}
        >
          {rowSchema.map((f) => (
            <RowCell
              key={f.field}
              field={f}
              value={row[f.field]}
              onChange={(v) => patchRow(i, f.field, v)}
            />
          ))}
          <button
            type="button"
            onClick={() => removeRow(i)}
            className="x"
            title="Remove this row"
            aria-label="Remove row"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function RowCell({
  field,
  value,
  onChange,
}: {
  field: RowField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "number") {
    return (
      <input
        className="input"
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        placeholder={field.placeholder}
      />
    );
  }
  if (field.type === "any") {
    const display = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
    return (
      <input
        className="input mono"
        style={{ fontFamily: "var(--font-mono)" }}
        value={display}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") return onChange("");
          try {
            onChange(JSON.parse(v));
          } catch {
            onChange(v);
          }
        }}
        placeholder={field.placeholder}
      />
    );
  }
  return (
    <input
      className="input"
      value={typeof value === "string" ? value : value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
    />
  );
}

function shallowEqualBindings(a: Record<string, PortBinding>, b: Record<string, PortBinding>): boolean {
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
