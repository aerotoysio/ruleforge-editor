"use client";

import { useMemo } from "react";
import type { PortBinding } from "@/lib/types";
import { RequestFieldSelect } from "./RequestFieldSelect";

// Friendly editor for the Join / Enrich node. Reads almost like a sentence:
// "enrich <list> with matching items from <list>, where <key> = <key>, attach
// as <field>." The key pickers are dropdowns of each array's item fields.
export function JoinEditor({
  draft,
  setBinding,
  inputSchema,
}: {
  draft: Record<string, PortBinding>;
  setBinding: (port: string, b: PortBinding | null) => void;
  inputSchema?: unknown;
}) {
  const left = draft.left?.kind === "path" ? draft.left.path : "";
  const right = draft.right?.kind === "path" ? draft.right.path : "";
  const lit = (name: string): string => {
    const b = draft[name];
    return b?.kind === "literal" && typeof b.value === "string" ? b.value : "";
  };
  const leftKey = lit("leftKey");
  const rightKey = lit("rightKey");
  const asField = lit("as");
  const mode = lit("mode") || "collect";

  const leftFields = useMemo(() => itemFields(inputSchema, left), [inputSchema, left]);
  const rightFields = useMemo(() => itemFields(inputSchema, right), [inputSchema, right]);

  const setLit = (name: string, v: string) => setBinding(name, v ? { kind: "literal", value: v } : null);

  return (
    <>
      <section className="field-group">
        <span className="field-label">Enrich this list<span className="req-pill">req</span></span>
        <p className="field-hint">The records you want to add to — e.g. passengers.</p>
        <RequestFieldSelect value={left} onChange={(p) => setBinding("left", p ? { kind: "path", path: p } : null)} schema={inputSchema} placeholder="$.passengers" />
      </section>

      <section className="field-group">
        <span className="field-label">…with matching items from<span className="req-pill">req</span></span>
        <p className="field-hint">The related records to pull in — e.g. flights. Leave blank to use the previous node&rsquo;s output.</p>
        <RequestFieldSelect value={right} onChange={(p) => setBinding("right", p ? { kind: "path", path: p } : null)} schema={inputSchema} placeholder="$.flights" />
      </section>

      <section className="field-group">
        <span className="field-label">Match where<span className="req-pill">req</span></span>
        <p className="field-hint">The field on each side that links them (e.g. passenger.id = flight.paxId).</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <KeyField fields={leftFields} value={leftKey} onChange={(v) => setLit("leftKey", v)} placeholder="id" />
          <span style={{ color: "var(--text-muted, #71717a)", fontWeight: 700, fontSize: 15 }}>=</span>
          <KeyField fields={rightFields} value={rightKey} onChange={(v) => setLit("rightKey", v)} placeholder="paxId" />
        </div>
      </section>

      <section className="field-group">
        <span className="field-label">Attach matches as<span className="req-pill">req</span></span>
        <p className="field-hint">The new field on each left record that holds the matches.</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input className="input mono" style={{ width: "auto", minWidth: 150, fontFamily: "var(--font-mono)" }} value={asField} onChange={(e) => setLit("as", e.target.value)} placeholder="flights" />
          <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border, #d4d4d8)" }}>
            <button type="button" onClick={() => setLit("mode", "collect")} style={seg(mode !== "first")}>all matches</button>
            <button type="button" onClick={() => setLit("mode", "first")} style={seg(mode === "first")}>first only</button>
          </div>
        </div>
      </section>

      {left && right && leftKey && rightKey && asField ? (
        <div className="struct-rows-empty" style={{ fontSize: 12 }}>
          Each item in <code>{left}</code> gets a <code>{asField}</code> field ={" "}
          {mode === "first" ? "the first" : "all"} item{mode === "first" ? "" : "s"} from <code>{right}</code> where{" "}
          <code>{rightKey}</code> equals its <code>{leftKey}</code>.
        </div>
      ) : null}
    </>
  );
}

function KeyField({ fields, value, onChange, placeholder }: { fields: string[]; value: string; onChange: (v: string) => void; placeholder: string }) {
  if (fields.length === 0) {
    return (
      <input className="input mono" style={{ width: "auto", minWidth: 120, fontFamily: "var(--font-mono)" }} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    );
  }
  return (
    <select className="input" style={{ width: "auto" }} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— field —</option>
      {fields.map((f) => <option key={f} value={f}>{f}</option>)}
      {value && !fields.includes(value) ? <option value={value}>{value}</option> : null}
    </select>
  );
}

function seg(active: boolean): React.CSSProperties {
  return { fontSize: 11, fontWeight: 600, padding: "4px 11px", border: 0, cursor: "pointer", background: active ? "var(--accent, #2563eb)" : "transparent", color: active ? "#fff" : "var(--text-muted, #71717a)" };
}

// Resolve an array path in the schema → its item object's field names.
function itemFields(schema: unknown, arrayPath: string): string[] {
  if (!arrayPath) return [];
  type SchemaNode = { type?: string; properties?: Record<string, SchemaNode>; items?: SchemaNode };
  const parts = arrayPath.replace(/^\$\.?/, "").split(".").filter(Boolean);
  let node = schema as SchemaNode | undefined;
  for (const p of parts) {
    node = node?.properties?.[p];
    if (!node) return [];
  }
  const items = node?.type === "array" ? node.items : undefined;
  return items?.properties ? Object.keys(items.properties) : [];
}
