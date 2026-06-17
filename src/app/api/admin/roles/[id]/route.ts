import { NextResponse, type NextRequest } from "next/server";
import { getActiveRoot } from "@/lib/server/workspace";
import { requirePermission, PERM, AuthError } from "@/lib/server/auth";
import { deleteRole } from "@/lib/server/auth/admin";

type Ctx = { params: Promise<{ id: string }> };

function authErr(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  try { await requirePermission(PERM.USERS_MANAGE); } catch (e) { return authErr(e); }
  const { id } = await ctx.params;
  if (id === "admin") return NextResponse.json({ error: "The admin role can't be deleted" }, { status: 400 });
  deleteRole(root, id);
  return NextResponse.json({ ok: true });
}
