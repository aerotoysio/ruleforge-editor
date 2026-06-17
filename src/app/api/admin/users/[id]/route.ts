import { NextResponse, type NextRequest } from "next/server";
import { getActiveRoot } from "@/lib/server/workspace";
import { requirePermission, PERM, AuthError } from "@/lib/server/auth";
import { setUserRoles, setPassword, deleteUser } from "@/lib/server/auth/admin";

type Ctx = { params: Promise<{ id: string }> };

function authErr(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  try { await requirePermission(PERM.USERS_MANAGE); } catch (e) { return authErr(e); }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { roles?: string[]; password?: string };
  if (Array.isArray(body.roles)) setUserRoles(root, id, body.roles);
  if (body.password) setPassword(root, id, body.password);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  let me;
  try { me = await requirePermission(PERM.USERS_MANAGE); } catch (e) { return authErr(e); }
  const { id } = await ctx.params;
  if (me.id === id) return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 });
  deleteUser(root, id);
  return NextResponse.json({ ok: true });
}
