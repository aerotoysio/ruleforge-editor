import {
  readRule,
  listNodeDefs,
  listReferences,
  listTemplatesFull,
  listAssetsFull,
  readSettings,
} from "./workspace";
import { compileRuleForEngine } from "@/lib/rule/compile-to-engine";
import { getDb } from "./db";

// ─── Editor → engine sync ────────────────────────────────────────────────────
// On save, compile the authoring rule into the engine shape and upsert it into
// the shared workspace.db `compiled_rules` table, then nudge the warm engine to
// reload (POST /admin/refresh). Best-effort: a compile error or a down engine
// never blocks the save — the authoring rule is already persisted.

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced, fire-and-forget POST <engineUrl>/admin/refresh. */
export function scheduleEngineRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void fireRefresh();
  }, 300);
}

async function fireRefresh(): Promise<void> {
  try {
    const settings = await readSettings();
    if (!settings.engineUrl) return;
    const base = settings.engineUrl.replace(/\/$/, "");
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (settings.engineApiKey) headers["X-AERO-Key"] = settings.engineApiKey;
    await fetch(`${base}/admin/refresh`, {
      method: "POST",
      headers,
      body: "{}",
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Engine not running / unreachable — fine. compiled_rules is in the db; the
    // engine picks it up on its next refresh or restart.
  }
}

/**
 * Compile a rule and upsert it into compiled_rules, then schedule an engine
 * refresh. Returns {ok:false,error} on a compile error (without throwing) so
 * the caller can still report a successful save of the draft.
 */
export async function syncCompiledRule(rootPath: string, ruleId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const [rule, nodeDefs, refs, templates, assets] = await Promise.all([
      readRule(rootPath, ruleId),
      listNodeDefs(rootPath),
      listReferences(rootPath),
      listTemplatesFull(rootPath),
      listAssetsFull(rootPath),
    ]);
    if (!rule) return { ok: false, error: "rule not found" };

    const engineRule = compileRuleForEngine(rule, nodeDefs, { refs, templates, assets });
    const er = engineRule as unknown as Record<string, unknown>;
    const version = typeof er.currentVersion === "number" ? er.currentVersion : 1;
    const endpoint = typeof er.endpoint === "string" ? er.endpoint : "";
    const method = typeof er.method === "string" ? er.method : "POST";
    const status = typeof er.status === "string" ? er.status : null;

    getDb(rootPath)
      .prepare("INSERT OR REPLACE INTO compiled_rules (id, version, endpoint, method, status, json) VALUES (?, ?, ?, ?, ?, ?)")
      .run(rule.id, version, endpoint, method, status, JSON.stringify(engineRule));

    scheduleEngineRefresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
