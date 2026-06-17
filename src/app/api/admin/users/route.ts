import { NextResponse, type NextRequest } from "next/server";
import { getActiveRoot } from "@/lib/server/workspace";
import { requirePermission, PERM, AuthError } from "@/lib/server/auth";
import { listUsers, createUser, emailExists } from "@/lib/server/auth/admin";

function authErr(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}

export async function GET() {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  try { await requirePermission(PERM.USERS_MANAGE); } catch (e) { return authErr(e); }
  return NextResponse.json({ users: listUsers(root) });
}

export async function POST(req: NextRequest) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  try { await requirePermission(PERM.USERS_MANAGE); } catch (e) { return authErr(e); }
  const body = (await req.json().catch(() => ({}))) as { email?: string; name?: string; password?: string; roles?: string[] };
  if (!body.email || !body.password) return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  if (emailExists(root, body.email)) return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
  const user = createUser(root, { email: body.email, name: body.name, password: body.password, roles: body.roles ?? [] });
  return NextResponse.json({ user });
}
