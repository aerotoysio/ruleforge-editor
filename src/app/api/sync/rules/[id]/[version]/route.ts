import { NextResponse, type NextRequest } from "next/server";
import { getActiveRoot } from "@/lib/server/workspace";
import { getCompiledRuleRow, syncTokenOk } from "@/lib/server/sync";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; version: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!syncTokenOk(req)) return NextResponse.json({ error: "invalid sync token" }, { status: 401 });
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id, version } = await ctx.params;
  const v = Number.parseInt(version, 10);
  if (!Number.isFinite(v)) return NextResponse.json({ error: "bad version" }, { status: 400 });
  const row = getCompiledRuleRow(root, id, v);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  // `json` is the compiled rule body, stored as text — return it parsed inside
  // the envelope so the engine gets one object to upsert.
  return NextResponse.json({
    id: row.id,
    version: row.version,
    endpoint: row.endpoint,
    method: row.method,
    status: row.status,
    json: row.json,
  });
}
