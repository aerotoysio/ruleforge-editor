"use client";

import { useEffect, useState, useMemo } from "react";
import { ArrowDownToLine, Box, Type as TypeIcon, Database, X, Check } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { ReferenceMultiSelect } from "@/components/bindings/ReferenceMultiSelect";
import { DateBindingPicker } from "@/components/bindings/DateBindingPicker";
import { ObjectShapeEditor } from "@/components/bindings/ObjectShapeEditor";
import { walkSchema, type SchemaPathNode } from "@/lib/schema/path-walker";
import { cn } from "@/lib/utils";
import type { JsonSchema, NodePort, PortBinding } from "@/lib/types";

type Tab = "request" | "context" | "literal" | "ref" | "date";

type Props = {
  open: boolean;
  onClose: () => void;
  port: NodePort;
  inputSchema: JsonSchema;
  /** Current binding value when the dialog opens. */
  initial: PortBinding | undefined;
  /** Called once when the user clicks Save. */
  onSave: (next: PortBinding) => void;
  /** Optional: clear the binding entirely. */
  onClear?: () => void;
};

const TABS: { id: Tab; label: string; icon: typeof ArrowDownToLine; description: string }[] = [
  { id: "request", label: "Request",  icon: ArrowDownToLine, description: "Pick a field from the rule's request body" },
  { id: "context", label: "Context",  icon: Box,             description: "Read from an iteration frame ($pax, $bound) or saved context value" },
  { id: "literal", label: "Literal",  icon: TypeIcon,        description: "Type a fixed value yourself" },
  { id: "ref",     label: "From Ref", icon: Database,        description: "Pick rows from a reference table" },
  { id: "date",    label: "Date",     icon: ArrowDownToLine, description: "Specific date, day of week, weekend/weekday, …" },
];

