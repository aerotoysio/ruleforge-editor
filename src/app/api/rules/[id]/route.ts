import { NextResponse, type NextRequest } from "next/server";
import { readRule, writeRule, deleteRule, getActiveRoot } from "@/lib/server/workspace";
import { syncCompiledRule, scheduleEngineRefresh } from "@/lib/server/compiled-sync";
import { requirePermission, AuthError, PERM } from "@/lib/server/auth";
import { canAccessRule } from "@/lib/server/auth/types";
import type { Rule } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

function authErr(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  const rule = await readRule(root, id);
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ rule });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  let user;
  try {
    user = await requirePermission(PERM.RULES_EDIT);
  } catch (e) {
    return authErr(e);
  }
  const existing = await readRule(root, id);
  if (existing && !canAccessRule(user, existing.ownerRole)) {
    return NextResponse.json({ error: "This rule belongs to another team" }, { status: 403 });
  }
  const incoming = (await req.json()) as Rule;
  if (incoming.id !== id) {
    return NextResponse.json({ error: "Rule id mismatch" }, { status: 400 });
  }
  // Only admins may (re)assign ownership via a full save; non-admins keep it as-is.
  if (!user.permissions.includes("*")) incoming.ownerRole = existing?.ownerRole;
  const fileName = await writeRule(root, incoming);
  const engineSync = await syncCompiledRule(root, incoming.id);
  return NextResponse.json({ rule: incoming, fileName, engineSync });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  let user;
  try {
    user = await requirePermission(PERM.RULES_EDIT);
  } catch (e) {
    return authErr(e);
  }
  const existing = await readRule(root, id);
  if (existing && !canAccessRule(user, existing.ownerRole)) {
    return NextResponse.json({ error: "This rule belongs to another team" }, { status: 403 });
  }
  await deleteRule(root, id);
  scheduleEngineRefresh();
  return NextResponse.json({ ok: true });
}
