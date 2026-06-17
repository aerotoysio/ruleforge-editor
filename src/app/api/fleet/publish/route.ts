import { NextResponse } from "next/server";
import { getActiveRoot, readSettings } from "@/lib/server/workspace";
import { requirePermission, PERM, AuthError } from "@/lib/server/auth";
import { listEngines } from "@/lib/server/fleet";

// POST /api/fleet/publish — fan out POST /admin/refresh to EVERY registered
// engine so they all re-pull the latest published rules from the control plane.
// This is the deliberate "push to the fleet" step, distinct from the per-save
// refresh of the single configured test engine. Gated by rules.publish.
export async function POST() {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  try {
    await requirePermission(PERM.RULES_PUBLISH);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const settings = await readSettings();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (settings.engineApiKey) headers["X-AERO-Key"] = settings.engineApiKey;

  const engines = listEngines(root);
  const results = await Promise.all(
    engines.map(async (e) => {
      if (!e.url) return { id: e.id, name: e.name, ok: false, error: "no url" };
      const url = `${e.url.replace(/\/$/, "")}/admin/refresh`;
      try {
        const res = await fetch(url, { method: "POST", headers, body: "{}", signal: AbortSignal.timeout(5000) });
        return { id: e.id, name: e.name, ok: res.ok, status: res.status };
      } catch (err) {
        return { id: e.id, name: e.name, ok: false, error: (err as Error).message };
      }
    }),
  );

  return NextResponse.json({
    ok: true,
    refreshed: results.filter((r) => r.ok).length,
    total: results.length,
    results,
  });
}
