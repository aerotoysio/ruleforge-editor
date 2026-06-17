import { NextResponse, type NextRequest } from "next/server";
import { listRules, writeRule, getActiveRoot } from "@/lib/server/workspace";
import { syncCompiledRule } from "@/lib/server/compiled-sync";
import { getCurrentUser, requirePermission, AuthError, PERM } from "@/lib/server/auth";
import { canAccessRule } from "@/lib/server/auth/types";
import type { Rule } from "@/lib/types";

export async function GET() {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const rules = await listRules(root);
  const user = await getCurrentUser();
  // Role-scoping: a signed-in user only sees rules their roles own (or unassigned).
  const visible = user ? rules.filter((r) => canAccessRule(user, r.ownerRole)) : rules;
  return NextResponse.json({ rules: visible });
}

export async function POST(req: NextRequest) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  let user;
  try {
    user = await requirePermission(PERM.RULES_EDIT);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const rule = (await req.json()) as Rule;
  if (!rule.id || !rule.name) {
    return NextResponse.json({ error: "Rule must have id and name" }, { status: 400 });
  }
  // Non-admins: default a new rule to their own team so it stays visible to them
  // under team scoping (otherwise it would be unassigned = admin-only).
  if (!user.permissions.includes("*") && !rule.ownerRole && user.roles.length) {
    rule.ownerRole = user.roles[0];
  }
  // Non-admins can't mint a rule owned by a team they're not in.
  if (rule.ownerRole && !canAccessRule(user, rule.ownerRole)) {
    return NextResponse.json({ error: "Cannot create a rule owned by another team" }, { status: 403 });
  }
  const fileName = await writeRule(root, rule);
  const engineSync = await syncCompiledRule(root, rule.id);
  return NextResponse.json({ rule, fileName, engineSync });
}