export function BindingPickerDialog({ open, onClose, port, inputSchema, initial, onSave, onClear }: Props) {
  // Local draft — committed only on Save, so Cancel/X discards changes cleanly.
  const [draft, setDraft] = useState<PortBinding | undefined>(initial);
  const [tab, setTab] = useState<Tab>(deriveTab(initial, port));

  useEffect(() => {
    if (open) {
      setDraft(initial);
      setTab(deriveTab(initial, port));
    }
  }, [open, initial, port]);

  // Compute a plain-language preview string for the right column.
  const preview = describePortBinding(draft);

  function commit() {
    if (draft) onSave(draft);
    onClose();
  }

  // Filter the visible tabs to ones the port actually supports.
  const visibleTabs = TABS.filter((t) => isTabAllowed(t.id, port));

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-[900px] sm:max-w-[900px] p-0 gap-0 flex flex-col h-[640px]">
        {/* Header */}
        <header className="px-5 py-3 border-b shrink-0 flex items-start gap-3 bg-card">
          <div className="flex flex-col leading-tight min-w-0 flex-1">
            <DialogTitle className="text-[15px] font-semibold tracking-tight text-foreground">
              Bind&nbsp;<span className="font-mono">{port.name}</span>
            </DialogTitle>
            <DialogDescription className="text-[12px] text-muted-foreground mt-0.5 max-w-prose">
              {port.description ?? `Choose where this ${port.type} value comes from.`}
            </DialogDescription>
          </div>
          <button onClick={onClose} className="w-8 h-8 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted">
            <X className="w-3.5 h-3.5" />
          </button>
        </header>

        {/* Tab strip */}
        <div className="px-5 h-11 shrink-0 border-b bg-background flex items-center gap-1">
          {visibleTabs.map((t) => {
            const Icon = t.icon;
            const isActive = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id);
                  setDraft(seedForTab(t.id, draft, port));
                }}
                title={t.description}
                className={cn(
                  "h-9 px-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium border-b-2 -mb-px transition-colors",
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40",
                )}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={isActive ? 2.1 : 1.8} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Body — picker on the left, current selection on the right */}
        <div className="flex-1 grid grid-cols-[1fr_280px] overflow-hidden">
          <div className="overflow-auto px-5 py-4 border-r">
            {tab === "request" ? (
              <SchemaTreePanel schema={inputSchema} port={port} value={draftAsPath(draft)} onPick={(p) => setDraft({ kind: "path", path: p })} />
            ) : tab === "context" ? (
              <ContextPanel value={draftAsContext(draft)} onChange={(k) => setDraft({ kind: "context", key: k })} />
            ) : tab === "literal" ? (
              <LiteralPanel
                port={port}
                value={draftAsLiteral(draft)}
                onChange={(v) => setDraft({ kind: "literal", value: v })}
                inputSchema={inputSchema}
              />
            ) : tab === "ref" ? (
              <ReferenceMultiSelect
                value={draftAsRefSelect(draft)}
                onChange={(next) => setDraft(next)}
              />
            ) : tab === "date" ? (
              <DateBindingPicker value={draftAsDate(draft)} onChange={(next) => setDraft(next)} />
            ) : null}
          </div>

          <SelectionPanel preview={preview} draft={draft} />
        </div>

        {/* Footer */}
        <footer className="px-5 py-3 border-t shrink-0 flex items-center bg-muted/20">
          {onClear && initial ? (
            <Button variant="ghost" size="sm" onClick={() => { onClear(); onClose(); }} className="text-destructive">
              Clear binding
            </Button>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="default" size="sm" onClick={commit} disabled={!draft}>
              <Check className="w-3.5 h-3.5" /> Save binding
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

// ---------- panels ----------

function SchemaTreePanel({
  schema,
  port,
  value,
  onPick,
}: {
  schema: JsonSchema;
  port: NodePort;
  value: string;
  onPick: (path: string) => void;
}) {
  const tree = useMemo(() => walkSchema(schema, "$"), [schema]);
  const [filter, setFilter] = useState("");
  const f = filter.trim().toLowerCase();

  // Flat list of every compatible path — surfaced as quick-pick chips at the
  // top so the user sees "$.passengers" / "$.offer.bundles[*]" front-and-centre
  // when binding an iterator's source port, instead of having to dig through
  // the tree.
  const compatibleChoices = useMemo(() => {
    if (!tree) return [];
    const flat: SchemaPathNode[] = [];
    const visit = (n: SchemaPathNode) => {
      if (n.depth > 0 && isCompatible(n, port.type)) flat.push(n);
      n.children?.forEach(visit);
    };
    visit(tree);
    // Apply filter if active
    if (f) return flat.filter((n) => n.path.toLowerCase().includes(f) || (n.key?.toLowerCase().includes(f) ?? false));
    return flat;
  }, [tree, port.type, f]);

  // Apply hint suggestions on top — these get the gold tier
  const suggested = useMemo(() => {
    if (!port.hint || compatibleChoices.length === 0) return [];
    const namePatterns = port.hint.namePattern ? new RegExp(port.hint.namePattern, "i") : null;
    const fieldPatterns = port.hint.fieldHint ? new RegExp(port.hint.fieldHint, "i") : null;
    return compatibleChoices.filter((n) => {
      const segments = n.path.split(/[.\[\]]+/);
      const last = segments[segments.length - 1] || segments[segments.length - 2] || "";
      if (fieldPatterns && fieldPatterns.test(last)) return true;
      if (namePatterns && segments.some((s) => namePatterns.test(s))) return true;
      return false;
    }).slice(0, 6);
  }, [port.hint, compatibleChoices]);

  const showChipStrip = compatibleChoices.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium mb-1.5">
          Pick a field from the request
        </div>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter fields…"
          className="font-mono"
        />
      </div>

      {showChipStrip ? (
        <div className="rounded-md border bg-muted/30 p-2 flex flex-col gap-1.5">
          {suggested.length > 0 ? (
            <>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium px-0.5">
                Best match{suggested.length === 1 ? "" : "es"} for this port
              </div>
              <div className="flex flex-wrap gap-1">
                {suggested.map((n) => (
                  <PathChip key={n.path} node={n} onPick={onPick} value={value} highlighted />
                ))}
              </div>
              <div className="border-t border-border/60 mt-1.5 mb-1" />
            </>
          ) : null}
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium px-0.5">
            All compatible ({compatibleChoices.length})
          </div>
          <div className="flex flex-wrap gap-1 max-h-[140px] overflow-auto">
            {compatibleChoices.slice(0, 60).map((n) => (
              <PathChip key={n.path} node={n} onPick={onPick} value={value} />
            ))}
            {compatibleChoices.length > 60 ? (
              <span className="text-[10.5px] font-mono text-muted-foreground italic px-1.5 h-5 inline-flex items-center">
                +{compatibleChoices.length - 60} more in tree below
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium mb-1">
          Full structure
        </div>
        <div className="rounded-md border bg-card p-2 max-h-[260px] overflow-auto">
          {tree ? (
            <SchemaTreeNode node={tree} selectedPath={value} onPick={onPick} portType={port.type} filter={f} />
          ) : (
            <div className="text-[11.5px] text-muted-foreground italic">No schema yet — add fields in the Schema tab.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PathChip({
  node,
  value,
  onPick,
  highlighted,
}: {
  node: SchemaPathNode;
  value: string;
  onPick: (p: string) => void;
  highlighted?: boolean;
}) {
  const isActive = node.path === value;
  return (
    <button
      type="button"
      onClick={() => onPick(node.path)}
      className={cn(
        "font-mono text-[10.5px] px-1.5 h-6 rounded border transition-colors max-w-full truncate",
        isActive
          ? "bg-foreground text-background border-foreground"
          : highlighted
            ? "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900"
            : "bg-background text-foreground border-border hover:border-foreground/30",
      )}
      title={`${node.path} · ${node.type}`}
    >
      {node.path}
    </button>
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
  const compatible = isCompatible(node, portType);
  const matchesFilter = !filter || node.path.toLowerCase().includes(filter) || node.key?.toLowerCase().includes(filter);

  // If a filter is active, hide branches with no descendants matching.
  if (filter) {
    const anyMatch = matchesFilter || hasMatchingChild(node, filter);
    if (!anyMatch) return null;
  }

  const hasChildren = (node.children?.length ?? 0) > 0;
  const isSelected = node.path === selectedPath;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => compatible && onPick(node.path)}
        disabled={!compatible}
        className={cn(
          "text-left flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] transition-colors",
          isSelected ? "bg-foreground text-background"
          : compatible ? "hover:bg-muted/60 text-foreground"
          : "text-muted-foreground/50 cursor-not-allowed",
        )}
        style={{ paddingLeft: 8 + node.depth * 14 }}
        title={!compatible ? `${node.type} doesn't fit this ${portType} port` : node.path}
      >
        <span className="font-mono text-[11.5px] truncate">{node.key ?? "$"}</span>
        <span className={cn("text-[10px] tabular-nums ml-auto pl-2", isSelected ? "opacity-80" : "text-muted-foreground/70")}>
          {prettyType(node.type)}
        </span>
      </button>
      {hasChildren ? (
        <div className="flex flex-col">
          {node.children!.map((child, i) => (
            <SchemaTreeNode
              key={i}
              node={child}
              selectedPath={selectedPath}
              onPick={onPick}
              portType={portType}
              filter={filter}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ContextPanel({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const presets = ["pax.id", "pax.paxType", "pax.ageCategory", "pax.dateOfBirth", "ctx.computedAge", "bound.origin", "bound.destination", "segment.cabin"];
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium mb-1.5">
          Iteration variable or context key
        </div>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="pax.id  or  ctx.computedAge"
          className="font-mono"
        />
        <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
          When this rule iterates over a list (e.g. each passenger), the current item is available as <code className="font-mono">$pax</code> /
          <code className="font-mono">$bound</code> / <code className="font-mono">$segment</code>. Anything saved with a Calculate node
          is in <code className="font-mono">$ctx</code>.
        </p>
      </div>
      <div>
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium mb-1.5">Common</div>
        <div className="grid grid-cols-2 gap-1.5">
          {presets.map((p) => {
            const isActive = value === p;
            return (
              <button
                key={p}
                onClick={() => onChange(p)}
                className={cn(
                  "text-left font-mono text-[11.5px] px-2 py-1.5 rounded border transition-colors",
                  isActive
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card text-foreground border-border hover:border-foreground/30",
                )}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LiteralPanel({ port, value, onChange, inputSchema }: { port: NodePort; value: unknown; onChange: (v: unknown) => void; inputSchema: JsonSchema }) {
  if (port.type === "object" || port.type === "any") {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">
          Define the shape, field by field
        </div>
        <ObjectShapeEditor
          value={value}
          onChange={onChange}
          inputSchema={inputSchema}
        />
      </div>
    );
  }
  if (port.type === "boolean") {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={cn("h-10 px-4 rounded-md border text-[13px] font-medium", value === true ? "bg-foreground text-background border-foreground" : "bg-card border-border hover:border-foreground/30")}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={cn("h-10 px-4 rounded-md border text-[13px] font-medium", value === false ? "bg-foreground text-background border-foreground" : "bg-card border-border hover:border-foreground/30")}
        >
          No
        </button>
      </div>
    );
  }
  if (port.type === "number" || port.type === "integer") {
    return (
      <Input
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        placeholder="0"
      />
    );
  }
  if (port.type === "string-array" || port.type === "number-array") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-col gap-1.5">
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">
          Values (one per line)
        </div>
        <textarea
          rows={8}
          className="w-full text-[12px] font-mono px-2.5 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-foreground/30"
          value={arr.join("\n")}
          onChange={(e) => {
            const items = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
            onChange(port.type === "number-array" ? items.map(Number) : items);
          }}
          placeholder={port.type === "number-array" ? "1\n2\n3" : "ADT\nCHD\nINF"}
        />
        <span className="text-[10.5px] text-muted-foreground italic">
          Tip: switch to <em>From Ref</em> to pick rows from a reference table instead of typing.
        </span>
      </div>
    );
  }
  // Fallback: plain string
  return (
    <Input
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="literal value"
    />
  );
}

function SelectionPanel({ preview, draft }: { preview: string; draft: PortBinding | undefined }) {
  const kindLabel = draft?.kind === "ref-select" ? "from reference"
    : draft?.kind === "path" ? "from request"
    : draft?.kind === "context" ? "from context"
    : draft?.kind === "date" ? "date"
    : draft?.kind === "literal" ? "literal"
    : draft?.kind === "count-of" ? "count of"
    : "—";
  return (
    <div className="overflow-auto p-4 bg-muted/20 flex flex-col gap-3">
      <div className="rounded-md border bg-card px-3.5 py-3">
        <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/80 font-semibold mb-1.5">Selected</div>
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium mb-0.5">
          {kindLabel}
        </div>
        <div className="text-[12.5px] font-medium text-foreground break-words">
          {preview || <span className="text-muted-foreground italic">Pick a value to bind</span>}
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground leading-relaxed">
        The picker on the left writes to this binding live. Click <strong>Save&nbsp;binding</strong>
        when you&rsquo;re happy, or <strong>Cancel</strong> to back out.
      </div>
    </div>
  );
}

// ---------- helpers ----------

function deriveTab(initial: PortBinding | undefined, port: NodePort): Tab {
  if (initial?.kind === "path") return "request";
  if (initial?.kind === "context") return "context";
  if (initial?.kind === "literal") return "literal";
  if (initial?.kind === "ref-select" || initial?.kind === "reference") return "ref";
  if (initial?.kind === "date") return "date";
  // No binding yet — pick the most natural default based on port type.
  if (port.type === "date") return "date";
  if (port.type === "string-array" || port.type === "number-array") return "ref";
  return "request";
}

function isTabAllowed(tab: Tab, port: NodePort): boolean {
  if (tab === "ref") return port.type === "string-array" || port.type === "number-array" || port.type === "string" || port.type === "any";
  if (tab === "date") return port.type === "date";
  return true;
}

function seedForTab(tab: Tab, current: PortBinding | undefined, port: NodePort): PortBinding | undefined {
  if (tab === "request") return current?.kind === "path" ? current : { kind: "path", path: "" };
  if (tab === "context") return current?.kind === "context" ? current : { kind: "context", key: "" };
  if (tab === "literal") return current?.kind === "literal" ? current : { kind: "literal", value: defaultLiteralForPort(port) };
  if (tab === "ref") return current?.kind === "ref-select" ? current : { kind: "ref-select", referenceId: "", valueColumn: "" };
  if (tab === "date") return current?.kind === "date" ? current : { kind: "date", mode: "absolute", date: new Date().toISOString().slice(0, 10) };
  return current;
}

function defaultLiteralForPort(port: NodePort): unknown {
  if (port.type === "number" || port.type === "integer") return 0;
  if (port.type === "boolean") return false;
  if (port.type === "string-array" || port.type === "number-array") return [];
  return "";
}

function draftAsPath(d: PortBinding | undefined): string {
  return d?.kind === "path" ? d.path : "";
}
function draftAsContext(d: PortBinding | undefined): string {
  return d?.kind === "context" ? d.key : "";
}
function draftAsLiteral(d: PortBinding | undefined): unknown {
  return d?.kind === "literal" ? d.value : "";
}
function draftAsRefSelect(d: PortBinding | undefined): Extract<PortBinding, { kind: "ref-select" }> {
  return d?.kind === "ref-select" ? d : { kind: "ref-select", referenceId: "", valueColumn: "" };
}
function draftAsDate(d: PortBinding | undefined): Extract<PortBinding, { kind: "date" }> {
  return d?.kind === "date" ? d : { kind: "date", mode: "absolute", date: new Date().toISOString().slice(0, 10) };
}

function describePortBinding(b: PortBinding | undefined): string {
  if (!b) return "";
  if (b.kind === "path") return b.path || "(no path)";
  if (b.kind === "context") return `$${b.key || "..."}`;
  if (b.kind === "literal") {
    if (Array.isArray(b.value)) return `${b.value.length} value${b.value.length === 1 ? "" : "s"}: ${b.value.slice(0, 4).join(", ")}${b.value.length > 4 ? "…" : ""}`;
    if (typeof b.value === "string") return b.value || "(empty text)";
    return String(b.value);
  }
  if (b.kind === "ref-select") {
    const n = b.whereValues?.length ?? 0;
    return `${n} value${n === 1 ? "" : "s"} from ${b.referenceId || "reference"}`;
  }
  if (b.kind === "reference") return `→ ${b.referenceId}`;
  if (b.kind === "date") {
    if (b.mode === "absolute") return b.date ?? "(pick a date)";
    if (b.mode === "relative-window") return `within the ${b.direction} ${b.amount} ${b.unit}`;
    if (b.mode === "day-of-week") return `weekday in ${(b.values ?? []).join(", ")}`;
    if (b.mode === "month-of-year") return `month in ${(b.values ?? []).join(", ")}`;
    if (b.mode === "is-weekend") return b.values?.[0] === 1 ? "is a weekend" : "is a weekday";
    return b.mode;
  }
  if (b.kind === "count-of") return `count of ${b.arrayPath}`;
  return "";
}

function isCompatible(node: SchemaPathNode, portType: NodePort["type"]): boolean {
  const t = node.type;
  if (portType === "any") return true;
  // Iterators / per-element binders want arrays specifically — NOT objects.
  if (portType === "object-array") return t === "array" || t === "any";
  if (portType === "object") return t === "object" || t === "any";
  if (portType === "string-array" || portType === "number-array") return t === "array" || t === "any";
  if (portType === "string") return t === "string" || t === "any";
  if (portType === "number" || portType === "integer") return t === "number" || t === "integer" || t === "any";
  if (portType === "date") return t === "string" || t === "any"; // dates are strings in JSON Schema
  if (portType === "boolean") return t === "boolean" || t === "any";
  return true;
}

function hasMatchingChild(node: SchemaPathNode, filter: string): boolean {
  if (!node.children) return false;
  return node.children.some((c) => c.path.toLowerCase().includes(filter) || c.key?.toLowerCase().includes(filter) || hasMatchingChild(c, filter));
}

function prettyType(t: string): string {
  if (t === "object-array") return "[obj]";
  if (t === "string-array") return "[str]";
  if (t === "number-array") return "[num]";
  return t;
}
