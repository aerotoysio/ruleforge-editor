import type { NodeDef, Rule } from "@/lib/types";

// A loop variable in scope for a node — e.g. `$item` or `$pax.id`, contributed
// by an enclosing For-each (iterator) ancestor. Surfaced in field pickers so
// nodes inside a loop can bind to the current element without typing the path.
export type LoopVar = { path: string; type: string };

type SchemaNode = { type?: string; properties?: Record<string, SchemaNode>; items?: SchemaNode };

/**
 * Walk the rule graph upstream from `instanceId`, collect every iterator
 * ancestor's loop variable (`as` name), and expand each into `$<as>` plus —
 * when the iterated array's element schema is known — `$<as>.<field>` leaves.
 */
export function loopVarsInScope(rule: Rule, instanceId: string, nodeDefs: NodeDef[]): LoopVar[] {
  const sourcesOf = new Map<string, string[]>();
  for (const e of rule.edges) {
    const arr = sourcesOf.get(e.target) ?? [];
    arr.push(e.source);
    sourcesOf.set(e.target, arr);
  }

  const seen = new Set<string>();
  const stack = [...(sourcesOf.get(instanceId) ?? [])];
  const iterators: { as: string; source: string }[] = [];
  while (stack.length) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const inst = rule.instances.find((i) => i.instanceId === id);
    const def = inst && nodeDefs.find((d) => d.id === inst.nodeId);
    if (def?.category === "iterator") {
      const b = rule.bindings[id]?.bindings ?? {};
      const asB = b.as;
      const as = asB?.kind === "literal" && typeof asB.value === "string" && asB.value ? asB.value : "item";
      const srcB = b.source;
      const source = srcB?.kind === "path" ? srcB.path : "";
      iterators.push({ as, source });
    }
    for (const s of sourcesOf.get(id) ?? []) stack.push(s);
  }

  const out: LoopVar[] = [];
  const usedNames = new Set<string>();
  for (const it of iterators) {
    if (usedNames.has(it.as)) continue;
    usedNames.add(it.as);
    const items = arrayItems(rule.inputSchema, it.source);
    out.push({ path: `$${it.as}`, type: items?.type === "object" ? "object" : (items?.type ?? "item") });
    if (items?.type === "object" && items.properties) {
      for (const [k, v] of Object.entries(items.properties)) {
        out.push({ path: `$${it.as}.${k}`, type: v?.type ?? "any" });
      }
    }
  }
  return out;
}

// Resolve a request path (e.g. "$.offer.pax") in the input schema and, if it's
// an array, return its element schema (`items`).
function arrayItems(schema: unknown, path: string): SchemaNode | undefined {
  if (!path) return undefined;
  const parts = path.replace(/^\$\.?/, "").split(".").filter(Boolean);
  let node = schema as SchemaNode | undefined;
  for (const p of parts) {
    node = node?.properties?.[p];
    if (!node) return undefined;
  }
  return node?.type === "array" ? node.items : undefined;
}
