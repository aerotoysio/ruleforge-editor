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

import type { NodeDef, PortBinding, Rule } from "@/lib/types";

/**
 * A binding "exists" but might still be incomplete — e.g. a template-fill
 * binding with no template picked, or a path binding with empty path. Treat
 * those the same as missing for required-port validation, otherwise the
 * Valid badge lies and rules fail at runtime.
 */
function isMeaningfulBinding(b: PortBinding | undefined): boolean {
  if (!b) return false;
  switch (b.kind) {
    case "path":           return b.path.trim().length > 0;
    case "literal":        return b.value !== undefined && b.value !== null && b.value !== "";
    case "context":        return b.key.trim().length > 0;
    case "reference":      return b.referenceId.trim().length > 0;
    case "ref-select":     return b.referenceId.trim().length > 0;
    case "markets-select": return b.referenceId.trim().length > 0 && (b.include.length > 0);
    case "date":           return true; // any mode is meaningful
    case "count-of":       return b.arrayPath.trim().length > 0;
    case "template-fill":  return b.templateId.trim().length > 0;
    case "asset":          return b.assetId.trim().length > 0;
    case "template-ref":   return b.templateId.trim().length > 0;
  }
}

/**
 * A multi-condition filter keeps its conditions in `extras.conditions`. A
 * condition whose operator needs a value but has none (e.g. `starts_with` with
 * no text) silently matches EVERYTHING — a nasty footgun. This returns false
 * for such conditions so validation can flag them.
 */
const NO_VALUE_OPS = new Set(["is_null", "is_empty", "is_weekend"]);
function conditionHasValue(c: Record<string, unknown>): boolean {
  const op = typeof c.operator === "string" ? c.operator : "";
  if (NO_VALUE_OPS.has(op)) return true;
  if (op === "between" || op === "not_between") {
    return c.min != null || c.max != null
      || (typeof c.from === "string" && c.from !== "") || (typeof c.to === "string" && c.to !== "");
  }
  if (op === "within_last" || op === "within_next") return typeof c.amount === "number";
  if (op === "in" || op === "not_in") {
    if (c.mode === "ref") return typeof c.refId === "string" && c.refId.length > 0;
    return Array.isArray(c.values) && c.values.length > 0;
  }
  if (op === "day_of_week" || op === "month_of_year" || op === "day_of_month") {
    return Array.isArray(c.values) && c.values.length > 0;
  }
  // single-value operators (equals, starts_with, gt, before, …)
  if (typeof c.value === "number") return true;
  if (typeof c.value === "string") return c.value.trim().length > 0;
  return c.value != null;
}

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
      const b = bindings[port.name];
      if (port.required && !isMeaningfulBinding(b)) {
        issues.push({
          kind: "unbound-required-port",
          severity: "error",
          message: `"${inst.label ?? def.name}" needs a value for "${port.name}".`,
          target: { kind: "instance", instanceId: inst.instanceId },
        });
      }
    }

    // Multi-condition filters keep their conditions in `extras.conditions`.
    // Flag any condition missing its value — otherwise an empty operator
    // (e.g. starts_with "") passes every row and the filter does nothing.
    if (def.category === "filter") {
      const extras = (rule.bindings[inst.instanceId]?.extras as Record<string, unknown>) ?? {};
      const conds = Array.isArray(extras.conditions) ? (extras.conditions as Record<string, unknown>[]) : [];
      conds.forEach((c, idx) => {
        if (!conditionHasValue(c)) {
          issues.push({
            kind: "unbound-required-port",
            severity: "error",
            message: `"${inst.label ?? def.name}" — condition ${idx + 1} (${typeof c.operator === "string" ? c.operator : "?"}) has no value, so it would match everything.`,
            target: { kind: "instance", instanceId: inst.instanceId },
          });
        }
      });
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
