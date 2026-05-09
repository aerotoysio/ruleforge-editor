import type { JsonSchema } from "./schema";
import type {
  StringFilterConfig,
  NumberFilterConfig,
  DateFilterConfig,
  MutatorConfig,
  CalcConfig,
  IteratorConfig,
  MergeConfig,
  SubRuleCall,
} from "./configs";

export type HttpMethodKind = "GET" | "POST";

export type RuleStatus = "draft" | "review" | "published";

/**
 * The 20 node categories the engine implements.
 * Mirrors the `data.category` enum in the engine's `rule.schema.json` —
 * keep this list in lock-step with engine releases. (`sql` was retired
 * upstream; keep it out.)
 */
export type NodeCategory =
  | "input"
  | "output"
  | "constant"
  | "product"
  | "mutator"
  | "filter"
  | "logic"
  | "switch"
  | "assert"
  | "bucket"
  | "calc"
  | "reference"
  | "api"
  | "iterator"
  | "merge"
  | "sort"
  | "limit"
  | "distinct"
  | "groupBy"
  | "ruleRef";

export type EdgeBranch = "pass" | "fail" | "default";

export type NodePosition = { x: number; y: number };

export type NodeConfig =
  | StringFilterConfig
  | NumberFilterConfig
  | DateFilterConfig
  | MutatorConfig
  | CalcConfig
  | IteratorConfig
  | MergeConfig
  | { value: unknown }
  | { output: Record<string, unknown> }
  | Record<string, unknown>;

export type NodeData = {
  label: string;
  category: NodeCategory;
  description?: string;
  templateId?: string;
  config?: NodeConfig;
  connectionId?: string;
  subRuleCall?: SubRuleCall;
  readsContext?: string[];
  writesContext?: string[];
};

export type RuleNode = {
  id: string;
  type?: string;
  position: NodePosition;
  data: NodeData;
};

export type RuleEdge = {
  id: string;
  source: string;
  target: string;
  branch?: EdgeBranch;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
};

/**
 * Lightweight summary returned by listRules() — for list pages, dropdowns,
 * and bindings. Doesn't load schemas / instances / bindings.
 */
export type RuleSummary = {
  id: string;
  name: string;
  description?: string;
  endpoint: string;
  method: HttpMethodKind;
  status: RuleStatus;
  currentVersion: number;
  tags?: string[];
  category?: string;
  updatedAt: string;
  updatedBy?: string;
};

/**
 * Per-rule test scenario, loaded from /rules/[id]/tests/*.json.
 * Replaces the old global TestScenario type (which lived in /test-scenarios/).
 */
export type RuleTest = {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  payload: unknown;
  expected?: unknown;
  updatedAt?: string;
};

/**
 * Full in-memory rule, assembled from /rules/[id]/{rule.json, schema/*, bindings/*, tests/*}.
 * - Metadata + DAG come from rule.json
 * - Schemas come from rules/[id]/schema/{input,output,context}.json
 * - Bindings come from rules/[id]/bindings/[instanceId].json — keyed by instanceId
 * - Tests come from rules/[id]/tests/*.json
 *
 * NodeDef metadata (icon, ports, defaults) is NOT stored on the Rule — the editor
 * fetches /nodes/[nodeId].json on demand via the global library.
 */
export type Rule = {
  id: string;
  name: string;
  description?: string;
  endpoint: string;
  method: HttpMethodKind;
  status: RuleStatus;
  currentVersion: number;
  tags?: string[];
  category?: string;
  projectId?: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  contextSchema?: JsonSchema;
  /** DAG node-instances. NodeDef config lives in /nodes/[nodeId].json */
  instances: import("./node-def").RuleNodeInstance[];
  /** DAG edges between node-instances. */
  edges: RuleEdge[];
  /** instanceId → port bindings (one entry per file in bindings/). */
  bindings: Record<string, import("./node-def").NodeBindings>;
  /** Per-rule test scenarios. */
  tests: RuleTest[];
  updatedAt: string;
  updatedBy?: string;
};

/**
 * On-disk shape of /rules/[id]/rule.json — DAG only.
 * Schemas, bindings, and tests live in sibling subfolders.
 */
export type RuleOnDisk = Omit<Rule, "inputSchema" | "outputSchema" | "contextSchema" | "bindings" | "tests">;
