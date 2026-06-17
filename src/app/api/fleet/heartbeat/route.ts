import { NextResponse, type NextRequest } from "next/server";
import { getActiveRoot } from "@/lib/server/workspace";
import { syncTokenOk } from "@/lib/server/sync";
import { recordHeartbeat, type EngineHeartbeat } from "@/lib/server/fleet";

// Engines self-register here every ~12s. Gated by the same service token as the
// sync API (engines are trusted internal clients, not human users).
export async function POST(req: NextRequest) {
  if (!syncTokenOk(req)) return NextResponse.json({ error: "invalid sync token" }, { status: 401 });
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const hb = (await req.json().catch(() => null)) as EngineHeartbeat | null;
  if (!hb?.engineId) return NextResponse.json({ error: "engineId required" }, { status: 400 });
  recordHeartbeat(root, hb);
  return NextResponse.json({ ok: true });
}
