import { NextResponse } from "next/server";
import { getActiveRoot } from "@/lib/server/workspace";
import { getCurrentUser } from "@/lib/server/auth";
import { listEngines } from "@/lib/server/fleet";

export const dynamic = "force-dynamic";

export async function GET() {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ engines: [] });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ engines: listEngines(root) });
}
