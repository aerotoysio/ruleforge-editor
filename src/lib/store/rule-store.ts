"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  Rule,
  RuleEdge,
  EdgeBranch,
  NodePosition,
  RuleNodeInstance,
  NodeBindings,
  PortBinding,
  RuleTest,
} from "@/lib/types";

export type Selection =
  | { kind: "none" }
  | { kind: "node"; id: string } // id is instanceId
  | { kind: "edge"; id: string };

export type TraceHighlight = {
  nodeOutcomes: Record<string, "pass" | "fail" | "skip" | "error">;
  traversedEdges: Set<string>;
};

export type RuleState = {
  rule: Rule | null;
  dirty: boolean;
  selection: Selection;
  trace: TraceHighlight | null;

  load: (rule: Rule) => void;
  setRule: (next: Rule) => void;
  patchRule: (patch: Partial<Rule>) => void;

  setInstances: (instances: RuleNodeInstance[]) => void;
  setEdges: (edges: RuleEdge[]) => void;
  updateInstance: (instanceId: string, fn: (n: RuleNodeInstance) => RuleNodeInstance) => void;
  updateEdge: (id: string, fn: (e: RuleEdge) => RuleEdge) => void;
  addInstance: (nodeDefId: string, position: NodePosition, label?: string) => string;
  addEdge: (source: string, target: string, branch?: EdgeBranch | null) => string;
  removeInstance: (instanceId: string) => void;
  removeEdge: (id: string) => void;

  setBinding: (instanceId: string, portName: string, binding: PortBinding | null) => void;
  setNodeBindings: (instanceId: string, bindings: NodeBindings) => void;
  setBindingExtras: (instanceId: string, extras: Record<string, unknown>) => void;

  setTests: (tests: RuleTest[]) => void;
  upsertTest: (test: RuleTest) => void;
  removeTest: (testId: string) => void;

  select: (sel: Selection) => void;
  setTrace: (t: TraceHighlight | null) => void;
  markClean: () => void;
};

export const useRuleStore = create<RuleState>((set, get) => ({
  rule: null,
  dirty: false,
  selection: { kind: "none" },
  trace: null,

  load: (rule) => set({ rule, dirty: false, selection: { kind: "none" }, trace: null }),
  setRule: (next) => set({ rule: next, dirty: true }),
  patchRule: (patch) => {
    const { rule } = get();
    if (!rule) return;
    set({ rule: { ...rule, ...patch }, dirty: true });
  },

  setInstances: (instances) => {
    const { rule } = get();
    if (!rule) return;
    set({ rule: { ...rule, instances }, dirty: true });
  },
  setEdges: (edges) => {
    const { rule } = get();
    if (!rule) return;
    set({ rule: { ...rule, edges }, dirty: true });
  },
  updateInstance: (instanceId, fn) => {
    const { rule } = get();
    if (!rule) return;
    const instances = rule.instances.map((n) => (n.instanceId === instanceId ? fn(n) : n));
    set({ rule: { ...rule, instances }, dirty: true });
  },
  updateEdge: (id, fn) => {
    const { rule } = get();
    if (!rule) return;
    const edges = rule.edges.map((e) => (e.id === id ? fn(e) : e));
    set({ rule: { ...rule, edges }, dirty: true });
  },
  addInstance: (nodeDefId, position, label) => {
    const { rule } = get();
    if (!rule) return "";
    const instanceId = `n-${nanoid(8)}`;
    const instance: RuleNodeInstance = { instanceId, nodeId: nodeDefId, position, label };
    set({
      rule: { ...rule, instances: [...rule.instances, instance] },
      dirty: true,
      selection: { kind: "node", id: instanceId },
    });
    return instanceId;
  },
  addEdge: (source, target, branch = null) => {
    const { rule } = get();
    if (!rule) return "";
    const existing = rule.edges.find(
      (e) => e.source === source && e.target === target && (e.branch ?? null) === (branch ?? null),
    );
    if (existing) return existing.id;
    const id = `e-${nanoid(8)}`;
    const edge: RuleEdge = { id, source, target, branch: branch ?? "default" };
    set({ rule: { ...rule, edges: [...rule.edges, edge] }, dirty: true });
    return id;
  },
  removeInstance: (instanceId) => {
    const { rule, selection } = get();
    if (!rule) return;
    const instances = rule.instances.filter((n) => n.instanceId !== instanceId);
    const edges = rule.edges.filter((e) => e.source !== instanceId && e.target !== instanceId);
    const bindings = { ...rule.bindings };
    delete bindings[instanceId];
    const nextSel: Selection =
      selection.kind === "node" && selection.id === instanceId ? { kind: "none" } : selection;
    set({ rule: { ...rule, instances, edges, bindings }, dirty: true, selection: nextSel });
  },
  removeEdge: (id) => {
    const { rule, selection } = get();
    if (!rule) return;
    const edges = rule.edges.filter((e) => e.id !== id);
    const nextSel: Selection = selection.kind === "edge" && selection.id === id ? { kind: "none" } : selection;
    set({ rule: { ...rule, edges }, dirty: true, selection: nextSel });
  },

  setBinding: (instanceId, portName, binding) => {
    const { rule } = get();
    if (!rule) return;
    const current = rule.bindings[instanceId] ?? {
      instanceId,
      ruleId: rule.id,
      bindings: {},
    };
    const nextPortBindings = { ...current.bindings };
    if (binding === null) delete nextPortBindings[portName];
    else nextPortBindings[portName] = binding;
    const nextNodeBindings: NodeBindings = { ...current, bindings: nextPortBindings };
    set({
      rule: { ...rule, bindings: { ...rule.bindings, [instanceId]: nextNodeBindings } },
      dirty: true,
    });
  },
  setNodeBindings: (instanceId, bindings) => {
    const { rule } = get();
    if (!rule) return;
    set({
      rule: { ...rule, bindings: { ...rule.bindings, [instanceId]: bindings } },
      dirty: true,
    });
  },
  setBindingExtras: (instanceId, extras) => {
    const { rule } = get();
    if (!rule) return;
    const current = rule.bindings[instanceId] ?? { instanceId, ruleId: rule.id, bindings: {} };
    const next: NodeBindings = { ...current, extras };
    set({ rule: { ...rule, bindings: { ...rule.bindings, [instanceId]: next } }, dirty: true });
  },

  setTests: (tests) => {
    const { rule } = get();
    if (!rule) return;
    set({ rule: { ...rule, tests }, dirty: true });
  },
  upsertTest: (test) => {
    const { rule } = get();
    if (!rule) return;
    const idx = rule.tests.findIndex((t) => t.id === test.id);
    const tests = idx === -1 ? [...rule.tests, test] : rule.tests.map((t, i) => (i === idx ? test : t));
    set({ rule: { ...rule, tests }, dirty: true });
  },
  removeTest: (testId) => {
    const { rule } = get();
    if (!rule) return;
    set({ rule: { ...rule, tests: rule.tests.filter((t) => t.id !== testId) }, dirty: true });
  },

  select: (sel) => set({ selection: sel }),
  setTrace: (t) => set({ trace: t }),
  markClean: () => set({ dirty: false }),
}));
