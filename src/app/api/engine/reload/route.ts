import { NextResponse } from "next/server";
import { readSettings } from "@/lib/server/workspace";

/**
 * POST /api/engine/reload — ask the running engine to re-read its fixtures.
 *
 * Confirmed endpoint on the RuleForge.Api host (shipped in commit 66e2e54):
 *   POST <engineUrl>/admin/refresh
 *     → re-scans rule source + reference source, atomic cache swap,
 *       returns { ok, refreshedAt, bindingCount, bindings, note }
 *
 * The Api host gates `/admin/*` with the RULEFORGE_API_KEY header in
 * production; the planned `serve` CLI verb (issue aerotoysio/ruleforge#28)
 * runs auth-disabled so the editor doesn't need to ship a key for local dev.
 *
 * We keep two fallback paths for engines that aren't the canonical Api host
 * (e.g. forks, older builds) — first 2xx wins; failures return 502 with the
 * detail of each attempt.
 */
const RELOAD_CANDIDATES = [
  "/admin/refresh",          // canonical RuleForge.Api endpoint
  "/admin/reload",           // legacy / forks
  "/admin/reload-fixtures",  // legacy / forks
];

export async function POST() {
  const settings = await readSettings();
  if (!settings.engineUrl) {
    return NextResponse.json(
      { error: "Engine URL not configured. Set it in Settings — only relevant when running the engine as an HTTP server." },
      { status: 409 },
    );
  }
  const base = settings.engineUrl.replace(/\/$/, "");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (settings.engineApiKey) headers["X-AERO-Key"] = settings.engineApiKey;
  const attempts: { url: string; status?: number; error?: string }[] = [];
  for (const p of RELOAD_CANDIDATES) {
    const url = `${base}${p}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: "{}",
        signal: AbortSignal.timeout(2000),
      });
      attempts.push({ url, status: res.status });
      if (res.ok) {
        return NextResponse.json({ ok: true, url, attempts });
      }
    } catch (err) {
      attempts.push({ url, error: (err as Error).message });
    }
  }
  return NextResponse.json(
    {
      error: "No reload endpoint responded. The engine may not yet support hot-reload — see /commands for the recommended approach.",
      attempts,
    },
    { status: 502 },
  );
}
