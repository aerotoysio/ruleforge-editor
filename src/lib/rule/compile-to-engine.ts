/**
 * Compile an editor-shaped Rule (instances + bindings + templates + assets)
 * down to the engine-shaped JSON that `RuleForge.Core.RuleRunner` accepts —
 * i.e. `nodes[]` with `data.category` + `data.config` populated according to
 * each engine Config record.
 *
 * The editor authors a richer model than the engine consumes:
 *  - bindings live in sibling files keyed by port-name (engine wants
 *    everything inline in `data.config`)
 *  - editor binding kinds like `template-fill`, `markets-select`,
 *    `ref-select`, `count-of`, `date` have no engine equivalent — they
 *    flatten to engine-supported primitives at compile time
 *
 * This module preserves the editor source (`rule.json` + `bindings/*`) AS-IS
 * so re-opening the dialog still shows the picker; the engine-shaped JSON
 * is written separately as `rule.engine.json`.
 *
 * Coverage status (deliberate first cut — incomplete):
 *  ✅ filter (string / number / date)
 *  ✅ mutator (set + lookup)
 *  ✅ iterator / merge
 *  ✅ calc
 *  ✅ constant (literal mode + template-fill)
 *  ✅ product (literal mode + template-fill)
 *  ✅ ruleRef
 *  ✅ logic (and / or / xor / not — via templateId)
 *  ✅ assert / sort / limit / distinct / groupBy / switch / bucket
 *  ✅ api / reference
 *  ⚠️ markets-select / ref-select bindings: resolved to flat array via the
 *      reference table (lossy but engine-correct)
 *  ⚠️ count-of binding: not yet supported (throws CompileError) — needs an
 *      injected calc node upstream
 *  ⚠️ date binding modes other than `absolute`: not yet supported (calendar
 *      predicates need calc compile-down)
 */

import type {
  Asset,
  EdgeBranch,
  JsonSchema,
  NodeBindings,
  NodeCategory,
  NodeDef,
  NodePort,
  OutputTemplate,
  PortBinding,
  ReferenceSet,
  Rule,
  RuleEdge,
  RuleNodeInstance,
} from "@/lib/types";

// ─── Engine-shaped output types ────────────────────────────────────────────

/** Mirror of the engine's source-binding shape in filter / mutator configs. */
export type EngineSource =
  | { kind: "request"; path: string }
  | { kind: "context"; path: string }
  | { kind: "literal"; literal: unknown };

export type EngineEdge = {
  id: string;
  source: string;
  target: string;
  branch?: EdgeBranch;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
};

export type EngineNodeData = {
  label: string;
  category: NodeCategory;
  description?: string | null;
  templateId?: string | null;
  config?: unknown;
  connectionId?: string | null;
  subRuleCall?: unknown;
  readsContext?: string[] | null;
  writesContext?: string[] | null;
};

export type EngineNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: EngineNodeData;
};

export type EngineRule = {
  id: string;
  name: string;
  description?: string;
  endpoint: string;
  method: string;
  status: string;
  currentVersion: number;
  category?: string;
  tags?: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  contextSchema?: JsonSchema;
  nodes: EngineNode[];
  edges: EngineEdge[];
  updatedAt: string;
  updatedBy?: string;
  projectId?: string;
};

