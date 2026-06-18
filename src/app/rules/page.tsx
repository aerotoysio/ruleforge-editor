import { requireWorkspace } from "@/lib/server/require-workspace";
import { listRules, readRule, listNodeDefs } from "@/lib/server/workspace";
import { validateRule, groupIssues } from "@/lib/rule/validate";
import { getCurrentUser } from "@/lib/server/auth";
import { canAccessRule } from "@/lib/server/auth/types";
import { getLiveBindings, listReleases } from "@/lib/server/release";
import { RulesClient, type EnrichedRule } from "./RulesClient";

export default async function RulesPage() {
  const root = await requireWorkspace();
  const user = await getCurrentUser();
  const summaries = await listRules(root);
  const nodeDefs = await listNodeDefs(root);

  // Live + scheduled state derived from the immutable releases log (the source of
  // truth for what's actually serving), NOT the authoring status field.
  const live = getLiveBindings(root);
  const scheduledRules = new Set<string>();
  for (const rel of listReleases(root)) if (rel.status === "scheduled") scheduledRules.add(rel.ruleId);

  // Enrich each rule with validation status, test count, and category.
  // Cheap-ish: each rule reads a folder of small JSON files. Acceptable for
  // workspaces with <100 rules; we can paginate or cache server-side later.
  const enriched: EnrichedRule[] = [];
  for (const s of summaries) {
    // Role-scoping: hide rules owned by other teams (admins see all).
    if (user && !canAccessRule(user, s.ownerRole)) continue;
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
      ownerRole: s.ownerRole ?? null,
      liveVersion: live.get(`${s.method} ${s.endpoint}`)?.version ?? null,
      hasScheduled: scheduledRules.has(s.id),
    });
  }

  const isAdmin = !!user?.permissions.includes("*");
  return <RulesClient rules={enriched} isAdmin={isAdmin} />;
}
