import { NextResponse, type NextRequest } from "next/server";
import { getActiveRoot } from "@/lib/server/workspace";
import { buildManifest, syncTokenOk } from "@/lib/server/sync";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!syncTokenOk(req)) return NextResponse.json({ error: "invalid sync token" }, { status: 401 });
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  return NextResponse.json(buildManifest(root));
}