export class CompileError extends Error {
  constructor(public instanceId: string, public portName: string | null, message: string) {
    super(`[${instanceId}${portName ? `.${portName}` : ""}] ${message}`);
    this.name = "CompileError";
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export type CompileContext = {
  refs: ReferenceSet[];
  templates: OutputTemplate[];
  assets: Asset[];
};

export function compileRuleForEngine(
  rule: Rule,
  nodeDefs: NodeDef[],
  ctx: Partial<CompileContext> = {},
): EngineRule {
  const fullCtx: CompileContext = {
    refs: ctx.refs ?? [],
    templates: ctx.templates ?? [],
    assets: ctx.assets ?? [],
  };

  const nodes: EngineNode[] = rule.instances.map((inst) =>
    compileInstance(inst, rule.bindings[inst.instanceId], nodeDefs, fullCtx),
  );

  const edges: EngineEdge[] = rule.edges.map((e) => compileEdge(e, rule, nodeDefs));

  return {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    endpoint: rule.endpoint,
    method: rule.method,
    status: rule.status,
    currentVersion: rule.currentVersion,
    category: rule.category,
    tags: rule.tags,
    inputSchema: rule.inputSchema,
    outputSchema: rule.outputSchema,
    contextSchema: rule.contextSchema,
    nodes,
    edges,
    updatedAt: rule.updatedAt,
    updatedBy: rule.updatedBy,
    projectId: rule.projectId,
  };
}

// ─── Per-instance compile ──────────────────────────────────────────────────

function compileInstance(
  inst: RuleNodeInstance,
  bindings: NodeBindings | undefined,
  nodeDefs: NodeDef[],
  ctx: CompileContext,
): EngineNode {
  const def = nodeDefs.find((d) => d.id === inst.nodeId);
  if (!def) {
    throw new CompileError(inst.instanceId, null, `unknown node-def "${inst.nodeId}"`);
  }
  const portBindings: Record<string, PortBinding> = bindings?.bindings ?? {};
  const extras: Record<string, unknown> = (bindings?.extras as Record<string, unknown>) ?? {};

  const data: EngineNodeData = {
    label: inst.label ?? def.name,
    category: def.category,
    description: inst.description ?? null,
    // Editor's `nodeId` (which node-def-library entry this instance references)
    // becomes the engine's `templateId`. The engine uses templateId for
    // logic-op dispatch (`and`/`or`/`xor`/`not`) and as a free-form tag for
    // analytics / dedupe; both treat it as opaque otherwise.
    templateId: inst.nodeId,
  };

  switch (def.category) {
    case "input":
    case "output":
      // No config — engine treats these as terminals.
      break;
    case "filter":
      data.config = compileFilterConfig(inst, def, portBindings, ctx);
      break;
    case "mutator":
      data.config = compileMutatorConfig(inst, def, portBindings, extras, ctx);
      break;
    case "iterator":
      data.config = {
        source: requireStringPath(inst, "source", portBindings.source),
        as: requireLiteralString(inst, "as", portBindings.as) ?? "item",
      };
      break;
    case "merge":
      data.config = {
        mode: (requireLiteralString(inst, "mode", portBindings.mode) ?? "collect"),
        field: stringOrUndefined(portBindings.field),
      };
      break;
    case "calc":
      data.config = {
        expression: requireLiteralString(inst, "expression", portBindings.expression) ?? "",
        target: stringOrUndefined(portBindings.target),
      };
      break;
    case "constant":
    case "product": {
      // Engine subtlety: `constant` returns its `value` raw — no placeholder
      // substitution. `product` runs `ResolveCtxPlaceholders` over `output`.
      // If the user authored a `template-fill` or `path` binding (both of
      // which produce `${...}` placeholders), we MUST emit engine category
      // `product` so the substitution actually fires. A pure-literal value
      // (no placeholders) stays as `constant`.
      const valueBinding = portBindings.value ?? portBindings.literal;
      const needsSubstitution =
        valueBinding?.kind === "template-fill" || valueBinding?.kind === "path";
      data.config = compileShapeConfig(inst, def, portBindings, ctx);
      if (needsSubstitution) {
        data.category = "product";
      }
      break;
    }
    case "logic":
      // No config record — engine parses the op (and/or/xor/not) from
      // `templateId` and `label`. Both already populated above.
      break;
    case "switch":
      data.config = compileSwitchConfig(inst, portBindings);
      break;
    case "assert":
      data.config = {
        condition: requireLiteralString(inst, "condition", portBindings.condition) ?? "",
        errorCode: stringOrUndefined(portBindings.errorCode),
        errorMessage: stringOrUndefined(portBindings.errorMessage),
      };
      break;
    case "bucket":
      data.config = {
        hashKey: requireStringPath(inst, "hashKey", portBindings.hashKey),
        buckets: literalAsArray(portBindings.buckets, []),
      };
      break;
    case "sort":
      data.config = {
        sortKey: stringOrUndefined(portBindings.sortKey),
        direction: (requireLiteralString(inst, "direction", portBindings.direction) ?? "asc"),
        nulls: (requireLiteralString(inst, "nulls", portBindings.nulls) ?? "last"),
      };
      break;
    case "limit":
      data.config = {
        count: requireLiteralNumber(inst, "count", portBindings.count) ?? 0,
        offset: numberOrUndefined(portBindings.offset),
      };
      break;
    case "distinct":
      data.config = {
        key: stringOrUndefined(portBindings.key),
        keep: (requireLiteralString(inst, "keep", portBindings.keep) ?? "first"),
      };
      break;
    case "groupBy":
      data.config = {
        groupKey: requireLiteralString(inst, "groupKey", portBindings.groupKey) ?? "",
      };
      break;
    case "reference":
      data.config = {
        referenceId: referenceIdFromBinding(inst, "referenceId", portBindings.referenceId),
        matchOn: literalAsObject(portBindings.matchOn, undefined),
      };
      break;
    case "api":
      data.config = compileApiConfig(inst, portBindings);
      break;
    case "ruleRef":
      data.subRuleCall = compileSubRuleCall(inst, portBindings);
      break;
    default:
      throw new CompileError(inst.instanceId, null, `unhandled category "${def.category}"`);
  }

  return {
    id: inst.instanceId,
    type: def.category,
    position: inst.position,
    data,
  };
}

function compileEdge(e: RuleEdge, rule: Rule, nodeDefs: NodeDef[]): EngineEdge {
  // Re-derive sourceHandle for branched outputs (filter pass / fail) so the
  // engine's edge-router routes correctly. Mirrors Canvas.tsx logic.
  const sourceInst = rule.instances.find((i) => i.instanceId === e.source);
  const sourceDef = sourceInst ? nodeDefs.find((d) => d.id === sourceInst.nodeId) : undefined;
  const branched = (sourceDef?.ports.outputs ?? []).filter(
    (o) => o.branch && o.branch !== "default",
  );
  const sourceHandle =
    branched.length >= 2 && (e.branch === "pass" || e.branch === "fail") ? e.branch : null;

  return {
    id: e.id,
    source: e.source,
    target: e.target,
    branch: e.branch ?? "default",
    sourceHandle,
    targetHandle: null,
    label: undefined,
  };
}

// ─── Per-category config compilers ─────────────────────────────────────────

function compileFilterConfig(
  inst: RuleNodeInstance,
  def: NodeDef,
  bindings: Record<string, PortBinding>,
  ctx: CompileContext,
): unknown {
  // Engine's filter dispatch picks string / number / date based on config
  // shape. We use the source port type to decide which one.
  const sourcePort = (def.ports.inputs ?? []).find((p) => p.name === "source");
  const portType = sourcePort?.type ?? "string";
  const isNumber = portType === "number" || portType === "integer";
  const isDate = portType === "date";

  const source = compileSourceBinding(inst, "source", bindings.source);
  const operator = (requireLiteralString(inst, "operator", bindings.operator) ?? defaultOperator(def, portType));
  const arraySelector = (requireLiteralString(inst, "arraySelector", bindings.arraySelector) ?? "any");
  const onMissing = (requireLiteralString(inst, "onMissing", bindings.onMissing) ?? "fail");

  if (isDate) {
    return {
      source,
      compare: {
        operator,
        granularity: stringOrDefault(bindings.granularity, "datetime"),
        value: stringOrUndefined(bindings.match),
        timezone: stringOrUndefined(bindings.timezone),
        fromInclusive: booleanOrUndefined(bindings.fromInclusive),
        toInclusive: booleanOrUndefined(bindings.toInclusive),
      },
      arraySelector,
      onMissing,
    };
  }

  if (isNumber) {
    // Single-value vs range — pick by which port is bound.
    const hasMin = bindings.min != null;
    const hasMax = bindings.max != null;
    const compare: Record<string, unknown> = { operator };
    if (hasMin || hasMax) {
      compare.min = numberOrUndefined(bindings.min);
      compare.max = numberOrUndefined(bindings.max);
      compare.minInclusive = booleanOrUndefined(bindings.minInclusive);
      compare.maxInclusive = booleanOrUndefined(bindings.maxInclusive);
    } else {
      compare.value = numberOrUndefined(bindings.value);
      const values = literalAsArray(bindings.values, undefined);
      if (values) compare.values = values;
    }
    const round = stringOrUndefined(bindings.round);
    if (round) compare.round = round;
    return {
      source,
      compare,
      arraySelector,
      onMissing,
    };
  }

  // String filter — collapse our `literal` port (the values list / single
  // value / regex pattern) into the engine's `value` / `values` slots.
  const compare: Record<string, unknown> = { operator };
  const literalBinding = bindings.literal;
  const compiledList = compileListValues(inst, "literal", literalBinding, ctx);
  if (operator === "in" || operator === "not_in") {
    compare.values = compiledList;
  } else if (compiledList && compiledList.length > 0) {
    // Single-value operators (equals, starts_with, regex, …) take the first item.
    compare.value = compiledList[0];
  }
  if (bindings.caseInsensitive != null) {
    compare.caseInsensitive = booleanOrUndefined(bindings.caseInsensitive);
  }
  if (bindings.trim != null) compare.trim = booleanOrUndefined(bindings.trim);

  return {
    source,
    compare,
    arraySelector,
    onMissing,
  };
}

function defaultOperator(def: NodeDef, portType: NodePort["type"]): string {
  // If the node-def declared a default in `defaults.operator`, honour it.
  // Otherwise pick a sensible per-type default.
  const declared = (def.defaults?.operator as string | undefined) ?? undefined;
  if (declared) return declared;
  if (portType === "number" || portType === "integer") return "equals";
  if (portType === "date") return "equals";
  return "in";
}

function compileMutatorConfig(
  inst: RuleNodeInstance,
  def: NodeDef,
  bindings: Record<string, PortBinding>,
  extras: Record<string, unknown>,
  ctx: CompileContext,
): unknown {
  const target = requireLiteralString(inst, "target", bindings.target) ?? "";
  // Two flavours: lookup-and-replace (mutator-lookup) vs set-property
  // (mutator-set). Distinguished by presence of `referenceId`.
  if (bindings.referenceId) {
    return {
      target,
      lookup: {
        referenceId: referenceIdFromBinding(inst, "referenceId", bindings.referenceId),
        valueColumn: requireLiteralString(inst, "valueColumn", bindings.valueColumn) ?? "",
        // matchOn lives in `extras` because it's a Record<col, PortBinding>,
        // not a single binding.
        matchOn: compileMatchOn(extras.matchOn),
      },
      onMissing: stringOrDefault(bindings.onMissing, "leave"),
    };
  }

  // Set-property mode — engine's MutatorConfig accepts EITHER `value`
  // (literal) OR `from` (path/context string) plus the required `target`.
  // The editor exposes them as separate ports (`value` for literal, `from`
  // for path/context); compile picks whichever the user filled in.
  const fromBinding = bindings.from;
  if (fromBinding?.kind === "path") return { target, from: fromBinding.path };
  if (fromBinding?.kind === "context") return { target, from: contextPath(fromBinding.key) };
  if (fromBinding?.kind === "literal" && typeof fromBinding.value === "string") {
    return { target, from: fromBinding.value };
  }

  const valueBinding = bindings.value;
  if (valueBinding?.kind === "path") return { target, from: valueBinding.path };
  if (valueBinding?.kind === "context") return { target, from: contextPath(valueBinding.key) };
  if (valueBinding?.kind === "literal") return { target, value: valueBinding.value };

  return { target };
}

function compileMatchOn(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v) continue;
    if (typeof v === "string") {
      out[k] = v;
      continue;
    }
    if (typeof v === "object" && v !== null && "kind" in (v as object)) {
      const b = v as PortBinding;
      if (b.kind === "path") out[k] = b.path;
      else if (b.kind === "context") out[k] = contextPath(b.key);
      else if (b.kind === "literal" && typeof b.value === "string") out[k] = b.value;
    }
  }
  return out;
}

