import { NextResponse, type NextRequest } from "next/server";
import { getActiveRoot } from "@/lib/server/workspace";
import { getReferenceSetRow, syncTokenOk } from "@/lib/server/sync";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!syncTokenOk(req)) return NextResponse.json({ error: "invalid sync token" }, { status: 401 });
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  const row = getReferenceSetRow(root, id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(row);
}
