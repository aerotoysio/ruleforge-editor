import { requireWorkspace } from "@/lib/server/require-workspace";
import { listRules, listReferences, listTemplates, listAssets, listNodeDefs, readSettings } from "@/lib/server/workspace";
import { getCurrentUser } from "@/lib/server/auth";
import { canAccessRule } from "@/lib/server/auth/types";
import { getLiveBindings, listReleases } from "@/lib/server/release";
import { DashboardClient, type DashboardStats } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const root = await requireWorkspace();
  const user = await getCurrentUser();
  const [summaries, refs, templates, assets, nodes, settings] = await Promise.all([
    listRules(root),
    listReferences(root),
    listTemplates(root),
    listAssets(root),
    listNodeDefs(root),
    readSettings(),
  ]);

  // Role-scoped: a team's overview reflects the rules they can see.
  const visible = user ? summaries.filter((s) => canAccessRule(user, s.ownerRole)) : summaries;

  const byStatus = { published: 0, review: 0, draft: 0 };
  const byTeam: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const s of visible) {
    if (s.status in byStatus) byStatus[s.status] += 1;
    const team = s.ownerRole || "unassigned";
    byTeam[team] = (byTeam[team] ?? 0) + 1;
    const cat = s.category || "Uncategorised";
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }

  // "Live" = what's actually serving per the releases log — NOT authoring status.
  // (After a publish, the working copy forks back to draft, so byStatus.published lies.)
  const liveMap = getLiveBindings(root);
  const scheduledRuleIds = new Set(listReleases(root).filter((r) => r.status === "scheduled").map((r) => r.ruleId));
  let live = 0;
  let scheduled = 0;
  for (const s of visible) {
    if (liveMap.get(`${s.method} ${s.endpoint}`)) live += 1;
    if (scheduledRuleIds.has(s.id)) scheduled += 1;
  }

  const stats: DashboardStats = {
    totalRules: visible.length,
    live,
    scheduled,
    byStatus,
    byTeam,
    byCategory,
    references: refs.length,
    templates: templates.length,
    assets: assets.length,
    nodes: nodes.length,
    engineConfigured: !!settings.engineUrl,
    isAdmin: !!user?.permissions.includes("*"),
    userLabel: user?.name || user?.email || null,
  };

  return <DashboardClient stats={stats} />;
}
