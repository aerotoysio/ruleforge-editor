import { NextResponse, type NextRequest } from "next/server";
import { getActiveRoot } from "@/lib/server/workspace";
import { requirePermission, PERM, AuthError } from "@/lib/server/auth";
import { listRoles, upsertRole } from "@/lib/server/auth/admin";

function authErr(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}

export async function GET() {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  try { await requirePermission(PERM.USERS_MANAGE); } catch (e) { return authErr(e); }
  return NextResponse.json({ roles: listRoles(root) });
}

export async function POST(req: NextRequest) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  try { await requirePermission(PERM.USERS_MANAGE); } catch (e) { return authErr(e); }
  const body = (await req.json().catch(() => ({}))) as { id?: string; name?: string; description?: string; permissions?: string[] };
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const id = upsertRole(root, { id: body.id, name: body.name, description: body.description, permissions: body.permissions ?? [] });
  return NextResponse.json({ ok: true, id });
}
