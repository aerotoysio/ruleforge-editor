"use client";

import { useEffect, useMemo, useState } from "react";
import type { PortBinding } from "@/lib/types";
import { useAssetsStore } from "@/lib/store/assets-store";
import { useTemplatesStore } from "@/lib/store/templates-store";
import { AssetPicker } from "./AssetPicker";
import { RequestFieldSelect } from "./RequestFieldSelect";
import type { LoopVar } from "@/lib/rule/loop-vars";

// The friendly, no-regex editor for the Parse-string (SSR) node. One panel:
//  1. which incoming string to parse
//  2. a {token} pattern (with live chips)
//  3. a "try it" preview that splits a sample exactly as the engine will
//  4. the saved product (asset) to fill
//  5. token → product-field mapping (dropdowns of the asset's fields)
// The parse helpers below mirror RuleRunner.ParseByPattern char-for-char so the
// preview is faithful to runtime.
export function TextParseEditor({
  draft,
  setBinding,
  loopVars,
  inputSchema,
}: {
  draft: Record<string, PortBinding>;
  setBinding: (port: string, b: PortBinding | null) => void;
  loopVars?: LoopVar[];
  inputSchema?: unknown;
}) {
  const assets = useAssetsStore((s) => s.assets);
  const assetsLoaded = useAssetsStore((s) => s.loaded);
  const loadAssets = useAssetsStore((s) => s.load);
  useEffect(() => { if (!assetsLoaded) void loadAssets(); }, [assetsLoaded, loadAssets]);
  const templates = useTemplatesStore((s) => s.templates);
  const templatesLoaded = useTemplatesStore((s) => s.loaded);
  const loadTemplates = useTemplatesStore((s) => s.load);
  useEffect(() => { if (!templatesLoaded) void loadTemplates(); }, [templatesLoaded, loadTemplates]);

  const sourcePath = draft.source?.kind === "path" ? draft.source.path : "";
  const pattern = draft.pattern?.kind === "literal" && typeof draft.pattern.value === "string" ? draft.pattern.value : "";
  const mapping: Record<string, string> =
    draft.mapping?.kind === "literal" && draft.mapping.value && typeof draft.mapping.value === "object" && !Array.isArray(draft.mapping.value)
      ? (draft.mapping.value as Record<string, string>)
      : {};
  // Output target: a saved Asset, or an output Template (a reusable shape).
  const assetBinding = draft.asset;
  const [outputMode, setOutputMode] = useState<"asset" | "template">(assetBinding?.kind === "template-ref" ? "template" : "asset");
  const assetId = assetBinding?.kind === "asset" ? assetBinding.assetId : "";
  const asset = assets.find((a) => a.id === assetId);
  const templateId = assetBinding?.kind === "template-ref" ? assetBinding.templateId : "";
  const template = templates.find((t) => t.id === templateId);
  const outputFields: string[] = outputMode === "template"
    ? (template?.fields.map((f) => f.name) ?? [])
    : (asset ? Object.keys(asset.values) : []);

  const tokens = useMemo(() => parseTokens(pattern), [pattern]);

  const [sample, setSample] = useState("");
  const parsed = useMemo(() => applyPattern(sample, pattern), [sample, pattern]);

  function setMapping(token: string, field: string) {
    const next = { ...mapping };
    if (field) next[token] = field;
    else delete next[token];
    setBinding("mapping", Object.keys(next).length ? { kind: "literal", value: next } : null);
  }

  const chip = (text: string, accent = false): React.CSSProperties => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 6,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    background: accent ? "rgba(13,148,136,0.12)" : "var(--surface-2, rgba(127,127,127,0.1))",
    color: accent ? "#0d9488" : "var(--text)",
    border: "1px solid " + (accent ? "rgba(13,148,136,0.35)" : "var(--border, rgba(127,127,127,0.25))"),
  });

  return (
    <>
      {/* 1 — source */}
      <section className="field-group">
        <span className="field-label">String to parse<span className="req-pill">req</span></span>
        <p className="field-hint">Which incoming field holds the packed string (e.g. an SSR). Inside a loop, pick the loop variable (e.g. <code>$item</code>).</p>
        <RequestFieldSelect
          value={sourcePath}
          onChange={(p) => setBinding("source", p ? { kind: "path", path: p } : null)}
          schema={inputSchema}
          loopVars={loopVars}
          placeholder="$.ssr"
        />
      </section>

      {/* 2 — pattern */}
      <section className="field-group">
        <span className="field-label">Pattern<span className="req-pill">req</span></span>
        <p className="field-hint">
          Name each part inside <code>{"{ }"}</code>. Whatever sits between the braces (usually a space) is the separator — no regex.
          Example: <code>{"{ssr} {type} {paxRef} {class} {detail}"}</code>
        </p>
        <input
          className="input mono"
          style={{ fontFamily: "var(--font-mono)" }}
          value={pattern}
          onChange={(e) => setBinding("pattern", e.target.value ? { kind: "literal", value: e.target.value } : null)}
          placeholder="{ssr} {type} {paxRef} {class} {detail}"
        />
        {tokens.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {tokens.map((t) => <span key={t} style={chip(t, true)}>{t}</span>)}
          </div>
        )}
      </section>

      {/* 3 — live preview */}
      <section className="field-group">
        <span className="field-label">Try it</span>
        <p className="field-hint">Paste an example to see exactly how it splits (this is what the engine does).</p>
        <input
          className="input mono"
          style={{ fontFamily: "var(--font-mono)" }}
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          placeholder="SSR BIKE P1 F OVERSIZE"
        />
        {sample && tokens.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {tokens.map((t) => (
              <span key={t} style={{ display: "inline-flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                <span style={chip(t, false)}>{t}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "#0d9488" }}>
                  {parsed[t] ? parsed[t] : "—"}
                </span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 4 — output: a saved asset or a template shape */}
      <section className="field-group">
        <span className="field-label">Output shape</span>
        <p className="field-hint">Emit a saved <strong>product</strong> (asset), or fill an output <strong>template</strong> (a reusable shape like Passenger). Mapped tokens below fill its fields.</p>
        <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border, #d4d4d8)", marginBottom: 8 }}>
          <button type="button" onClick={() => { setOutputMode("asset"); if (draft.asset?.kind !== "asset") setBinding("asset", null); }} style={segStyle(outputMode === "asset")}>Saved product</button>
          <button type="button" onClick={() => { setOutputMode("template"); if (draft.asset?.kind !== "template-ref") setBinding("asset", null); }} style={segStyle(outputMode === "template")}>Template</button>
        </div>
        {outputMode === "asset" ? (
          <AssetPicker
            binding={assetBinding}
            onChange={(b) => setBinding("asset", b)}
            hint="Mapped tokens below overwrite this product's fields; everything else passes through unchanged."
          />
        ) : (
          <select
            className="input"
            value={templateId}
            onChange={(e) => setBinding("asset", e.target.value ? { kind: "template-ref", templateId: e.target.value } : null)}
          >
            <option value="">— choose a template —</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </section>

      {/* 5 — mapping */}
      <section className="field-group">
        <span className="field-label">Map each part to a field</span>
        <p className="field-hint">Choose which output field each part of the string fills. Leave a part on “(ignore)” to drop it.</p>
        {tokens.length === 0 ? (
          <div className="struct-rows-empty">Add a pattern above first — its parts appear here to map.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tokens.map((t) => (
              <div key={t} style={{ display: "grid", gridTemplateColumns: "minmax(80px,140px) 16px 1fr", alignItems: "center", gap: 8 }}>
                <span style={chip(t, true)}>{t}</span>
                <span style={{ textAlign: "center", color: "var(--muted)" }}>→</span>
                {outputFields.length > 0 ? (
                  <select className="input" value={mapping[t] ?? ""} onChange={(e) => setMapping(t, e.target.value)}>
                    <option value="">(ignore)</option>
                    {outputFields.map((f) => <option key={f} value={f}>{f}</option>)}
                    {mapping[t] && !outputFields.includes(mapping[t]) ? <option value={mapping[t]}>{mapping[t]} (new)</option> : null}
                  </select>
                ) : (
                  <input
                    className="input mono"
                    style={{ fontFamily: "var(--font-mono)" }}
                    value={mapping[t] ?? ""}
                    onChange={(e) => setMapping(t, e.target.value)}
                    placeholder="fieldName"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// ─── parse helpers — mirror RuleRunner.ParseByPattern exactly ───────────────

function parseTokens(pattern: string): string[] {
  const tokens: string[] = [];
  const re = /\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pattern)) !== null) tokens.push(m[1].trim());
  return tokens;
}

function applyPattern(input: string, pattern: string): Record<string, string> {
  const tokenNames: string[] = [];
  const literals: string[] = []; // literal text preceding each token
  let lit = "";
  for (let i = 0; i < pattern.length; ) {
    if (pattern[i] === "{") {
      const close = pattern.indexOf("}", i);
      if (close < 0) { lit += pattern[i]; i++; continue; }
      literals.push(lit); lit = "";
      tokenNames.push(pattern.slice(i + 1, close).trim());
      i = close + 1;
    } else {
      lit += pattern[i]; i++;
    }
  }
  const trailing = lit;

  const result: Record<string, string> = {};
  let pos = 0;
  for (let k = 0; k < tokenNames.length; k++) {
    const before = literals[k];
    if (before.length > 0) {
      const idx = input.indexOf(before, pos);
      if (idx >= 0) pos = idx + before.length;
    }
    let value: string;
    if (k === tokenNames.length - 1) {
      value = pos <= input.length ? input.slice(pos) : "";
      if (trailing.length > 0 && value.endsWith(trailing)) value = value.slice(0, value.length - trailing.length);
    } else {
      const next = literals[k + 1];
      const nextIdx = next.length === 0 ? -1 : input.indexOf(next, pos);
      if (nextIdx >= 0) { value = input.slice(pos, nextIdx); pos = nextIdx; }
      else { value = pos <= input.length ? input.slice(pos) : ""; pos = input.length; }
    }
    result[tokenNames[k]] = value.trim();
  }
  return result;
}

function segStyle(active: boolean): React.CSSProperties {
  return { fontSize: 11, fontWeight: 600, padding: "5px 12px", border: 0, cursor: "pointer", background: active ? "var(--accent, #2563eb)" : "transparent", color: active ? "#fff" : "var(--text-muted, #71717a)" };
}
