/**
 * Pre-save validator for the in-memory Rule shape.
 *
 * Surfaces the kinds of issue that render the rule unsaveable or unrunnable:
 *   - required ports on a node-instance with no binding
 *   - node-instances with no path from the Input terminal (orphans)
 *   - edges pointing to instances that no longer exist
 *   - missing global node-defs (instance.nodeId resolves to nothing)
 *   - rules with no Input or no Output
 *
 * Issues are returned in document order so the UI can list them
 * deterministically.
 */

import type { NodeDef, Rule } from "@/lib/types";

export type ValidationIssue = {
  kind:
    | "missing-input"
    | "missing-output"
    | "missing-node-def"
    | "unbound-required-port"
    | "orphan-instance"
    | "dangling-edge";
  /** Severity for UI grouping. */
  severity: "error" | "warning";
  /** Plain-language one-line summary. */
  message: string;
  /** Where the issue lives, for "click to jump" interactions. */
  target:
    | { kind: "instance"; instanceId: string }
    | { kind: "edge"; edgeId: string }
    | { kind: "rule" };
};

export function validateRule(rule: Rule, nodeDefs: NodeDef[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const defById = new Map(nodeDefs.map((n) => [n.id, n] as const));
  const instById = new Map(rule.instances.map((i) => [i.instanceId, i] as const));

  // 1. Rule-level: must have at least one input and one output
  let hasInput = false;
  let hasOutput = false;
  for (const inst of rule.instances) {
    const def = defById.get(inst.nodeId);
    if (def?.category === "input") hasInput = true;
    if (def?.category === "output") hasOutput = true;
  }
  if (!hasInput) issues.push({ kind: "missing-input", severity: "error", message: "This rule has no Input node — drop one from the palette.", target: { kind: "rule" } });
  if (!hasOutput) issues.push({ kind: "missing-output", severity: "error", message: "This rule has no Output node — drop one from the palette.", target: { kind: "rule" } });

  // 2. Per-instance issues
  for (const inst of rule.instances) {
    const def = defById.get(inst.nodeId);
    if (!def) {
      issues.push({
        kind: "missing-node-def",
        severity: "error",
        message: `"${inst.label ?? inst.instanceId}" references node "${inst.nodeId}" which isn't in the library.`,
        target: { kind: "instance", instanceId: inst.instanceId },
      });
      continue;
    }
    const bindings = rule.bindings[inst.instanceId]?.bindings ?? {};
    const allPorts = [...(def.ports.inputs ?? []), ...(def.ports.params ?? [])];
    for (const port of allPorts) {
      if (port.required && !(port.name in bindings)) {
        issues.push({
          kind: "unbound-required-port",
          severity: "error",
          message: `"${inst.label ?? def.name}" needs a value for "${port.name}".`,
          target: { kind: "instance", instanceId: inst.instanceId },
        });
      }
    }
  }

  // 3. Dangling edges — source / target instance no longer exists
  for (const e of rule.edges) {
    const sourceMissing = !instById.has(e.source);
    const targetMissing = !instById.has(e.target);
    if (sourceMissing || targetMissing) {
      issues.push({
        kind: "dangling-edge",
        severity: "error",
        message: `Edge ${e.id} points to a deleted node.`,
        target: { kind: "edge", edgeId: e.id },
      });
    }
  }

  // 4. Orphan instances — no path from any Input terminal
  if (hasInput && rule.instances.length > 1) {
    const inputIds = rule.instances
      .filter((i) => defById.get(i.nodeId)?.category === "input")
      .map((i) => i.instanceId);
    const reachable = bfsReachable(inputIds, rule);
    for (const inst of rule.instances) {
      const def = defById.get(inst.nodeId);
      // Inputs are themselves trivially reachable; skip.
      if (def?.category === "input") continue;
      if (!reachable.has(inst.instanceId)) {
        issues.push({
          kind: "orphan-instance",
          severity: "warning",
          message: `"${inst.label ?? def?.name ?? inst.instanceId}" has no path from an Input — it'll never run.`,
          target: { kind: "instance", instanceId: inst.instanceId },
        });
      }
    }
  }

  return issues;
}

function bfsReachable(seedIds: string[], rule: Rule): Set<string> {
  const reached = new Set<string>(seedIds);
  const queue: string[] = [...seedIds];
  // Build outgoing-edge index once.
  const outBySource = new Map<string, string[]>();
  for (const e of rule.edges) {
    const arr = outBySource.get(e.source) ?? [];
    arr.push(e.target);
    outBySource.set(e.source, arr);
  }
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of outBySource.get(id) ?? []) {
      if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  return reached;
}

/** Convenience grouping for UI rendering. */
export function groupIssues(issues: ValidationIssue[]): { errors: ValidationIssue[]; warnings: ValidationIssue[] } {
  return {
    errors: issues.filter((i) => i.severity === "error"),
    warnings: issues.filter((i) => i.severity === "warning"),
  };
}
