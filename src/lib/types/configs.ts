export type SourceKind = "request" | "context" | "literal";

export type ArraySelector = "any" | "all" | "none" | "first" | "only";

export type OnMissing = "fail" | "pass" | "skip";

export type StringFilterOperator =
  | "equals"
  | "not_equals"
  | "starts_with"
  | "ends_with"
  | "contains"
  | "not_contains"
  | "in"
  | "not_in"
  | "regex"
  | "is_null"
  | "is_empty";

export type StringFilterSource = {
  kind: SourceKind;
  path?: string;
  literal?: string;
};

export type StringFilterCompare = {
  operator: StringFilterOperator;
  value?: string;
  values?: string[];
  caseInsensitive?: boolean;
  trim?: boolean;
};

export type StringFilterConfig = {
  source: StringFilterSource;
  compare: StringFilterCompare;
  arraySelector: ArraySelector;
  onMissing: OnMissing;
  referenceId?: string;
  referenceColumn?: string;
};

export type NumberFilterOperator =
  | "equals"
  | "not_equals"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "not_between"
  | "in"
  | "not_in"
  | "is_null";

export type Rounding = "floor" | "ceil" | "round";

export type NumberFilterSource = {
  kind: SourceKind;
  path?: string;
  literal?: number;
};

export type NumberFilterCompare = {
  operator: NumberFilterOperator;
  value?: number;
  values?: number[];
  min?: number;
  max?: number;
  minInclusive?: boolean;
  maxInclusive?: boolean;
  round?: Rounding;
};

export type NumberFilterConfig = {
  source: NumberFilterSource;
  compare: NumberFilterCompare;
  arraySelector: ArraySelector;
  onMissing: OnMissing;
};

export type DateFilterOperator =
  | "equals"
  | "not_equals"
  | "before"
  | "after"
  | "between"
  | "not_between"
  | "within_last"
  | "within_next"
  | "is_null";

export type DateGranularity = "datetime" | "date" | "time";

export type DateUnit = "minutes" | "hours" | "days" | "weeks" | "months";

export type DateFilterSource = {
  kind: SourceKind;
  path?: string;
  literal?: string;
};

export type DateFilterCompare = {
  operator: DateFilterOperator;
  granularity?: DateGranularity;
  value?: string;
  from?: string;
  to?: string;
  amount?: number;
  unit?: DateUnit;
  timezone?: string;
  fromInclusive?: boolean;
  toInclusive?: boolean;
};

export type DateFilterConfig = {
  source: DateFilterSource;
  compare: DateFilterCompare;
  arraySelector: ArraySelector;
  onMissing: OnMissing;
};

export type OnLookupMissing = "leave" | "clear" | "error";

export type LookupSpec = {
  referenceId: string;
  valueColumn: string;
  matchOn: Record<string, string>;
};

export type MutatorConfig = {
  target: string;
  value?: unknown;
  from?: string;
  lookup?: LookupSpec;
  onMissing?: OnLookupMissing;
};

export type CalcConfig = {
  expression: string;
  target?: string;
};

export type IteratorConfig = {
  source: string;
  as: string;
};

export type MergeMode =
  | "collect"
  | "count"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "first"
  | "last";

export type MergeConfig = {
  mode: MergeMode;
  field?: string;
};

export type SubRuleErrorMode = "skip" | "fail" | "default";

export type SubRuleCall = {
  ruleId: string;
  inputMapping: Record<string, string>;
  outputMapping: Record<string, string>;
  onError: SubRuleErrorMode;
  defaultValue?: unknown;
  pinnedVersion: number | "latest";
  forEach?: string;
  as?: string;
};

export type LogicOperator = "and" | "or" | "xor" | "not";
