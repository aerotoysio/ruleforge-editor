import Link from "next/link";
import { Plus, FileCog, ArrowUpRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { listRules, readRule, listNodeDefs } from "@/lib/server/workspace";
import { validateRule, groupIssues } from "@/lib/rule/validate";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

type EnrichedRule = {
  id: string;
  name: string;
  endpoint: string;
  method: string;
  status: "draft" | "review" | "published";
  currentVersion: number;
  updatedAt: string;
  validity: { errors: number; warnings: number };
  testCount: number;
};

export default async function RulesPage() {
  const root = await requireWorkspace();
  const summaries = await listRules(root);
  const nodeDefs = await listNodeDefs(root);

  // Enrich each rule with validation status and test count.
  // Cheap-ish: each rule reads a folder of small JSON files. Acceptable for
  // a list of <100 rules; we can paginate or cache server-side later.
  const enriched: EnrichedRule[] = [];
  for (const s of summaries) {
    const full = await readRule(root, s.id);
    if (!full) continue;
    const issues = validateRule(full, nodeDefs);
    const { errors, warnings } = groupIssues(issues);
    enriched.push({
      id: s.id,
      name: s.name,
      endpoint: s.endpoint,
      method: s.method,
      status: s.status,
      currentVersion: s.currentVersion,
      updatedAt: s.updatedAt,
      validity: { errors: errors.length, warnings: warnings.length },
      testCount: full.tests.length,
    });
  }

  return (
    <>
      <PageHeader
        title="Rules"
        description="Author rule graphs that the RuleForge engine evaluates at request time."
        actions={
          <Link href="/rules/new">
            <Button variant="default" size="sm">
              <Plus className="w-3.5 h-3.5" /> New rule
            </Button>
          </Link>
        }
      />
      <div className="flex-1 overflow-auto px-8 py-6 bg-muted/30">
        {enriched.length === 0 ? (
          <EmptyState
            icon={<FileCog className="w-8 h-8" />}
            title="No rules yet"
            description="Create a new rule to start authoring its DAG. The wizard will walk you through the input and output schemas first."
            action={
              <Link href="/rules/new">
                <Button variant="default"><Plus className="w-3.5 h-3.5" /> New rule</Button>
              </Link>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
            <div className="grid grid-cols-[2.2fr_1.6fr_100px_70px_70px_120px_24px] gap-3 px-4 py-2.5 text-[10.5px] uppercase tracking-wider text-muted-foreground font-medium border-b bg-muted/40">
              <div>Name</div>
              <div>Endpoint</div>
              <div>Status</div>
              <div>Health</div>
              <div>Tests</div>
              <div className="text-right">Updated</div>
              <div />
            </div>
            <div className="divide-y">
              {enriched.map((rule) => (
                <Link
                  key={rule.id}
                  href={`/rules/${encodeURIComponent(rule.id)}`}
                  className="group grid grid-cols-[2.2fr_1.6fr_100px_70px_70px_120px_24px] gap-3 px-4 py-3 items-center hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium truncate text-foreground">{rule.name}</div>
                    <div className="text-[11px] font-mono truncate text-muted-foreground/70">{rule.id}</div>
                  </div>
                  <div className="font-mono text-[12px] truncate flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground tracking-wide">
                      {rule.method}
                    </span>
                    <span className="text-foreground/80 truncate">{rule.endpoint}</span>
                  </div>
                  <div><StatusBadge status={rule.status} /></div>
                  <div>
                    <ValidityPill validity={rule.validity} />
                  </div>
                  <div className="text-[11.5px] tabular-nums text-foreground/80">
                    {rule.testCount === 0 ? <span className="text-muted-foreground/60">—</span> : rule.testCount}
                  </div>
                  <div className="text-[11px] text-right text-muted-foreground">
                    {new Date(rule.updatedAt).toLocaleDateString()}
                  </div>
                  <div className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ValidityPill({ validity }: { validity: { errors: number; warnings: number } }) {
  if (validity.errors === 0 && validity.warnings === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[10px] font-medium border bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900"
        title="No validation issues."
      >
        <CheckCircle2 className="w-2.5 h-2.5" />
        Valid
      </span>
    );
  }
  const tone = validity.errors > 0
    ? "bg-red-50 text-red-900 border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900"
    : "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900";
  const label = validity.errors > 0
    ? `${validity.errors} ${validity.errors === 1 ? "error" : "errors"}`
    : `${validity.warnings} ${validity.warnings === 1 ? "warning" : "warnings"}`;
  return (
    <span
      className={cn("inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[10px] font-medium border", tone)}
      title={`Click to open and review issues — ${validity.errors} error${validity.errors === 1 ? "" : "s"}, ${validity.warnings} warning${validity.warnings === 1 ? "" : "s"}`}
    >
      <AlertTriangle className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}
