"use client";

import { BookOpen, Quote, ArrowRight } from "lucide-react";
import { useRuleStore } from "@/lib/store/rule-store";

// Review-first "Summary" view of an AI-authored rule: the end-to-end narrative
// plus clause citations that trace each node back to the source policy. Clicking
// a citation jumps to (and selects) the node it implements.
export function RuleSummaryTab({ onJumpToNode }: { onJumpToNode: (instanceId: string) => void }) {
  const rule = useRuleStore((s) => s.rule);
  if (!rule) return null;

  const meta = rule.aiMeta;
  const labelFor = (iid: string) => rule.instances.find((i) => i.instanceId === iid)?.label ?? iid;
  const hasContent = Boolean(meta?.narrative || (meta?.citations && meta.citations.length));

  if (!hasContent) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ padding: 40, background: "var(--bg)" }}>
        <div style={{ maxWidth: 400, textAlign: "center", color: "var(--text-muted)" }}>
          <BookOpen className="w-7 h-7" style={{ color: "var(--text-faint)", margin: "0 auto 10px" }} />
          <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>No summary yet</div>
          <p style={{ fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>
            AI-authored rules get an end-to-end narrative and clause citations here. Create a rule from a policy
            (<span style={{ color: "var(--text)" }}>New rule → describe or upload</span>) to generate one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto" style={{ background: "var(--bg)" }}>
      <div className="max-w-3xl mx-auto px-8 py-7 flex flex-col gap-6">
        {meta?.sourcePolicyName ? (
          <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>Source: {meta.sourcePolicyName}</div>
        ) : null}

        {meta?.narrative ? (
          <section>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>What this rule does</h2>
            <div style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--text)", whiteSpace: "pre-wrap" }}>{meta.narrative}</div>
          </section>
        ) : null}

        {meta?.citations?.length ? (
          <section>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
              Policy citations <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-muted)" }}>· click to open the node</span>
            </h2>
            <div className="flex flex-col gap-2">
              {meta.citations.map((c, i) => (
                <button
                  key={i}
                  onClick={() => onJumpToNode(c.instanceId)}
                  className="text-left transition-colors"
                  style={{ display: "flex", gap: 10, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel)", cursor: "pointer" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                >
                  <Quote className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--accent)", marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 500 }}>
                      {labelFor(c.instanceId)} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>— {c.clause}</span>
                    </div>
                    {c.quote ? (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", marginTop: 2, lineHeight: 1.45 }}>“{c.quote}”</div>
                    ) : null}
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-faint)", marginTop: 2 }} />
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