function compileShapeConfig(
  inst: RuleNodeInstance,
  def: NodeDef,
  bindings: Record<string, PortBinding>,
  ctx: CompileContext,
): unknown {
  // Shape-emitting nodes (constant, product). The compileInstance caller
  // overrides `data.category` to "product" when the binding is template-fill
  // or path, since the engine `constant` evaluator returns its value RAW
  // (no placeholder substitution); only `product` runs ResolveCtxPlaceholders.
  // Match that here: emit `{ output: ... }` for substitution-shaped configs,
  // `{ value: ... }` only for plain literals that won't be substituted.
  const value = bindings.value ?? bindings.literal;
  if (!value) return def.category === "product" ? { output: {} } : { value: null };

  if (value.kind === "literal") {
    // Plain literal — engine doesn't substitute `$.foo` strings inside
    // constant.value, so what's authored is what's emitted. If the user
    // wrote `"$.booking.bookingRef"` expecting substitution, that's an
    // authoring bug — they need template-fill or `${...}` syntax inside
    // a product. (Validation flags this; see isMeaningfulBinding fixups.)
    return def.category === "product" ? { output: value.value } : { value: value.value };
  }
  if (value.kind === "template-fill") {
    const tpl = ctx.templates.find((t) => t.id === value.templateId);
    if (!tpl) {
      throw new CompileError(
        inst.instanceId,
        "value",
        `template-fill references unknown template "${value.templateId}"`,
      );
    }
    const obj: Record<string, unknown> = {};
    for (const field of tpl.fields) {
      const fb = value.fields[field.name];
      if (!fb) {
        if (field.default !== undefined) obj[field.name] = field.default;
        continue;
      }
      obj[field.name] = bindingToPlaceholderValue(fb);
    }
    // ALWAYS emit as `output` — the placeholder syntax we just generated
    // requires the engine's product evaluator to substitute. compileInstance
    // overrides data.category to "product" for this case.
    return { output: obj };
  }
  if (value.kind === "path") {
    // Whole-shape path binding — engine resolves at eval time. Same product
    // override as template-fill above.
    return { output: `\${${value.path}}` };
  }
  // Other binding kinds aren't supported on shape ports today.
  throw new CompileError(
    inst.instanceId,
    "value",
    `binding kind "${value.kind}" is not supported on a shape port (use literal or template-fill)`,
  );
}

