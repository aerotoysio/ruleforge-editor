import { requireWorkspace } from "@/lib/server/require-workspace";
import { listRules } from "@/lib/server/workspace";
import { getCurrentUser } from "@/lib/server/auth";
import { canAccessRule, userHasPermission, PERM } from "@/lib/server/auth/types";
import { getLiveBindings, listReleases, type Release } from "@/lib/server/release";
import { ReleasesClient, type RuleRelease } from "./ReleasesClient";

export const dynamic = "force-dynamic";

export default async function ReleasesPage() {
  const root = await requireWorkspace();
  const user = await getCurrentUser();
  const summaries = await listRules(root);
  const live = getLiveBindings(root);
  const allReleases = listReleases(root); // newest first

  const rules: RuleRelease[] = [];
  for (const s of summaries) {
    if (user && !canAccessRule(user, s.ownerRole)) continue;
    const rels = allReleases.filter((r) => r.ruleId === s.id);
    const scheduled = rels.filter((r) => r.status === "scheduled");
    rules.push({
      id: s.id,
      name: s.name,
      endpoint: s.endpoint,
      method: s.method,
      currentVersion: s.currentVersion,
      liveVersion: live.get(`${s.method} ${s.endpoint}`)?.version ?? null,
      scheduled: scheduled.map((r) => ({ version: r.version, effectiveAt: r.effectiveAt })),
    });
  }
  rules.sort((a, b) => a.name.localeCompare(b.name));

  const accessibleIds = new Set(rules.map((r) => r.id));
  const feed: Release[] = allReleases.filter((r) => accessibleIds.has(r.ruleId)).slice(0, 50);
  const canPublish = !!user && userHasPermission(user, PERM.RULES_PUBLISH);

  return <ReleasesClient rules={rules} feed={feed} canPublish={canPublish} />;
}
