"use client";

import { useState } from "react";
import { Plus, Trash2, FlaskConical, Play, Wand2 } from "lucide-react";
import { useRuleStore } from "@/lib/store/rule-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import type { RuleTest } from "@/lib/types";
import { emptyPayload } from "@/lib/schema/empty-payload";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";

type Props = {
  onRunTest: (test: RuleTest) => void;
};

export function RuleTestsTab({ onRunTest }: Props) {
  const rule = useRuleStore((s) => s.rule);
  const upsertTest = useRuleStore((s) => s.upsertTest);
  const removeTest = useRuleStore((s) => s.removeTest);
  const [activeId, setActiveId] = useState<string | null>(rule?.tests[0]?.id ?? null);

  if (!rule) return null;

  const active = rule.tests.find((t) => t.id === activeId) ?? null;

  function addTest() {
    if (!rule) return;
    const baseName = `Scenario ${rule.tests.length + 1}`;
    const newTest: RuleTest = {
      id: slugify(`${rule.id}-${baseName}`) || `test-${Date.now()}`,
      name: baseName,
      payload: emptyPayload(rule.inputSchema),
      tags: [],
      updatedAt: new Date().toISOString(),
    };
    upsertTest(newTest);
    setActiveId(newTest.id);
  }

  function patchActive(patch: Partial<RuleTest>) {
    if (!active) return;
    upsertTest({ ...active, ...patch });
  }

  function deleteActive() {
    if (!active) return;
    if (!confirm(`Delete test "${active.name}"?`)) return;
    removeTest(active.id);
    const remaining = rule.tests.filter((t) => t.id !== active.id);
    setActiveId(remaining[0]?.id ?? null);
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-muted/30">
      {/* Tests list */}
      <aside className="w-72 shrink-0 border-r bg-background flex flex-col">
        <div className="h-12 px-3 border-b flex items-center gap-2 shrink-0">
          <FlaskConical className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[12.5px] font-medium tracking-tight text-foreground">Tests</span>
          <span className="text-[10.5px] text-muted-foreground tabular-nums">{rule.tests.length}</span>
          <Button variant="ghost" size="icon-sm" onClick={addTest} className="ml-auto" title="Add test scenario">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-1.5">
          {rule.tests.length === 0 ? (
            <div className="px-3 py-3 text-[11.5px] text-muted-foreground italic">
              No tests yet. Add a scenario to capture canonical inputs for this rule.
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {rule.tests.map((t) => {
                const isActive = t.id === activeId;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveId(t.id)}
                    className={cn(
                      "text-left flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md transition-colors",
                      isActive ? "bg-muted/80" : "hover:bg-muted/50",
                    )}
                  >
                    <span className="text-[12.5px] font-medium leading-tight text-foreground truncate">{t.name}</span>
                    <span className="text-[10px] font-mono text-muted-foreground/70 truncate">{t.id}</span>
                    {t.tags?.length ? (
                      <div className="flex gap-1 flex-wrap mt-0.5">
                        {t.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[9.5px] px-1 h-3.5 rounded bg-muted text-muted-foreground inline-flex items-center">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Test detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!active ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <EmptyState
              icon={<FlaskConical className="w-8 h-8" />}
              title="No test selected"
              description="Select a test from the list, or add one to seed canonical inputs for this rule."
              action={
                <Button variant="default" size="sm" onClick={addTest}>
                  <Plus className="w-3.5 h-3.5" /> Add test
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b shrink-0 flex items-center gap-3 bg-background">
              <Input
                value={active.name}
                onChange={(e) => patchActive({ name: e.target.value })}
                placeholder="Test name"
                className="text-[14px] font-semibold border-none shadow-none px-0 focus-visible:ring-0"
              />
              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => patchActive({ payload: emptyPayload(rule.inputSchema) })}
                  title="Reset payload to schema-derived empty shape"
                >
                  <Wand2 className="w-3.5 h-3.5" /> Auto from schema
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={deleteActive}
                  className="text-destructive"
                  title="Delete test"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onRunTest(active)}
                  title="Run this rule against this test payload"
                >
                  <Play className="w-3.5 h-3.5" /> Run
                </Button>
              </div>
            </div>

            <div className="px-5 py-3 border-b shrink-0 bg-background flex flex-col gap-2.5">
              <Input
                value={active.description ?? ""}
                onChange={(e) => patchActive({ description: e.target.value || undefined })}
                placeholder="What does this scenario test? (optional)"
              />
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">Tags</span>
                <Input
                  value={(active.tags ?? []).join(", ")}
                  onChange={(e) => patchActive({ tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="happy-path, edge-case"
                  className="flex-1"
                />
              </div>
            </div>

            <div className="flex-1 grid grid-cols-2 overflow-hidden">
              <div className="flex flex-col border-r bg-background">
                <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider shrink-0 text-muted-foreground/80 border-b">
                  Request payload (JSON)
                </div>
                <textarea
                  className="flex-1 font-mono text-[12px] p-3 resize-none outline-none bg-background text-foreground"
                  value={typeof active.payload === "string" ? active.payload : JSON.stringify(active.payload, null, 2)}
                  onChange={(e) => {
                    const txt = e.target.value;
                    try {
                      patchActive({ payload: JSON.parse(txt) });
                    } catch {
                      patchActive({ payload: txt });
                    }
                  }}
                />
              </div>
              <div className="flex flex-col bg-background">
                <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider shrink-0 text-muted-foreground/80 border-b">
                  Expected (optional)
                </div>
                <textarea
                  className="flex-1 font-mono text-[12px] p-3 resize-none outline-none bg-background text-foreground"
                  placeholder="// optional — assert the rule returns this shape"
                  value={
                    active.expected === undefined ? ""
                    : typeof active.expected === "string" ? active.expected
                    : JSON.stringify(active.expected, null, 2)
                  }
                  onChange={(e) => {
                    const txt = e.target.value;
                    if (!txt.trim()) { patchActive({ expected: undefined }); return; }
                    try {
                      patchActive({ expected: JSON.parse(txt) });
                    } catch {
                      patchActive({ expected: txt });
                    }
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
