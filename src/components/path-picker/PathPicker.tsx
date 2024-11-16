"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Wand2, Crosshair } from "lucide-react";
import type { JsonSchema, PathHint } from "@/lib/types";
import { walkSchema, type SchemaPathNode } from "@/lib/schema/path-walker";
import { Input } from "@/components/ui/Input";

type Props = {
  schema?: JsonSchema | null;
  value: string;
  onChange: (next: string) => void;
  hint?: PathHint;
  placeholder?: string;
  rootSymbol?: "$" | "$ctx";
};

export function PathPicker({ schema, value, onChange, hint, placeholder = "$.field.path", rootSymbol = "$" }: Props) {
  const [open, setOpen] = useState(false);
  const tree = useMemo(() => (schema ? walkSchema(schema, rootSymbol) : null), [schema, rootSymbol]);
  const suggestions = useMemo(() => {
    if (!tree || !hint) return [];
    return scoreSuggestions(tree, hint).slice(0, 5);
  }, [tree, hint]);

  // Show top 2 inline (without clicking Pick) — when there's a hint and the
  // current value is empty or doesn't match a suggestion, surface them.
  const inlineSuggestions = suggestions.slice(0, 2);
  const showInline = inlineSuggestions.length > 0 && (!value || !inlineSuggestions.some((s) => s.path === value));

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex gap-1.5">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="font-mono"
        />
        <button
          onClick={() => setOpen(!open)}
          disabled={!schema}
          className={
            "h-8 px-2 rounded-md inline-flex items-center gap-1 text-[12px] border transition-colors " +
            (open
              ? "bg-foreground text-background border-foreground"
              : "bg-card text-foreground border-border hover:border-foreground/30")
          }
          title={schema ? "Pick from schema" : "No schema available"}
        >
          <Crosshair className="w-3.5 h-3.5" />
          Pick
        </button>
      </div>

      {showInline ? (
        <div className="flex items-center gap-1 flex-wrap">
          <Wand2 className="w-2.5 h-2.5 text-muted-foreground/70" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium mr-1">Suggested:</span>
          {inlineSuggestions.map((s) => (
            <button
              key={s.path}
              onClick={() => onChange(s.path)}
              className="font-mono text-[10.5px] px-1.5 h-5 rounded bg-muted/60 text-foreground hover:bg-muted transition-colors max-w-[60%] truncate"
              title={`${s.path} · ${s.type}`}
            >
              {s.path}
            </button>
          ))}
        </div>
      ) : null}

      {open && schema && tree ? (
        <div className="rounded-md p-2 max-h-72 overflow-auto bg-muted/30 border">
          {suggestions.length > 0 ? (
            <div className="mb-2 flex flex-col gap-1">
              <div className="text-[10px] uppercase tracking-wider flex items-center gap-1.5 text-muted-foreground/80 font-medium">
                <Wand2 className="w-3 h-3" /> Best matches
              </div>
              {suggestions.map((s) => (
                <button
                  key={s.path}
                  onClick={() => { onChange(s.path); setOpen(false); }}
                  className="text-left font-mono text-[11.5px] px-2 py-1 rounded bg-card border border-border hover:border-foreground/30 transition-colors truncate"
                  title={s.path}
                >
                  {s.path} <span className="text-muted-foreground">· {s.type}</span>
                </button>
              ))}
              <hr className="my-1.5 border-t border-border" />
            </div>
          ) : null}
          <PathTreeNode node={tree} onPick={(p) => { onChange(p); setOpen(false); }} />
        </div>
      ) : null}
    </div>
  );
}

function PathTreeNode({ node, onPick }: { node: SchemaPathNode; onPick: (path: string) => void }) {
  const [open, setOpen] = useState(node.depth < 1);
  const hasChildren = (node.children?.length ?? 0) > 0;
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 py-0.5" style={{ paddingLeft: node.depth * 12 }}>
        <button
          onClick={() => hasChildren && setOpen(!open)}
          className="w-4 h-4 flex items-center justify-center"
          style={{ visibility: hasChildren ? "visible" : "hidden", color: "var(--color-fg-dim)" }}
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        <button
          onClick={() => onPick(node.path)}
          className="text-left text-[11.5px] inline-flex items-center gap-1.5 px-1 py-0.5 rounded hover:underline"
          style={{ color: "var(--color-fg)" }}
          title={node.path}
        >
          <span className="mono">{node.label}</span>
          <span className="text-[10px]" style={{ color: "var(--color-fg-dim)" }}>{node.type}</span>
          {node.schema.description ? (
            <span className="text-[10px] truncate" style={{ color: "var(--color-fg-muted)", maxWidth: 240 }}>
              · {node.schema.description}
            </span>
          ) : null}
        </button>
      </div>
      {open && hasChildren ? (
        <div className="flex flex-col">
          {node.children!.map((c) => (
            <PathTreeNode key={c.path} node={c} onPick={onPick} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function scoreSuggestions(root: SchemaPathNode, hint: PathHint): SchemaPathNode[] {
  const namePattern = hint.namePattern ? new RegExp(hint.namePattern, "i") : null;
  const fieldPattern = hint.fieldHint ? new RegExp(hint.fieldHint, "i") : null;
  const wantTypes = hint.schemaTypes ? new Set(hint.schemaTypes) : null;

  const all: { node: SchemaPathNode; score: number }[] = [];
  const visit = (node: SchemaPathNode) => {
    let score = 0;
    if (namePattern) {
      const segs = node.path.split(/[.[]+/).filter(Boolean);
      const last = segs[segs.length - 1] ?? "";
      if (namePattern.test(last)) score += 4;
      if (namePattern.test(node.path)) score += 1;
    }
    if (fieldPattern && fieldPattern.test(node.label)) score += 3;
    if (wantTypes && wantTypes.has(node.type as string)) score += 2;
    if (hint.shape === "array-of-objects" && node.path.includes("[*]")) score += 1;
    if (hint.shape === "scalar" && node.type !== "object" && node.type !== "array") score += 1;

    if (score > 0) all.push({ node, score });
    node.children?.forEach(visit);
  };
  visit(root);
  return all.sort((a, b) => b.score - a.score).map((x) => x.node);
}
