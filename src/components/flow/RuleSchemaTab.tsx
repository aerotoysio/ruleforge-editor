"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRuleStore } from "@/lib/store/rule-store";
import { useSchemaTemplatesStore } from "@/lib/store/schema-templates-store";
import { SchemaEditor } from "@/components/schema-editor/SchemaEditor";
import type { JsonSchema, SchemaTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Box,
  Braces,
  ExternalLink,
  Link2,
  Link2Off,
} from "lucide-react";

type Kind = "input" | "output" | "context";

const TABS: { kind: Kind; label: string; description: string; icon: typeof ArrowDownToLine }[] = [
  { kind: "input",   label: "Input",   description: "Request body sent to this rule's endpoint.",          icon: ArrowDownToLine },
  { kind: "output",  label: "Output",  description: "Response shape returned to callers.",                  icon: ArrowUpFromLine },
  { kind: "context", label: "Context", description: "Per-evaluation values nodes write to and read from.",  icon: Box },
];

export function RuleSchemaTab() {
  const rule = useRuleStore((s) => s.rule);
  const patch = useRuleStore((s) => s.patchRule);
  const [active, setActive] = useState<Kind>("input");

  // Load schema templates so the "Shared template" picker has data.
  const templates = useSchemaTemplatesStore((s) => s.templates);
  const loaded = useSchemaTemplatesStore((s) => s.loaded);
  const load = useSchemaTemplatesStore((s) => s.load);
  const byId = useSchemaTemplatesStore((s) => s.byId);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  if (!rule) return null;

  // Which template ref applies to the active schema kind.
  const refField: keyof typeof rule =
    active === "input" ? "inputSchemaRef"
    : active === "output" ? "outputSchemaRef"
    : "contextSchemaRef";
  const currentRef = (rule[refField] as string | undefined) ?? undefined;
  const linkedTpl = byId(currentRef);

  const value: JsonSchema =
    active === "input"  ? rule.inputSchema
    : active === "output" ? rule.outputSchema
    : (rule.contextSchema ?? { type: "object", properties: {} });

  function onChange(next: JsonSchema) {
    if (active === "input")  patch({ inputSchema: next });
    if (active === "output") patch({ outputSchema: next });
    if (active === "context") patch({ contextSchema: next });
  }

  function pickTemplate(templateId: string) {
    const tpl = byId(templateId);
    if (!tpl) return;
    // Set the ref AND copy the resolved schema into the live in-memory shape
    // so the canvas / node bindings re-validate immediately. The on-save path
    // writes a snapshot to schema/*.json + persists the ref to rule.json.
    if (active === "input") patch({ inputSchemaRef: templateId, inputSchema: tpl.schema });
    if (active === "output") patch({ outputSchemaRef: templateId, outputSchema: tpl.schema });
    if (active === "context") patch({ contextSchemaRef: templateId, contextSchema: tpl.schema });
  }

  function unlinkTemplate() {
    // Detach the ref but keep the current shape in memory so the user can
    // edit it inline without losing work. They can re-pick a template later.
    if (active === "input") patch({ inputSchemaRef: undefined });
    if (active === "output") patch({ outputSchemaRef: undefined });
    if (active === "context") patch({ contextSchemaRef: undefined });
  }

  // Pre-filter the picker to templates matching the active kind's intent —
  // input tab shows input-flagged templates by default, etc. Templates with
  // no intent show in every list (treated as "any").
  const intent: SchemaTemplate["intent"] = active;
  const matchingTemplates = templates.filter((t) => !t.intent || t.intent === intent);
  const otherTemplates = templates.filter((t) => t.intent && t.intent !== intent);

  return (
    <div
      className="flex-1 flex overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {/* Sub-nav: input / output / context */}
      <aside
        className="shrink-0 flex flex-col"
        style={{
          width: 232,
          borderRight: "1px solid var(--border)",
          background: "var(--panel)",
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="field-label">Schemas</div>
        </div>
        <nav style={{ padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = t.kind === active;
            const hasRef = !!(rule[
              t.kind === "input" ? "inputSchemaRef" : t.kind === "output" ? "outputSchemaRef" : "contextSchemaRef"
            ] as string | undefined);
            return (
              <button
                key={t.kind}
                onClick={() => setActive(t.kind)}
                className={cn("settings-nav-item")}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 0,
                  ...(isActive
                    ? {
                        background: "var(--accent-soft)",
                        borderLeft: "2px solid var(--accent)",
                      }
                    : { borderLeft: "2px solid transparent" }),
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "var(--panel-2)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                <Icon
                  className="w-3.5 h-3.5 shrink-0"
                  strokeWidth={isActive ? 2.2 : 1.8}
                  style={{ marginTop: 2, color: isActive ? "var(--accent)" : "var(--text-muted)" }}
                />
                <div style={{ display: "flex", flexDirection: "column", textAlign: "left", lineHeight: 1.25, flex: 1 }}>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: isActive ? "var(--accent)" : "var(--text)",
                    }}
                  >
                    {t.label}
                    {hasRef ? (
                      <Link2
                        className="w-3 h-3"
                        style={{ color: isActive ? "var(--accent)" : "var(--text-muted)" }}
                      />
                    ) : null}
                  </span>
                  <span
                    style={{
                      fontSize: 10.5,
                      lineHeight: 1.4,
                      marginTop: 2,
                      color: isActive ? "var(--accent)" : "var(--text-muted)",
                      opacity: isActive ? 0.85 : 1,
                    }}
                  >
                    {t.description}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>
      </aside>

      <div
        className="flex-1 overflow-auto"
        style={{ padding: "22px 28px" }}
      >
        <div
          className="flex flex-col gap-4"
          style={{ maxWidth: 1480, marginInline: "auto" }}
        >
          {/* Shared-template picker — sits ABOVE the inline editor. When a
              template is linked, the editor is read-only and shows a "go edit
              the template" affordance. When unlinked, the inline editor takes
              over. */}
          <section
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              padding: 16,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <Braces
              className="w-4 h-4 shrink-0"
              style={{ color: linkedTpl ? "var(--accent)" : "var(--text-muted)" }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)" }}>
                {linkedTpl ? `Linked to ${linkedTpl.name}` : "Shared schema template"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                {linkedTpl
                  ? "This rule's shape is sourced from the linked template. Edits to the template propagate to every referencing rule on next reload."
                  : "Optional. Link a shared template to inherit its shape, or define this rule's schema inline below."}
              </div>
            </div>
            <select
              className="input"
              style={{ width: 280 }}
              value={currentRef ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) {
                  unlinkTemplate();
                } else {
                  pickTemplate(v);
                }
              }}
            >
              <option value="">— Inline (no template) —</option>
              {matchingTemplates.length > 0 ? (
                <optgroup label={`Matching ${active}`}>
                  {matchingTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
              ) : null}
              {otherTemplates.length > 0 ? (
                <optgroup label="Other intents">
                  {otherTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.intent})</option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            {linkedTpl ? (
              <>
                <Link
                  href={`/schemas/${encodeURIComponent(linkedTpl.id)}`}
                  className="btn ghost sm"
                  title="Edit this shared template"
                >
                  <ExternalLink className="w-3 h-3" /> Edit template
                </Link>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={unlinkTemplate}
                  title="Detach from the shared template (keeps the current shape inline)"
                >
                  <Link2Off className="w-3 h-3" /> Unlink
                </button>
              </>
            ) : (
              <Link
                href="/schemas/new"
                className="btn ghost sm"
                title="Create a new shared template"
              >
                + New
              </Link>
            )}
          </section>

          {/* Inline schema editor — disabled when a template is linked, with
              a clear "go to template to edit" message. We still render the
              editor in read-only-ish mode so authors can SEE the current
              shape without bouncing to /schemas. */}
          <div
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              padding: 22,
              position: "relative",
            }}
          >
            {linkedTpl ? (
              <div
                style={{
                  marginBottom: 16,
                  padding: "10px 14px",
                  background: "var(--accent-soft)",
                  borderRadius: 7,
                  fontSize: 12,
                  color: "var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Link2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Shape is read-only here. Edits go through the linked template.
                </span>
              </div>
            ) : null}
            <div style={{ pointerEvents: linkedTpl ? "none" : "auto", opacity: linkedTpl ? 0.7 : 1 }}>
              <SchemaEditor schema={value} onChange={onChange} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