function bindingToPlaceholderValue(b: PortBinding): unknown {
  switch (b.kind) {
    case "literal":  return b.value;
    case "path":     return `\${${b.path}}`;
    case "context":  return `\${${contextPath(b.key)}}`;
    default:         return null;
  }
}

function compileSwitchConfig(inst: RuleNodeInstance, bindings: Record<string, PortBinding>): unknown {
  return {
    input: requireStringPath(inst, "input", bindings.input),
    cases: literalAsArray(bindings.cases, []),
    default: stringOrUndefined(bindings.default),
  };
}

function compileApiConfig(inst: RuleNodeInstance, bindings: Record<string, PortBinding>): unknown {
  return {
    url: requireStringPath(inst, "url", bindings.url, /* allowLiteralString */ true),
    method: requireLiteralString(inst, "method", bindings.method) ?? "GET",
    timeoutMs: requireLiteralNumber(inst, "timeoutMs", bindings.timeoutMs) ?? 5000,
    headers: literalAsObject(bindings.headers, undefined),
    body: bindings.body?.kind === "literal" ? bindings.body.value : undefined,
    responseMap: literalAsObject(bindings.responseMap, undefined),
  };
}

function compileSubRuleCall(inst: RuleNodeInstance, bindings: Record<string, PortBinding>): unknown {
  return {
    ruleId: requireLiteralString(inst, "ruleId", bindings.ruleId) ?? "",
    inputMapping: literalAsObject(bindings.inputMapping, {}) as Record<string, string>,
    outputMapping: literalAsObject(bindings.outputMapping, {}) as Record<string, string>,
    onError: stringOrDefault(bindings.onError, "fail"),
    defaultValue: bindings.defaultValue?.kind === "literal" ? bindings.defaultValue.value : null,
    pinnedVersion: requireLiteralString(inst, "pinnedVersion", bindings.pinnedVersion) ?? "latest",
    forEach: stringOrUndefined(bindings.forEach),
    as: stringOrUndefined(bindings.as),
  };
}

