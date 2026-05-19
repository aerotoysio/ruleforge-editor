"use client";

import { useRuleStore } from "@/lib/store/rule-store";
import { DesignerHeader } from "./DesignerHeader";

export function RuleMetadataDesigner() {
  const rule = useRuleStore((s) => s.rule);
  const patch = useRuleStore((s) => s.patchRule);
  if (!rule) return null;

  return (
    <div className="flex flex-col h-full">
      <DesignerHeader title="Rule metadata" subtitle={rule.id} badge="META" accent="#5b3a72" />
      <div className="popup-body" style={{ flex: 1 }}>
        <Section title="Basics">
          <FieldRow label="Name">
            <input
              className="input"
              value={rule.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </FieldRow>
          <FieldRow label="Description">
            <input
              className="input"
              value={rule.description ?? ""}
              onChange={(e) => patch({ description: e.target.value || undefined })}
            />
          </FieldRow>
          <FieldRow label="Status">
            <select
              className="input"
              value={rule.status}
              onChange={(e) => patch({ status: e.target.value as typeof rule.status })}
            >
              <option value="draft">draft</option>
              <option value="review">review</option>
              <option value="published">published</option>
            </select>
          </FieldRow>
          <FieldRow label="Version">
            <input
              className="input"
              type="number"
              value={rule.currentVersion}
              onChange={(e) => patch({ currentVersion: Math.max(1, Number(e.target.value) || 1) })}
            />
          </FieldRow>
        </Section>

        <Section title="Endpoint">
          <FieldRow label="Method">
            <select
              className="input"
              value={rule.method}
              onChange={(e) => patch({ method: e.target.value as "GET" | "POST" })}
            >
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </select>
          </FieldRow>
          <FieldRow label="Path">
            <input
              className="input mono"
              style={{ fontFamily: "var(--font-mono)" }}
              value={rule.endpoint}
              onChange={(e) => patch({ endpoint: e.target.value })}
            />
          </FieldRow>
        </Section>

        <Section title="Composition">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Nodes" value={rule.instances.length} />
            <Stat label="Edges" value={rule.edges.length} />
            <Stat label="Tests" value={rule.tests.length} />
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="field-group">
      <span className="field-label">{title}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </section>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: "var(--text)",
          letterSpacing: "-0.005em",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        borderRadius: 7,
        border: "1px solid var(--border)",
        background: "var(--panel-2)",
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          lineHeight: 1,
          color: "var(--text)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}
