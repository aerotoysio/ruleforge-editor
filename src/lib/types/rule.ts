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
/**
 * A labelled box drawn behind a set of node-instances — purely visual grouping
 * to convey what a sub-section of the rule does. Has no engine effect.
 */
export type RuleGroup = {
  id: string;
  label: string;
  /** instanceIds of the member nodes the box should enclose. */
  nodeIds: string[];
  /** Optional accent colour (hex, e.g. "#6366f1"). */
  color?: string;
};

/**
 * AI-authoring metadata — set when a rule is generated from a policy by Claude.
 * Drives the review-first UI (per-node explanations, an end-to-end narrative,
 * and clause citations back to the source policy). No engine effect.
 */
export type RuleAiMeta = {
  sourcePolicyName?: string;
  /** End-to-end technical narrative of what the rule does. */
  narrative?: string;
  /** instanceId → plain-English explanation of that node. */
  nodeExplanations?: Record<string, string>;
  /** Each node traced back to the policy clause it implements. */
  citations?: { instanceId: string; clause: string; quote?: string }[];
  generatedBy?: string;
  generatedAt?: string;
};

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
  /**
   * The input-shape this rule consumes. By default the rule embeds its own
   * literal schema. When `inputSchemaRef` is set, the editor resolves the
   * referenced template at load time and uses its `schema` here; the on-disk
   * rule.json stores ONLY the ref (no embedded inputSchema). At engine
   * staging we inline the resolved schema before invoking the engine, so the
   * .NET runtime always sees a plain rule with a literal schema — refs are
   * an editor-side convenience, not an engine concept.
   */
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  contextSchema?: JsonSchema;
  /**
   * Optional id of a `SchemaTemplate` whose `.schema` supplies this rule's
   * input shape. When set the editor uses the resolved schema as if it were
   * inline. Edits to the template propagate to every referencing rule on
   * next reload — no mass re-save needed.
   *
   * Pairs with outputSchemaRef / contextSchemaRef (future).
   */
  inputSchemaRef?: string;
  /** Same as inputSchemaRef but for the output envelope (future). */
  outputSchemaRef?: string;
  /** Same as inputSchemaRef but for the per-evaluation context (future). */
  contextSchemaRef?: string;
  /** DAG node-instances. NodeDef config lives in /nodes/[nodeId].json */
  instances: import("./node-def").RuleNodeInstance[];
  /** DAG edges between node-instances. */
  edges: RuleEdge[];
  /** instanceId → port bindings (one entry per file in bindings/). */
  bindings: Record<string, import("./node-def").NodeBindings>;
  /** Per-rule test scenarios. */
  tests: RuleTest[];
  /** Optional visual groupings (labelled boxes behind nodes). No engine effect. */
  groups?: RuleGroup[];
  /** AI-authoring metadata (narrative, per-node explanations, citations). */
  aiMeta?: RuleAiMeta;
  updatedAt: string;
  updatedBy?: string;
};

/**
 * On-disk shape of /rules/[id]/rule.json — DAG + optional schema template
 * refs only. Schemas (input/output/context), bindings, and tests live in
 * sibling subfolders. Refs win over snapshots on read; snapshots remain on
 * disk as a fallback if the referenced template is later deleted.
 */
export type RuleOnDisk = Omit<Rule, "inputSchema" | "outputSchema" | "contextSchema" | "bindings" | "tests">;
