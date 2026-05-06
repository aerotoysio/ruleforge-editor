export type Decision = "apply" | "skip" | "error";

export type TraceOutcome = "pass" | "fail" | "skip" | "error";

export type TraceEntry = {
  nodeId: string;
  startedAt: string;
  durationMs: number;
  outcome: TraceOutcome;
  input?: unknown;
  output?: unknown;
  ctxRead?: Record<string, unknown>;
  ctxWritten?: Record<string, unknown>;
  subRuleRunId?: string;
  error?: string;
};

export type Envelope = {
  ruleId: string;
  ruleVersion: number;
  decision: Decision;
  evaluatedAt: string;
  result?: unknown;
  trace?: TraceEntry[];
  durationMs?: number;
};
