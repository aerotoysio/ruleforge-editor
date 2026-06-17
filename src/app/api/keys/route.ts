import { NextResponse, type NextRequest } from "next/server";
import { getActiveRoot } from "@/lib/server/workspace";
import { requirePermission, PERM, AuthError } from "@/lib/server/auth";
import { createApiKey, listApiKeys } from "@/lib/server/api-keys";

function authErr(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}

export async function GET() {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  try {
    await requirePermission(PERM.USERS_MANAGE);
  } catch (e) {
    return authErr(e);
  }
  return NextResponse.json({ keys: listApiKeys(root) });
}

export async function POST(req: NextRequest) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  let user;
  try {
    user = await requirePermission(PERM.USERS_MANAGE);
  } catch (e) {
    return authErr(e);
  }
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  const { key, info } = createApiKey(root, (name || "Untitled key").trim(), user.email);
  // `key` is the ONLY time the full secret is returned.
  return NextResponse.json({ key, info });
}
