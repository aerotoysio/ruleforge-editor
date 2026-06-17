import { NextResponse, type NextRequest } from "next/server";
import { getActiveRoot, readRule } from "@/lib/server/workspace";
import { requirePermission, PERM, AuthError } from "@/lib/server/auth";
import { canAccessRule } from "@/lib/server/auth/types";
import { publishRule, rollbackRule, unpublishRule, listReleases } from "@/lib/server/release";

type Ctx = { params: Promise<{ id: string }> };

function authErr(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}

// GET — the rule's release/audit history.
export async function GET(_req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  let user;
  try { user = await requirePermission(PERM.RULES_EDIT); } catch (e) { return authErr(e); }
  const rule = await readRule(root, id);
  if (rule && !canAccessRule(user, rule.ownerRole)) return NextResponse.json({ error: "This rule belongs to another team" }, { status: 403 });
  return NextResponse.json({ releases: listReleases(root, id) });
}

// POST { action: publish | rollback | unpublish, scheduledFor?, toVersion?, note? }
export async function POST(req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  let user;
  try { user = await requirePermission(PERM.RULES_PUBLISH); } catch (e) { return authErr(e); }
  const rule = await readRule(root, id);
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessRule(user, rule.ownerRole)) return NextResponse.json({ error: "This rule belongs to another team" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { action?: string; scheduledFor?: string | null; toVersion?: number; note?: string | null };
  const by = user.email;
  const action = body.action ?? "publish";
  try {
    if (action === "publish") {
      const r = await publishRule(root, id, { by, scheduledFor: body.scheduledFor ?? null, note: body.note ?? null });
      return NextResponse.json({ ok: true, ...r });
    }
    if (action === "rollback") {
      if (typeof body.toVersion !== "number") return NextResponse.json({ error: "toVersion required" }, { status: 400 });
      await rollbackRule(root, id, body.toVersion, { by, note: body.note ?? null });
      return NextResponse.json({ ok: true, version: body.toVersion, status: "live" });
    }
    if (action === "unpublish") {
      await unpublishRule(root, id, { by, note: body.note ?? null });
      return NextResponse.json({ ok: true, status: "unpublished" });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
