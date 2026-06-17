import { NextResponse, type NextRequest } from "next/server";
import { getActiveRoot } from "@/lib/server/workspace";
import { getActiveApiKeys, buildManifest, syncTokenOk } from "@/lib/server/sync";

export const dynamic = "force-dynamic";

// Active (non-revoked) keys only. The engine replaces its local api_keys with
// this set on each sync, so revoking a key here drops it from the engine's
// replica on the next pull.
export async function GET(req: NextRequest) {
  if (!syncTokenOk(req)) return NextResponse.json({ error: "invalid sync token" }, { status: 401 });
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  return NextResponse.json({ keysGeneration: buildManifest(root).keysGeneration, keys: getActiveApiKeys(root) });
}
