import Link from "next/link";
import { Plus, FileCog, ArrowUpRight } from "lucide-react";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { listRules } from "@/lib/server/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";

export default async function RulesPage() {
  const root = await requireWorkspace();
  const rules = await listRules(root);

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
        {rules.length === 0 ? (
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
            <div className="grid grid-cols-[2.2fr_1.6fr_120px_70px_120px_24px] gap-3 px-4 py-2.5 text-[10.5px] uppercase tracking-wider text-muted-foreground font-medium border-b bg-muted/40">
              <div>Name</div>
              <div>Endpoint</div>
              <div>Status</div>
              <div>Version</div>
              <div className="text-right">Updated</div>
              <div />
            </div>
            <div className="divide-y">
              {rules.map((rule) => (
                <Link
                  key={rule.id}
                  href={`/rules/${encodeURIComponent(rule.id)}`}
                  className="group grid grid-cols-[2.2fr_1.6fr_120px_70px_120px_24px] gap-3 px-4 py-3 items-center hover:bg-muted/40 transition-colors"
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
                  <div className="text-[12px] font-mono text-foreground/80">v{rule.currentVersion}</div>
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
