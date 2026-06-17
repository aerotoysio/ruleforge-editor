import { NextResponse } from "next/server";
import { getActiveRoot } from "@/lib/server/workspace";
import { getCurrentUser } from "@/lib/server/auth";
import { listReleases } from "@/lib/server/release";

export const dynamic = "force-dynamic";

// GET /api/releases — the full release/audit feed (most recent first).
export async function GET() {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ releases: [] });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ releases: listReleases(root) });
}
