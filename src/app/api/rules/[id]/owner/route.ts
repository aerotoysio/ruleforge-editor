import { NextResponse, type NextRequest } from "next/server";
import { readRule, writeRule, getActiveRoot } from "@/lib/server/workspace";
import { syncCompiledRule } from "@/lib/server/compiled-sync";
import { requirePermission, AuthError, PERM } from "@/lib/server/auth";
import { canAccessRule } from "@/lib/server/auth/types";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/rules/[id]/owner  { ownerRole: string | null }
// Assign (or clear) the team that owns a rule. Requires rules.edit, and the
// caller must already be able to access the rule (admin, or its current team).
export async function POST(req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  let user;
  try {
    user = await requirePermission(PERM.RULES_EDIT);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const rule = await readRule(root, id);
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessRule(user, rule.ownerRole)) {
    return NextResponse.json({ error: "This rule belongs to another team" }, { status: 403 });
  }
  const { ownerRole } = (await req.json().catch(() => ({}))) as { ownerRole?: string | null };
  rule.ownerRole = ownerRole || undefined;
  await writeRule(root, rule);
  await syncCompiledRule(root, id);
  return NextResponse.json({ ok: true, ownerRole: rule.ownerRole ?? null });
}
