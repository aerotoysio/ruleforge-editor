import { NextResponse } from "next/server";
import { readSettings } from "@/lib/server/workspace";

// GET /api/engine/status — probe the configured engine's /ready (health + stats).
// /ready bypasses the engine's API-key gate, so this works whether or not key
// enforcement is on; we still send the editor's engine key if configured.
export async function GET() {
  const settings = await readSettings();
  if (!settings.engineUrl) return NextResponse.json({ configured: false });
  const base = settings.engineUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {};
  if (settings.engineApiKey) headers["X-AERO-Key"] = settings.engineApiKey;
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/ready`, { headers, signal: AbortSignal.timeout(3000) });
    const latencyMs = Date.now() - t0;
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ configured: true, online: res.ok, latencyMs, url: base, ...data });
  } catch (e) {
    return NextResponse.json({ configured: true, online: false, url: base, latencyMs: Date.now() - t0, error: (e as Error).message });
  }
}
