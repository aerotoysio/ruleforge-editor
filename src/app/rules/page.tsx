import { requireWorkspace } from "@/lib/server/require-workspace";
import { listRules, readRule, listNodeDefs } from "@/lib/server/workspace";
import { validateRule, groupIssues } from "@/lib/rule/validate";
import { RulesClient, type EnrichedRule } from "./RulesClient";

export default async function RulesPage() {
  const root = await requireWorkspace();
  const summaries = await listRules(root);
  const nodeDefs = await listNodeDefs(root);

  // Enrich each rule with validation status, test count, and category.
  // Cheap-ish: each rule reads a folder of small JSON files. Acceptable for
  // workspaces with <100 rules; we can paginate or cache server-side later.
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
      category: full.category,
      currentVersion: s.currentVersion,
      updatedAt: s.updatedAt,
      validity: { errors: errors.length, warnings: warnings.length },
      testCount: full.tests.length,
      tags: full.tags,
    });
  }

  return <RulesClient rules={enriched} />;
}
