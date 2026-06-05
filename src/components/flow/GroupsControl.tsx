"use client";

import { useState } from "react";
import { Boxes, X, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useRuleStore } from "@/lib/store/rule-store";

// Floating canvas control to manage visual node-groups (labelled boxes drawn
// behind a set of nodes). Purely cosmetic — no engine effect.
const GROUP_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7"];

export function GroupsControl() {
  const rule = useRuleStore((s) => s.rule);
  const addGroup = useRuleStore((s) => s.addGroup);
  const updateGroup = useRuleStore((s) => s.updateGroup);
  const removeGroup = useRuleStore((s) => s.removeGroup);

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!rule) return null;
  const groups = rule.groups ?? [];
  const instances = rule.instances;

  function newGroup() {
    const sel = useRuleStore.getState().selection;
    const seed = sel.kind === "node" ? [sel.id] : [];
    const color = GROUP_COLORS[groups.length % GROUP_COLORS.length];
    const id = addGroup(`Group ${groups.length + 1}`, seed, color);
    setExpanded(id);
    setOpen(true);
  }

  function toggleMember(groupId: string, instanceId: string) {
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    const has = g.nodeIds.includes(instanceId);
    updateGroup(groupId, {
      nodeIds: has ? g.nodeIds.filter((n) => n !== instanceId) : [...g.nodeIds, instanceId],
    });
  }

  return (
    <div className="absolute" style={{ top: 12, left: 12, zIndex: 20 }}>
      <button
        type="button"
        className="btn ghost sm"
        onClick={() => setOpen((o) => !o)}
        title="Group nodes into labelled boxes for clarity"
        style={{ background: "var(--panel)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)" }}
      >
        <Boxes className="w-3.5 h-3.5" /> Groups{groups.length ? ` (${groups.length})` : ""}
      </button>

      {open ? (
        <div
          style={{
            marginTop: 6,
            width: 300,
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "var(--shadow-md)",
            overflow: "hidden",
          }}
        >
          <div
            className="flex items-center"
            style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", background: "var(--panel-2)" }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Node groups
            </span>
            <button onClick={() => setOpen(false)} className="icon-btn ml-auto" style={{ width: 24, height: 24 }} aria-label="Close">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div style={{ maxHeight: 360, overflow: "auto" }}>
            {groups.length === 0 ? (
              <div style={{ padding: "14px 12px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                No groups yet. Create one to draw a labelled box behind a set of nodes — handy for showing what each part of the rule does.
              </div>
            ) : (
              groups.map((g) => {
                const isOpen = expanded === g.id;
                return (
                  <div key={g.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <div className="flex items-center gap-1.5" style={{ padding: "7px 8px" }}>
                      <div className="flex items-center gap-0.5">
                        {GROUP_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => updateGroup(g.id, { color: c })}
                            title="Colour"
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 3,
                              background: c,
                              border: (g.color ?? GROUP_COLORS[0]) === c ? "2px solid var(--text)" : "1px solid var(--border)",
                              cursor: "pointer",
                            }}
                          />
                        ))}
                      </div>
                      <input
                        value={g.label}
                        onChange={(e) => updateGroup(g.id, { label: e.target.value })}
                        className="input"
                        style={{ height: 26, fontSize: 12, flex: 1, minWidth: 0 }}
                      />
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : g.id)}
                        className="icon-btn"
                        style={{ width: 24, height: 24 }}
                        title="Choose members"
                      >
                        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => { removeGroup(g.id); if (isOpen) setExpanded(null); }}
                        className="icon-btn"
                        style={{ width: 24, height: 24 }}
                        title="Delete group"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {isOpen ? (
                      <div style={{ padding: "2px 10px 9px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
                        <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 2 }}>
                          {g.nodeIds.length} node{g.nodeIds.length === 1 ? "" : "s"} — tick the ones to enclose:
                        </div>
                        {instances.map((inst) => {
                          const checked = g.nodeIds.includes(inst.instanceId);
                          return (
                            <label
                              key={inst.instanceId}
                              className="flex items-center gap-2"
                              style={{ fontSize: 12, color: "var(--text)", cursor: "pointer", padding: "1px 0" }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleMember(g.id, inst.instanceId)}
                              />
                              <span className="truncate">{inst.label ?? inst.nodeId}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div style={{ padding: 8, borderTop: "1px solid var(--border)" }}>
            <button type="button" className="btn ghost sm" onClick={newGroup} style={{ width: "100%", justifyContent: "center" }}>
              <Plus className="w-3.5 h-3.5" /> New group
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
