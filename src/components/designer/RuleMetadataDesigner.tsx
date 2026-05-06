"use client";

import { useRuleStore } from "@/lib/store/rule-store";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DesignerHeader } from "./DesignerHeader";

export function RuleMetadataDesigner() {
  const rule = useRuleStore((s) => s.rule);
  const patch = useRuleStore((s) => s.patchRule);
  if (!rule) return null;

  return (
    <div className="flex flex-col h-full">
      <DesignerHeader title="Rule metadata" subtitle={rule.id} badge="META" accent="#5b3a72" />
      <div className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-5">
        <Section title="Basics">
          <FieldRow label="Name">
            <Input value={rule.name} onChange={(e) => patch({ name: e.target.value })} />
          </FieldRow>
          <FieldRow label="Description">
            <Input value={rule.description ?? ""} onChange={(e) => patch({ description: e.target.value || undefined })} />
          </FieldRow>
          <FieldRow label="Status">
            <Select value={rule.status} onChange={(e) => patch({ status: e.target.value as typeof rule.status })}>
              <option value="draft">draft</option>
              <option value="review">review</option>
              <option value="published">published</option>
            </Select>
          </FieldRow>
          <FieldRow label="Version">
            <Input
              type="number"
              value={rule.currentVersion}
              onChange={(e) => patch({ currentVersion: Math.max(1, Number(e.target.value) || 1) })}
            />
          </FieldRow>
        </Section>

        <Section title="Endpoint">
          <FieldRow label="Method">
            <Select value={rule.method} onChange={(e) => patch({ method: e.target.value as "GET" | "POST" })}>
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </Select>
          </FieldRow>
          <FieldRow label="Path">
            <Input value={rule.endpoint} onChange={(e) => patch({ endpoint: e.target.value })} className="font-mono" />
          </FieldRow>
        </Section>

        <Section title="Composition">
          <div className="grid grid-cols-3 gap-2 text-center">
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
    <div className="flex flex-col gap-2">
      <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/80 font-medium">{title}</div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11.5px] font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2.5">
      <div className="text-[18px] font-semibold tabular-nums text-foreground leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-1.5">{label}</div>
    </div>
  );
}
