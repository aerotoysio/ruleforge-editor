/**
 * Global node library types.
 *
 * A NodeDef is a reusable building block — it captures a business intention
 * ("filter by string", "translate code to name via reference table", "iterate
 * passengers"). It declares what ports it has and what defaults the engine
 * should use; it does NOT know about any specific rule's input schema.
 *
 * Each rule references NodeDefs by id (one node-instance per use) and provides
 * a NodeBindings object per instance that wires the node's ports to actual
 * JSONPaths or literals in that rule's schema. The same NodeDef can be reused
 * across hundreds of rules with totally different schema shapes.
 */

import type { NodeCategory, EdgeBranch, NodePosition } from "./rule";

export type NodePortType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "any"
  | "string-array"
  | "number-array"
  | "object"
  | "object-array"
  | "reference";

/**
 * Schema-aware hint that the BindingsDesigner uses to surface likely paths
 * for a port. Optional — when present, the path picker scores schema nodes
 * by matching field names + value types, top suggestions float to the top.
 */
export type PathHint = {
  shape?: "scalar" | "array-of-objects" | "array-of-scalars" | "object";
  /** Regex applied to array container names (e.g. "(pax|passenger|traveller)"). */
  namePattern?: string;
  /** Regex applied to leaf field names (e.g. "(tier|status|level)"). */
  fieldHint?: string;
  /** JSON Schema types to prefer (e.g. ["string"], ["number","integer"]). */
  schemaTypes?: string[];
};

/** A fixed-choice option for an enum-port (e.g. merge mode = collect|sum|first|last). */
export type NodeEnumOption = {
  value: string;
  label: string;
  description?: string;
};

export type NodePort = {
  name: string;
  type: NodePortType;
  required?: boolean;
  description?: string;
  /** Optional hint to help the BindingsDesigner suggest paths from the rule's input schema. */
  hint?: PathHint;
  /**
   * When the port accepts only a fixed set of values, listing them here turns
   * the literal editor into a friendly button group instead of free text.
   * Only valid for string-typed params.
   */
  enum?: NodeEnumOption[];
  /**
   * Restrict which binding "kinds" can author this port. The dialog hides
   * tabs that aren't in this list — so the user isn't asked "from request
   * or from a literal?" when only one of those makes sense for this port.
   *
   * Examples:
   *   ["path","context"]  — port references a field; no literal/date/ref
   *   ["date"]            — port wants a calendar predicate; no path/literal
   *   ["literal","ref-select"] — fixed list of values
   *
   * Default (omitted): all kinds compatible with the port's type are shown.
   */
  bindingKinds?: PortBinding["kind"][];
};

export type NodeOutput = {
  name: string;
  branch?: EdgeBranch;
  description?: string;
};

export type NodePorts = {
  /** Path-bound inputs (e.g. "source", "from"). Bindings resolve to JSONPath. */
  inputs?: NodePort[];
  /** Literal-bound parameters (e.g. "literal", "expression", "mode"). */
  params?: NodePort[];
  /** Sequenced outputs / branches. */
  outputs?: NodeOutput[];
};

export type NodeUI = {
  badge?: string;
  icon?: string;
  /** Optional tint for the node accent stripe. Keep neutral by default. */
  accent?: string;
};

export type NodeDef = {
  id: string;
  name: string;
  description?: string;
  category: NodeCategory;
  ports: NodePorts;
  /** Engine-level defaults applied at evaluation time (operator, onMissing, etc). */
  defaults?: Record<string, unknown>;
  ui?: NodeUI;
  /** Tags for filtering/grouping in the palette. */
  tags?: string[];
  updatedAt: string;
};

/** A node-instance inside a rule (one entry on the canvas). */
export type RuleNodeInstance = {
  instanceId: string;
  /** References NodeDef.id. */
  nodeId: string;
  position: NodePosition;
  /** Optional per-instance display override. */
  label?: string;
};

/** Binds a single port to a path / literal / reference / context value. */
export type PortBinding =
  /** Resolve from a JSONPath into the rule's input (or context) tree. */
  | { kind: "path"; path: string }
  /** A user-typed literal (string, number, array, object). */
  | { kind: "literal"; value: unknown }
  /** Whole-table reference pointer (used by lookup-style nodes). */
  | { kind: "reference"; referenceId: string }
  /** Iteration frame ($pax.foo) or $ctx.bar. */
  | { kind: "context"; key: string }
  /**
   * Pick a set of values from a reference table. Used to author things like
   * "destinations where country = US" or "pax types where category = paying"
   * without hand-typing the resulting array. The engine flattens this to a
   * literal array of valueColumn cells at evaluation time.
   */
  | {
      kind: "ref-select";
      referenceId: string;
      /** Column whose values are returned (the resolved literal). */
      valueColumn: string;
      /** Optional column to filter rows by. Omit to take every row. */
      whereColumn?: string;
      /** Acceptable values for whereColumn (OR-joined). */
      whereValues?: string[];
    }
  /**
   * Authoring-time date control. The user picks a calendar mode and the engine
   * receives a structured binding it can compare against any path-resolved
   * date value. Supports absolute dates, relative windows, and the
   * "abstraction layer" the user described — day-of-week, month, etc.
   */
  | {
      kind: "date";
      mode: "absolute" | "relative-window" | "day-of-week" | "day-of-month" | "month-of-year" | "is-weekend";
      /** Used when mode = "absolute". ISO date YYYY-MM-DD. */
      date?: string;
      /** Used when mode = "relative-window". */
      direction?: "next" | "last" | "this";
      unit?: "days" | "weeks" | "months" | "years";
      amount?: number;
      /** Used for day-of-week/month-of-year etc. Multi-select. */
      values?: number[];
    }
  /**
   * Resolves to the number of items at an array path. Lets a number-typed port
   * be wired to "count of pax", "count of bounds", "count of bundles", etc.
   * without authoring a calc-expression. Used by the "if there are 2+ adults"
   * pattern: bind filter source = count-of($.pax[*] where paxType=ADT) > 1.
   */
  | {
      kind: "count-of";
      arrayPath: string;
    }
  /**
   * Hierarchical "markets" picker. Authors rules like "every airport in the
   * USA except Texas, plus GVA" by combining inclusion + exclusion rules
   * across columns of a reference table (typically ref-airports). The engine
   * resolves this to a flat array of valueColumn cells at evaluation time:
   *
   *     1. union  : rows where ANY include-rule matches
   *     2. minus  : rows where ANY exclude-rule matches
   *     3. project: emit row[valueColumn]
   *
   * Use case is airline markets, but the shape is generic — any hierarchical
   * picker over a flat reference table works (e.g. cabin tiers, fare families).
   */
  | {
      kind: "markets-select";
      referenceId: string;
      /** Column whose values are returned (the resolved literal). Usually "code". */
      valueColumn: string;
      /** OR-joined inclusion rules. Empty array = include nothing. */
      include: { column: string; value: string }[];
      /** Subtractive rules — rows matching any of these are removed AFTER include. */
      exclude: { column: string; value: string }[];
    };

/**
 * Per-rule, per-instance bindings. Persisted at /rules/[id]/bindings/[instanceId].json
 *
 * "bindings" is the wiring layer: it tells the engine *where* in this rule's
 * schema to find each port's value. Different rules using the same node-id
 * have totally independent bindings.
 */
export type NodeBindings = {
  instanceId: string;
  ruleId: string;
  bindings: Record<string, PortBinding>;
  /**
   * Free-form extras the engine may consume for complex nodes
   * (e.g. lookup matchOn = Record<refColumn, PortBinding>).
   */
  extras?: Record<string, unknown>;
};
