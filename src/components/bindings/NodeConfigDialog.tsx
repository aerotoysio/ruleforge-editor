"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Check, Wand2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useRuleStore } from "@/lib/store/rule-store";
import { useNodesStore } from "@/lib/store/nodes-store";
import { useReferencesStore } from "@/lib/store/references-store";
import { useTemplatesStore } from "@/lib/store/templates-store";
import { useAssetsStore } from "@/lib/store/assets-store";
import { compileRuleForEngine, CompileError } from "@/lib/rule/compile-to-engine";
import { CalcExpressionEditor, type CalcVar } from "./CalcExpressionEditor";
import { ShuttlePicker, type ShuttleItem } from "./ShuttlePicker";
import { DateBindingPicker } from "./DateBindingPicker";
import { MarketsPicker } from "./MarketsPicker";
import { TemplateFillEditor } from "./TemplateFillEditor";
import { AssetPicker } from "./AssetPicker";
import { TextParseEditor } from "./TextParseEditor";
import { NumberConditionsEditor, type NumCond } from "./NumberConditionsEditor";
import { DateConditionsEditor, type DateCond } from "./DateConditionsEditor";
import { TextConditionsEditor, type StrCond } from "./TextConditionsEditor";
import { loopVarsInScope } from "@/lib/rule/loop-vars";
import { walkSchema, type SchemaPathNode } from "@/lib/schema/path-walker";
import { cn } from "@/lib/utils";
import type { Asset, JsonSchema, NodeDef, NodePort, OutputTemplate, PortBinding, ReferenceSet, Rule } from "@/lib/types";

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
  const references = useReferencesStore((s) => s.references);
  const templates = useTemplatesStore((s) => s.templates);
  const assets = useAssetsStore((s) => s.assets);
  const loadRefs = useReferencesStore((s) => s.load);
  const loadTemplates = useTemplatesStore((s) => s.load);
  const loadAssets = useAssetsStore((s) => s.load);

  const instance = rule?.instances.find((i) => i.instanceId === instanceId);
  const def = instance ? nodeDefs.find((n) => n.id === instance.nodeId) : undefined;
  const initialBindings = rule?.bindings[instanceId];

  // Local draft — committed only on Save. Includes label and description
  // edits so renames don't escape via accidental close.
  const [draft, setDraft] = useState<Record<string, PortBinding>>(initialBindings?.bindings ?? {});
  const [labelDraft, setLabelDraft] = useState<string>(instance?.label ?? "");
  const [descriptionDraft, setDescriptionDraft] = useState<string>(instance?.description ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [tab, setTab] = useState<"form" | "raw">("form");
  const [extrasDraft, setExtrasDraft] = useState<Record<string, unknown>>((initialBindings?.extras as Record<string, unknown>) ?? {});

  useEffect(() => {
    if (open) {
      setDraft(initialBindings?.bindings ?? {});
      setLabelDraft(instance?.label ?? "");
      setDescriptionDraft(instance?.description ?? "");
      setAdvancedOpen(false);
      setTab("form");
      setExtrasDraft((initialBindings?.extras as Record<string, unknown>) ?? {});
      loadRefs();
      loadTemplates();
      loadAssets();
    }
  }, [open, initialBindings, instance?.label, instance?.description, loadRefs, loadTemplates, loadAssets]);

  if (!rule || !instance || !def) return null;

  // Loop variables ($item / $pax …) contributed by enclosing For-each nodes —
  // offered in this node's field pickers so you can bind to the current element.
  const loopVars = loopVarsInScope(rule, instanceId, nodeDefs);

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
      extras: extrasDraft,
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
    JSON.stringify(extrasDraft ?? {}) !== JSON.stringify((initialBindings?.extras as Record<string, unknown>) ?? {}) ||
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
  const calcVariables = deriveCalcVariables(rule, instanceId);
  const objectFieldNames = calcVariables.filter((v) => v.source === "field").map((v) => v.name);

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

        <div style={{ display: "flex", gap: 4, padding: "8px 18px 0", borderBottom: "1px solid var(--border)" }}>
          {(["form", "raw"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: "7px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                background: "transparent",
                border: 0,
                marginBottom: -1,
                borderBottom: tab === t ? `2px solid ${accent}` : "2px solid transparent",
                color: tab === t ? "var(--text)" : "#94a3b8",
              }}
            >
              {t === "form" ? "Form" : "Raw rule"}
            </button>
          ))}
        </div>

        {tab === "form" && (
        <div className="popup-body">
          {/* Identity — label + description. These travel with the node-instance
              (not the bindings), so a third-party reading the canvas can scan
              "filter for AU market" without opening every node. */}
          <section className="field-group">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 10, alignItems: "start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="field-label" style={{ margin: 0 }}>Name</span>
                <input
                  className="input"
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  placeholder={def.name}
                  aria-label="Node label"
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="field-label" style={{ margin: 0 }}>
                  Description <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>· shows on the card</span>
                </span>
                <textarea
                  className="json-input"
                  style={{ fontFamily: "var(--font-sans)", fontSize: 12, minHeight: 38 }}
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  placeholder={`e.g. "Filter for AU market"`}
                  rows={2}
                  aria-label="Node description"
                />
              </div>
            </div>
          </section>

          {primary.length === 0 && advanced.length === 0 ? (
            <div className="struct-rows-empty">
              <strong style={{ color: "var(--text)" }}>{noConfigBlurb(def).title}</strong>
              <div style={{ marginTop: 4 }}>{noConfigBlurb(def).body}</div>
            </div>
          ) : null}

          {primary.map((port) => {
            // For-each: the loop-variable name is a free text field (defaulting
            // to "item") with the common names as suggestions — not a forced pick.
            if (def.category === "iterator" && port.name === "as") {
              const v = draft.as?.kind === "literal" && typeof draft.as.value === "string" ? draft.as.value : "";
              return (
                <section className="field-group" key={port.name}>
                  <span className="field-label">Loop variable name<span className="req-pill">req</span></span>
                  <p className="field-hint">What to call each item inside the loop — downstream nodes read it as <code>$name</code> (e.g. <code>$item.id</code>). Defaults to <code>item</code>.</p>
                  <input
                    className="input mono"
                    style={{ fontFamily: "var(--font-mono)", maxWidth: 280 }}
                    list="iter-as-suggestions"
                    value={v}
                    onChange={(e) => setBinding("as", e.target.value ? { kind: "literal", value: e.target.value } : null)}
                    placeholder="item"
                  />
                  <datalist id="iter-as-suggestions">{(port.enum ?? []).map((o) => <option key={o.value} value={o.value} />)}</datalist>
                </section>
              );
            }
            // Parse-string node: one unified friendly editor (source + {token}
            // pattern + live preview + asset + token→field mapping) replaces the
            // per-port fields. Render it once on the source port; skip the rest.
            if (def.category === "textParse") {
              if (port.name !== "source") return null;
              return (
                <TextParseEditor
                  key="textparse"
                  draft={draft}
                  setBinding={setBinding}
                  loopVars={loopVars}
                  inputSchema={rule.inputSchema}
                />
              );
            }
            // Number filter: one field, a stack of conditions (ALL/ANY) — replaces
            // a chain of single-compare nodes. Render once on the source port.
            if (def.category === "filter") {
              const sp = (def.ports.inputs ?? []).find((p) => p.name === "source");
              if (sp?.type === "number" || sp?.type === "integer") {
                if (port.name !== "source") return null;
                const dOp = draft.operator?.kind === "literal" && typeof draft.operator.value === "string" ? draft.operator.value : null;
                const legacy: NumCond | null = dOp ? {
                  operator: dOp,
                  value: draft.value?.kind === "literal" && typeof draft.value.value === "number" ? draft.value.value : undefined,
                  values: draft.values?.kind === "literal" && Array.isArray(draft.values.value) ? (draft.values.value as unknown[]).map(Number).filter((n) => !Number.isNaN(n)) : undefined,
                  min: draft.min?.kind === "literal" && typeof draft.min.value === "number" ? draft.min.value : undefined,
                  max: draft.max?.kind === "literal" && typeof draft.max.value === "number" ? draft.max.value : undefined,
                } : null;
                return (
                  <NumberConditionsEditor
                    key="numcond"
                    source={draft.source}
                    onSource={(b) => setBinding("source", b)}
                    conditions={(extrasDraft.conditions as NumCond[]) ?? []}
                    match={(extrasDraft.match as string) ?? "all"}
                    onChange={(conditions, match) => setExtrasDraft((prev) => ({ ...prev, conditions, match }))}
                    legacy={legacy}
                    loopVars={loopVars}
                    inputSchema={rule.inputSchema}
                  />
                );
              }
              if (sp?.type === "date") {
                if (port.name !== "source") return null;
                return (
                  <DateConditionsEditor
                    key="datecond"
                    source={draft.source}
                    onSource={(b) => setBinding("source", b)}
                    conditions={(extrasDraft.conditions as DateCond[]) ?? []}
                    match={(extrasDraft.match as string) ?? "all"}
                    timezone={(extrasDraft.timezone as string) ?? ""}
                    onChange={(conditions, match, timezone) => setExtrasDraft((prev) => ({ ...prev, conditions, match, timezone }))}
                    loopVars={loopVars}
                    inputSchema={rule.inputSchema}
                  />
                );
              }
              // Generic text filter only (not the specialised veneers, which keep
              // their own editors). One field, many text/list/reference conditions.
              if (def.id === "node-filter-string-in") {
                if (port.name !== "source") return null;
                return (
                  <TextConditionsEditor
                    key="textcond"
                    source={draft.source}
                    onSource={(b) => setBinding("source", b)}
                    conditions={(extrasDraft.conditions as StrCond[]) ?? []}
                    match={(extrasDraft.match as string) ?? "all"}
                    caseSensitive={!!extrasDraft.caseSensitive}
                    onChange={(conditions, match, caseSensitive) => setExtrasDraft((prev) => ({ ...prev, conditions, match, caseSensitive }))}
                    loopVars={loopVars}
                    inputSchema={rule.inputSchema}
                  />
                );
              }
            }
            if (port.name === "matchOn") {
              return (
                <section className="field-group" key={port.name}>
                  <span className="field-label">
                    {humanLabel(port.name)}
                    {port.required ? <span className="req-pill">req</span> : null}
                  </span>
                  <p className="field-hint">
                    Which reference column must equal which request value to pick a row. Add one row per column to match on.
                  </p>
                  <KeySourceMapEditor
                    referenceId={referenceIdOf(draft.referenceId)}
                    value={(extrasDraft.matchOn as Record<string, PortBinding>) ?? {}}
                    onChange={(next) => setExtrasDraft((prev) => ({ ...prev, matchOn: next }))}
                    inputSchema={rule.inputSchema}
                    keyMode="ref"
                    keyPlaceholder="column"
                    addLabel="+ Add match key"
                    emptyLabel="No match keys yet — add one per reference column to match on."
                  />
                </section>
              );
            }
            if (port.name === "fields") {
              return (
                <section className="field-group" key={port.name}>
                  <span className="field-label">
                    {humanLabel(port.name)}
                    {port.required ? <span className="req-pill">req</span> : null}
                  </span>
                  <p className="field-hint">
                    Set several fields at once — one row per field, each from a request field, a loop/context value, or a literal. Replaces a chain of single Set nodes.
                  </p>
                  <KeySourceMapEditor
                    value={(extrasDraft.fields as Record<string, PortBinding>) ?? {}}
                    onChange={(next) => setExtrasDraft((prev) => ({ ...prev, fields: next }))}
                    inputSchema={rule.inputSchema}
                    keyMode="free"
                    keyPlaceholder="fieldName"
                    addLabel="+ Add field"
                    emptyLabel="No fields yet — add one per field you want to set."
                  />
                </section>
              );
            }
            if (port.name === "inputMapping" || port.name === "outputMapping" || port.name === "headers" || port.name === "responseMap") {
              const isMapping = port.name === "inputMapping" || port.name === "outputMapping";
              return (
                <section className="field-group" key={port.name}>
                  <span className="field-label">
                    {humanLabel(port.name)}
                    {port.required ? <span className="req-pill">req</span> : null}
                  </span>
                  <p className="field-hint">
                    {port.description ?? (isMapping
                      ? "Map each field name to where its value comes from (a path like $.x)."
                      : "Key → value pairs.")}
                  </p>
                  <StringMapEditor
                    value={draft[port.name]}
                    onChange={(b) => setBinding(port.name, b)}
                    keyPlaceholder={isMapping ? "targetField" : "Header-Name"}
                    valuePlaceholder={isMapping ? "$.source.path" : "value"}
                    addLabel={isMapping ? "+ Add mapping" : "+ Add row"}
                    emptyLabel={isMapping ? "No mappings yet — add one per field." : "No entries yet."}
                  />
                </section>
              );
            }
            if ((port.name === "expression" && def.category === "calc") || (port.name === "condition" && def.category === "assert")) {
              const exprB = draft[port.name];
              const exprVal = exprB?.kind === "literal" && typeof exprB.value === "string" ? exprB.value : "";
              return (
                <section className="field-group" key={port.name}>
                  <span className="field-label">
                    {humanLabel(port.name)}
                    {port.required ? <span className="req-pill">req</span> : null}
                  </span>
                  <p className="field-hint">
                    {def.category === "assert"
                      ? "A condition that must be true, or the rule fails with your error. Reference fields by name; click a variable, function or operator to build it."
                      : "Reference fields by name; the result is written to the target field. Click a variable, function or operator to build it."}
                  </p>
                  <CalcExpressionEditor
                    value={exprVal}
                    onChange={(s) => setBinding(port.name, { kind: "literal", value: s })}
                    variables={calcVariables}
                  />
                </section>
              );
            }
            if (port.name === "target") {
              return (
                <section className="field-group" key={port.name}>
                  <span className="field-label">
                    {humanLabel(port.name)}
                    {port.required ? <span className="req-pill">req</span> : null}
                  </span>
                  <p className="field-hint">
                    {port.description ?? "Name of the field on the current record to write into — a new field name is fine."}
                  </p>
                  <input
                    className="input mono"
                    style={{ fontFamily: "var(--font-mono)" }}
                    list={`fields-${instanceId}`}
                    value={draft.target?.kind === "literal" && typeof draft.target.value === "string" ? draft.target.value : ""}
                    onChange={(e) => setBinding("target", { kind: "literal", value: e.target.value })}
                    placeholder="fieldName"
                  />
                  <datalist id={`fields-${instanceId}`}>
                    {objectFieldNames.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </section>
              );
            }
            return (
              <PortSection
                key={port.name}
                port={port}
                binding={draft[port.name]}
                onChange={(b) => setBinding(port.name, b)}
                inputSchema={rule.inputSchema}
              />
            );
          })}

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
        )}

        {tab === "raw" && (
          <div className="popup-body">
            <RawTab
              instance={instance}
              label={labelDraft}
              description={descriptionDraft}
              draft={draft}
              extras={extrasDraft}
              rule={rule}
              nodeDefs={nodeDefs}
              refs={references}
              templates={templates}
              assets={assets}
            />
          </div>
        )}

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
// Raw tab — live editor-source + compiled-engine view of THIS node.
// Lets the author see the rule behind the form and confirm the form is
// producing the bindings (and engine config) they expect. Compile errors
// surface here too, so a half-wired node is obvious before Save.
// ------------------------------------------------------------------

function RawTab({
  instance,
  label,
  description,
  draft,
  extras,
  rule,
  nodeDefs,
  refs,
  templates,
  assets,
}: {
  instance: { instanceId: string; nodeId: string; position: { x: number; y: number } };
  label: string;
  description: string;
  draft: Record<string, PortBinding>;
  extras: Record<string, unknown> | undefined;
  rule: Rule;
  nodeDefs: NodeDef[];
  refs: ReferenceSet[];
  templates: OutputTemplate[];
  assets: Asset[];
}) {
  const editorSource = {
    instance: {
      instanceId: instance.instanceId,
      nodeId: instance.nodeId,
      label: label.trim() || undefined,
      description: description.trim() || undefined,
      position: instance.position,
    },
    bindings: { bindings: draft, ...(extras ? { extras } : {}) },
  };

  const { engineNode, compileError } = useMemo(() => {
    try {
      const mini: Rule = {
        ...rule,
        instances: [
          {
            instanceId: instance.instanceId,
            nodeId: instance.nodeId,
            position: instance.position,
            label: label.trim() || undefined,
            description: description.trim() || undefined,
          },
        ],
        edges: [],
        bindings: {
          [instance.instanceId]: {
            instanceId: instance.instanceId,
            ruleId: rule.id,
            bindings: draft,
            extras,
          },
        },
      };
      const compiled = compileRuleForEngine(mini, nodeDefs, { refs, templates, assets });
      return { engineNode: compiled.nodes[0] ?? null, compileError: null as string | null };
    } catch (e) {
      const msg = e instanceof CompileError ? e.message : (e as Error).message;
      return { engineNode: null, compileError: msg };
    }
  }, [rule, instance, label, description, draft, extras, nodeDefs, refs, templates, assets]);

  return (
    <div className="flex flex-col gap-4">
      <p className="field-hint">
        Live, read-only view of this node as you edit it.{" "}
        <strong style={{ color: "var(--text)" }}>Editor source</strong> is what gets saved to the workspace;{" "}
        <strong style={{ color: "var(--text)" }}>Engine</strong> is what the rules engine actually runs after compile.
      </p>

      <section className="field-group">
        <span className="field-label">Editor source (this node)</span>
        <textarea
          className="json-input"
          readOnly
          rows={12}
          style={{ fontFamily: "var(--font-mono)" }}
          value={JSON.stringify(editorSource, null, 2)}
        />
      </section>

      <section className="field-group">
        <span className="field-label">Engine — compiled config</span>
        {compileError ? (
          <div className="struct-rows-empty" style={{ color: "var(--warn, #d97706)", whiteSpace: "pre-wrap" }}>
            <strong>Does not compile yet</strong>
            {"\n"}
            {compileError}
          </div>
        ) : (
          <textarea
            className="json-input"
            readOnly
            rows={12}
            style={{ fontFamily: "var(--font-mono)" }}
            value={JSON.stringify(engineNode, null, 2)}
          />
        )}
      </section>
    </div>
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
  // Port references a saved Asset (the asset-only Product node) — dropdown only.
  const allowsAsset = port.bindingKinds?.includes("asset") ?? false;
  if (allowsAsset) {
    return <AssetPicker binding={binding} onChange={onChange} />;
  }

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
    if (port.type === "string" && port.bindingKinds?.includes("literal")) {
      return (
        <input
          className="input"
          value={binding?.kind === "literal" && typeof binding.value === "string" ? binding.value : ""}
          onChange={(e) => onChange({ kind: "literal", value: e.target.value })}
          placeholder="value"
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

// ------------------------------------------------------------------
// matchOn editor — the reference lookup's "which columns equal which
// request values" map. Stored in the binding's `extras.matchOn` (a
// Record<column, source>), so it needs its own editor rather than a
// single port binding.
// ------------------------------------------------------------------

// Derive the variables a calc expression can reference in THIS rule: request
// top-level fields, record fields built upstream (constant shells + mutator/calc
// targets), and loop variables from iterators. Mirrors the engine's resolver
// namespaces so the palette only offers names that will actually resolve.
function deriveCalcVariables(rule: Rule, selfInstanceId: string): CalcVar[] {
  const seen = new Map<string, CalcVar["source"]>();
  const add = (name: string, source: CalcVar["source"]) => {
    if (!name) return;
    const existing = seen.get(name);
    if (existing && existing !== "request") return; // don't downgrade field/loop → request
    seen.set(name, source);
  };

  const props = (rule.inputSchema?.properties ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(props)) add(k, "request");

  for (const inst of rule.instances) {
    const b = (rule.bindings[inst.instanceId]?.bindings ?? {}) as Record<string, PortBinding>;
    if (inst.instanceId !== selfInstanceId) {
      const t = b.target;
      if (t?.kind === "literal" && typeof t.value === "string") add(t.value, "field");
      const v = b.value ?? b.literal;
      if (v?.kind === "literal" && v.value && typeof v.value === "object" && !Array.isArray(v.value)) {
        for (const k of Object.keys(v.value as Record<string, unknown>)) add(k, "field");
      }
      const ex = (rule.bindings[inst.instanceId]?.extras ?? {}) as Record<string, unknown>;
      const fm = ex.fields;
      if (fm && typeof fm === "object" && !Array.isArray(fm)) {
        for (const k of Object.keys(fm as Record<string, unknown>)) add(k, "field");
      }
    }
    const as = b.as;
    if (as?.kind === "literal" && typeof as.value === "string") {
      add(as.value, "loop");
      add(`${as.value}Index`, "loop");
      add(`${as.value}Count`, "loop");
    }
  }

  return [...seen.entries()]
    .map(([name, source]) => ({ name, source }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Friendly explanation for nodes with no configurable ports — so the dialog
// "signifies" what a settings-less node does (e.g. the OR operator) instead of
// a bare "nothing here".
// Simple key → string-value map editor, stored as a literal object binding.
// Used for sub-rule input/output mappings and api headers / responseMap —
// friendlier than hand-editing raw JSON.
function StringMapEditor({
  value,
  onChange,
  keyPlaceholder = "key",
  valuePlaceholder = "value",
  addLabel = "+ Add row",
  emptyLabel = "No rows yet.",
}: {
  value: PortBinding | undefined;
  onChange: (b: PortBinding | null) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
  emptyLabel?: string;
}) {
  const obj: Record<string, unknown> =
    value?.kind === "literal" && value.value && typeof value.value === "object" && !Array.isArray(value.value)
      ? (value.value as Record<string, unknown>)
      : {};
  const entries = Object.entries(obj);

  function emit(next: Record<string, unknown>) {
    if (Object.keys(next).length === 0) onChange(null);
    else onChange({ kind: "literal", value: next });
  }
  function setVal(key: string, v: string) { emit({ ...obj, [key]: v }); }
  function renameKey(oldK: string, newK: string) {
    if (oldK === newK) return;
    const next: Record<string, unknown> = {};
    for (const [k, val] of entries) next[k === oldK ? newK : k] = val;
    emit(next);
  }
  function removeRow(key: string) { const next = { ...obj }; delete next[key]; emit(next); }
  function addRow() { emit({ ...obj, "": "" }); }

  return (
    <div className="flex flex-col gap-2">
      {entries.length === 0 ? <div className="struct-rows-empty">{emptyLabel}</div> : null}
      {entries.map(([k, v], i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 28px", gap: 8, alignItems: "center" }}>
          <input className="input mono" style={{ fontFamily: "var(--font-mono)" }} value={k} onChange={(e) => renameKey(k, e.target.value)} placeholder={keyPlaceholder} />
          <input className="input mono" style={{ fontFamily: "var(--font-mono)" }} value={typeof v === "string" ? v : JSON.stringify(v)} onChange={(e) => setVal(k, e.target.value)} placeholder={valuePlaceholder} />
          <button type="button" className="x" title="Remove row" aria-label="Remove row" onClick={() => removeRow(k)}>×</button>
        </div>
      ))}
      <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={addRow}>{addLabel}</button>
    </div>
  );
}

function noConfigBlurb(def: NodeDef): { title: string; body: string } {
  if (def.category === "logic") {
    const op = (def.id || "").replace("node-logic-", "");
    const map: Record<string, { title: string; body: string }> = {
      and: { title: "AND — no settings needed", body: "Passes only when ALL incoming branches pass. Connect two or more nodes into it." },
      or:  { title: "OR — no settings needed",  body: "Passes when ANY incoming branch passes. Connect two or more nodes into it." },
      xor: { title: "XOR — no settings needed", body: "Passes when EXACTLY ONE incoming branch passes. Connect two or more nodes into it." },
      not: { title: "NOT — no settings needed", body: "Inverts the incoming branch: a pass becomes a fail and vice-versa. Connect a single node into it." },
    };
    return map[op] ?? { title: "Logic — no settings needed", body: "Combines its incoming pass/fail branches. Nothing to configure." };
  }
  if (def.category === "input") return { title: "Start — no settings needed", body: "The rule's request enters the graph here. Connect it to your first step." };
  if (def.category === "output") return { title: "Result — no settings needed", body: "Whatever reaches this node becomes the rule's output. Connect your final step into it." };
  return { title: "No settings needed", body: "This node has no configurable ports — it works the same in every rule." };
}

function referenceIdOf(b: PortBinding | undefined): string | undefined {
  if (!b) return undefined;
  if (b.kind === "reference") return b.referenceId;
  if (b.kind === "literal" && typeof b.value === "string") return b.value;
  return undefined;
}

function KeySourceMapEditor({
  referenceId,
  value,
  onChange,
  inputSchema,
  keyMode = "ref",
  keyPlaceholder = "key",
  addLabel = "+ Add row",
  emptyLabel = "No rows yet.",
}: {
  referenceId?: string;
  value: Record<string, PortBinding>;
  onChange: (next: Record<string, PortBinding>) => void;
  inputSchema: JsonSchema;
  keyMode?: "ref" | "free";
  keyPlaceholder?: string;
  addLabel?: string;
  emptyLabel?: string;
}) {
  const refs = useReferencesStore((s) => s.references);
  const ref = refs.find((r) => r.id === referenceId);
  const cols = keyMode === "ref" ? (ref?.columns ?? []) : [];
  const entries = Object.entries(value);
  const usedCols = entries.map(([c]) => c);
  const freeCols = cols.filter((c) => !usedCols.includes(c));

  function setRow(col: string, b: PortBinding) {
    onChange({ ...value, [col]: b });
  }
  function renameRow(oldCol: string, newCol: string) {
    if (oldCol === newCol) return;
    const next: Record<string, PortBinding> = {};
    for (const [k, v] of entries) next[k === oldCol ? newCol : k] = v;
    onChange(next);
  }
  function removeRow(col: string) {
    const next = { ...value };
    delete next[col];
    onChange(next);
  }
  function addRow() {
    const col = keyMode === "ref" ? (freeCols[0] ?? "") : "";
    onChange({ ...value, [col]: { kind: "path", path: "" } });
  }

  return (
    <div className="flex flex-col gap-2">
      {keyMode === "ref" && !referenceId ? (
        <div className="struct-rows-empty">Choose a reference table above to see its columns.</div>
      ) : null}
      {entries.length === 0 ? (
        <div className="struct-rows-empty">{emptyLabel}</div>
      ) : null}
      {entries.map(([col, binding]) => (
        <div key={col} style={{ display: "grid", gridTemplateColumns: "150px 1fr 28px", gap: 8, alignItems: "start" }}>
          {cols.length > 0 ? (
            <select className="input" value={col} onChange={(e) => renameRow(col, e.target.value)}>
              {!cols.includes(col) ? <option value={col}>{col || "— column —"}</option> : null}
              {cols.map((c) => (
                <option key={c} value={c} disabled={c !== col && usedCols.includes(c)}>{c}</option>
              ))}
            </select>
          ) : (
            <input className="input mono" style={{ fontFamily: "var(--font-mono)" }} value={col} onChange={(e) => renameRow(col, e.target.value)} placeholder={keyPlaceholder} />
          )}
          <SourceField binding={binding} onChange={(b) => setRow(col, b)} inputSchema={inputSchema} />
          <button type="button" className="x" title="Remove this match key" aria-label="Remove match key" onClick={() => removeRow(col)}>×</button>
        </div>
      ))}
      <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={addRow}>{addLabel}</button>
    </div>
  );
}

// A compact value-source control: request field, iteration/context path, or
// literal. Reusable anywhere a single value can come from multiple places
// (matchOn rows today; sub-rule mappings / api headers next).
function SourceField({
  binding,
  onChange,
  inputSchema,
}: {
  binding: PortBinding | undefined;
  onChange: (b: PortBinding) => void;
  inputSchema: JsonSchema;
}) {
  const kind = binding?.kind === "context" ? "context" : binding?.kind === "literal" ? "literal" : "field";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="pill-toggle">
        <button type="button" className={cn(kind === "field" && "on")} onClick={() => onChange({ kind: "path", path: binding?.kind === "path" ? binding.path : "" })}>Field</button>
        <button type="button" className={cn(kind === "context" && "on")} onClick={() => onChange({ kind: "context", key: binding?.kind === "context" ? binding.key : "" })}>Loop / context</button>
        <button type="button" className={cn(kind === "literal" && "on")} onClick={() => onChange({ kind: "literal", value: binding?.kind === "literal" ? binding.value : "" })}>Literal</button>
      </div>
      {kind === "field" ? (
        <SchemaFieldPicker
          schema={inputSchema}
          port={{ name: "matchValue", type: "any" } as NodePort}
          value={binding?.kind === "path" ? binding.path : ""}
          onPick={(p) => onChange({ kind: "path", path: p })}
        />
      ) : kind === "context" ? (
        <input
          className="input mono"
          style={{ fontFamily: "var(--font-mono)" }}
          value={binding?.kind === "context" ? binding.key : ""}
          onChange={(e) => onChange({ kind: "context", key: e.target.value })}
          placeholder="$pax.ageCategory  or  $ctx.myKey"
        />
      ) : (
        <input
          className="input"
          value={binding?.kind === "literal" && (typeof binding.value === "string" || typeof binding.value === "number") ? String(binding.value) : ""}
          onChange={(e) => onChange({ kind: "literal", value: e.target.value })}
          placeholder="fixed value"
        />
      )}
    </div>
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
    condition: "Condition (must be true)",
    referenceId: "Reference table",
    valueColumn: "Column to copy",
    matchOn: "Match on",
    fields: "Set fields",
    onMissing: "When the field is missing",
    arraySelector: "When source has multiple values",
    caseInsensitive: "Ignore upper/lower case",
    trim: "Trim whitespace",
    mode: "How to combine",
    as: "Loop variable name",
    value: "Value",
    operator: "Test",
    sortKey: "Sort by (field)",
    direction: "Direction",
    nulls: "Put blanks",
    count: "Keep how many",
    offset: "Skip first",
    key: "Unique by (field)",
    keep: "Keep which",
    groupKey: "Group by (field)",
    input: "Value to switch on",
    cases: "Cases",
    default: "Default value",
    hashKey: "Split key",
    buckets: "Buckets",
    round: "Rounding",
    granularity: "Compare precision",
    timezone: "Timezone",
    fromInclusive: "Include the 'from' value",
    toInclusive: "Include the 'to' value",
    errorCode: "Error code",
    errorMessage: "Error message",
    ruleId: "Sub-rule to call",
    version: "Pinned version",
    pinnedVersion: "Pinned version",
    payload: "Input to the sub-rule",
    inputMapping: "Map inputs (field → source)",
    outputMapping: "Map outputs (field → source)",
    onError: "If the sub-rule errors",
    url: "URL",
    method: "Method",
    timeoutMs: "Timeout (ms)",
    headers: "Headers",
    body: "Body",
    responseMap: "Map the response",
  };
  return map[portName] ?? portName;
}