// ─── Binding compilers ─────────────────────────────────────────────────────

function compileSourceBinding(
  inst: RuleNodeInstance,
  portName: string,
  b: PortBinding | undefined,
): EngineSource {
  if (!b) throw new CompileError(inst.instanceId, portName, "missing source binding");
  if (b.kind === "path") return { kind: "request", path: b.path };
  if (b.kind === "context") return { kind: "context", path: contextPath(b.key) };
  if (b.kind === "literal") return { kind: "literal", literal: b.value };
  if (b.kind === "count-of") {
    // count-of compiles to a calc expression upstream — for now stamp a
    // request path so the rule loads, but the engine won't compute count
    // until we inject the calc node. TODO: emit a synthetic calc node.
    throw new CompileError(
      inst.instanceId,
      portName,
      "`count-of` source binding not yet supported by compile-to-engine — needs an injected calc node",
    );
  }
  throw new CompileError(
    inst.instanceId,
    portName,
    `binding kind "${b.kind}" is not supported on a source port`,
  );
}

function compileListValues(
  inst: RuleNodeInstance,
  portName: string,
  b: PortBinding | undefined,
  ctx: CompileContext,
): unknown[] | undefined {
  if (!b) return undefined;
  if (b.kind === "literal") {
    if (Array.isArray(b.value)) return b.value;
    if (b.value == null) return [];
    return [b.value];
  }
  if (b.kind === "ref-select") {
    const ref = ctx.refs.find((r) => r.id === b.referenceId);
    if (!ref) {
      throw new CompileError(inst.instanceId, portName, `ref-select references unknown table "${b.referenceId}"`);
    }
    const col = b.valueColumn || ref.columns[0];
    const whereCol = b.whereColumn;
    const whereSet = b.whereValues ? new Set(b.whereValues) : null;
    return ref.rows
      .filter((row) => (whereSet ? whereSet.has(String(row[whereCol ?? col])) : true))
      .map((row) => row[col]);
  }
  if (b.kind === "markets-select") {
    const ref = ctx.refs.find((r) => r.id === b.referenceId);
    if (!ref) {
      throw new CompileError(inst.instanceId, portName, `markets-select references unknown table "${b.referenceId}"`);
    }
    const col = b.valueColumn || ref.columns[0];
    const matchesAny = (row: Record<string, unknown>, rules: { column: string; value: string }[]) =>
      rules.some((r) => String(row[r.column]) === r.value);
    const included = ref.rows.filter((row) => matchesAny(row, b.include));
    const excluded = new Set(included.filter((row) => matchesAny(row, b.exclude)).map((r) => r[col]));
    return included.filter((row) => !excluded.has(row[col])).map((row) => row[col]);
  }
  throw new CompileError(
    inst.instanceId,
    portName,
    `binding kind "${b.kind}" is not supported on a list-values port`,
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function contextPath(key: string): string {
  // Engine context paths begin with $ctx (top-level dict) or $<frame> for
  // an open iteration frame. Editor stores just the suffix; we put the
  // prefix on at compile time. If the editor key already includes a frame
  // prefix (e.g. "$pax.id"), keep it as-is.
  if (!key) return "";
  if (key.startsWith("$")) return key;
  return key.includes(".") ? `$ctx.${key}` : `$ctx.${key}`;
}

function requireStringPath(
  inst: RuleNodeInstance,
  portName: string,
  b: PortBinding | undefined,
  allowLiteralString = false,
): string {
  if (!b) throw new CompileError(inst.instanceId, portName, "missing");
  if (b.kind === "path") return b.path;
  if (b.kind === "context") return contextPath(b.key);
  if (allowLiteralString && b.kind === "literal" && typeof b.value === "string") return b.value;
  throw new CompileError(inst.instanceId, portName, `expected a path/context binding, got "${b.kind}"`);
}

function requireLiteralString(
  inst: RuleNodeInstance,
  portName: string,
  b: PortBinding | undefined,
): string | undefined {
  if (!b) return undefined;
  if (b.kind === "literal" && typeof b.value === "string") return b.value;
  throw new CompileError(inst.instanceId, portName, `expected a literal string, got "${b.kind}"`);
}

function requireLiteralNumber(
  inst: RuleNodeInstance,
  portName: string,
  b: PortBinding | undefined,
): number | undefined {
  if (!b) return undefined;
  if (b.kind === "literal" && typeof b.value === "number") return b.value;
  throw new CompileError(inst.instanceId, portName, `expected a literal number, got "${b.kind}"`);
}

function stringOrUndefined(b: PortBinding | undefined): string | undefined {
  if (!b) return undefined;
  if (b.kind === "literal" && typeof b.value === "string") return b.value;
  if (b.kind === "path") return b.path;
  if (b.kind === "context") return contextPath(b.key);
  return undefined;
}

function stringOrDefault(b: PortBinding | undefined, fallback: string): string {
  return stringOrUndefined(b) ?? fallback;
}

function numberOrUndefined(b: PortBinding | undefined): number | undefined {
  if (!b) return undefined;
  if (b.kind === "literal" && typeof b.value === "number") return b.value;
  return undefined;
}

function booleanOrUndefined(b: PortBinding | undefined): boolean | undefined {
  if (!b) return undefined;
  if (b.kind === "literal" && typeof b.value === "boolean") return b.value;
  return undefined;
}

function literalAsArray<T>(b: PortBinding | undefined, fallback: T): unknown[] | T {
  if (!b) return fallback;
  if (b.kind === "literal" && Array.isArray(b.value)) return b.value;
  return fallback;
}

function literalAsObject<T>(b: PortBinding | undefined, fallback: T): Record<string, unknown> | T {
  if (!b) return fallback;
  if (b.kind === "literal" && b.value && typeof b.value === "object" && !Array.isArray(b.value)) {
    return b.value as Record<string, unknown>;
  }
  return fallback;
}

function referenceIdFromBinding(
  inst: RuleNodeInstance,
  portName: string,
  b: PortBinding | undefined,
): string {
  if (!b) throw new CompileError(inst.instanceId, portName, "missing reference binding");
  if (b.kind === "reference") return b.referenceId;
  if (b.kind === "literal" && typeof b.value === "string") return b.value;
  throw new CompileError(inst.instanceId, portName, `expected a reference binding, got "${b.kind}"`);
}
