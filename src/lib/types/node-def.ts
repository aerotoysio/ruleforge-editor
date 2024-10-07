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

export type NodePort = {
  name: string;
  type: NodePortType;
  required?: boolean;
  description?: string;
  /** Optional hint to help the BindingsDesigner suggest paths from the rule's input schema. */
  hint?: PathHint;
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
  | { kind: "path"; path: string }
  | { kind: "literal"; value: unknown }
  | { kind: "reference"; referenceId: string }
  | { kind: "context"; key: string };

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
