import { getDb } from "./db";
import { readRule, writeRule } from "./workspace";
import { syncCompiledRule } from "./compiled-sync";

// Rule release management. The `releases` table is an immutable audit log AND the
// source of truth for what's LIVE: the live version per endpoint is derived from
// the most recent effective publish/rollback (minus unpublishes). A draft only
// goes live when explicitly published; published versions are frozen (publishing
// forks the working draft to the next version), so any engine response traces to
// an exact, unchangeable version.

const ENSURE =
  "CREATE TABLE IF NOT EXISTS releases (id INTEGER PRIMARY KEY AUTOINCREMENT, rule_id TEXT NOT NULL, version INTEGER NOT NULL, endpoint TEXT, method TEXT, action TEXT NOT NULL, status TEXT NOT NULL, effective_at TEXT, created_at TEXT NOT NULL, created_by TEXT, note TEXT)";

export type Release = {
  id: number;
  ruleId: string;
  version: number;
  endpoint: string | null;
  method: string | null;
  action: string;
  status: string;
  effectiveAt: string | null;
  createdAt: string;
  createdBy: string | null;
  note: string | null;
};

type ReleaseInput = {
  ruleId: string; version: number; endpoint?: string | null; method?: string | null;
  action: string; status: string; effectiveAt?: string | null; by?: string | null; note?: string | null;
};

function recordRelease(rootPath: string, r: ReleaseInput): void {
  const db = getDb(rootPath);
  db.exec(ENSURE);
  if (r.status === "live") {
    // Only one live release per endpoint — retire the previous one.
    db.prepare("UPDATE releases SET status='superseded' WHERE status='live' AND method=? AND endpoint=?").run(r.method ?? null, r.endpoint ?? null);
  }
  db.prepare(
    "INSERT INTO releases (rule_id, version, endpoint, method, action, status, effective_at, created_at, created_by, note) VALUES (?,?,?,?,?,?,?,?,?,?)",
  ).run(r.ruleId, r.version, r.endpoint ?? null, r.method ?? null, r.action, r.status, r.effectiveAt ?? null, new Date().toISOString(), r.by ?? null, r.note ?? null);
}

/**
 * One-time migration: treat each currently-bound compiled rule as a live release
 * so the running fleet keeps serving when the gate switches on. No-op once any
 * release exists.
 */
export function backfillLiveFromCompiled(rootPath: string): number {
  const db = getDb(rootPath);
  db.exec(ENSURE);
  const existing = db.prepare("SELECT COUNT(*) AS c FROM releases").get() as { c: number } | undefined;
  if (existing && existing.c > 0) return 0;
  const rows = db.prepare("SELECT id AS rule_id, endpoint, method, MAX(version) AS version FROM compiled_rules GROUP BY method, endpoint").all() as Array<{
    rule_id: string; endpoint: string; method: string; version: number;
  }>;
  const now = new Date().toISOString();
  const ins = db.prepare(
    "INSERT INTO releases (rule_id, version, endpoint, method, action, status, effective_at, created_at, created_by, note) VALUES (?,?,?,?, 'publish','live', ?, ?, 'system', 'backfilled from existing compiled rules')",
  );
  for (const r of rows) ins.run(r.rule_id, r.version, r.endpoint, r.method, now, now);
  return rows.length;
}

/** Live version per "METHOD endpoint" — the most recent effective publish/rollback (due scheduled count), minus unpublishes. */
export function getLiveBindings(rootPath: string): Map<string, { ruleId: string; version: number }> {
  backfillLiveFromCompiled(rootPath); // idempotent migration
  const db = getDb(rootPath);
  const now = new Date().toISOString();
  const rows = db.prepare(
    `SELECT endpoint, method, rule_id, version, action FROM releases
     WHERE action IN ('publish','rollback','unpublish') AND status != 'superseded'
       AND (effective_at IS NULL OR effective_at <= ?)
     ORDER BY COALESCE(effective_at, created_at) ASC, id ASC`,
  ).all(now) as Array<{ endpoint: string | null; method: string | null; rule_id: string; version: number; action: string }>;
  const map = new Map<string, { ruleId: string; version: number }>();
  for (const r of rows) {
    if (!r.endpoint || !r.method) continue;
    const k = `${r.method} ${r.endpoint}`;
    if (r.action === "unpublish") map.delete(k);
    else map.set(k, { ruleId: r.rule_id, version: r.version }); // ASC → latest effective wins
  }
  return map;
}

export function listReleases(rootPath: string, ruleId?: string): Release[] {
  const db = getDb(rootPath);
  db.exec(ENSURE);
  const rows = (ruleId
    ? db.prepare("SELECT * FROM releases WHERE rule_id=? ORDER BY id DESC").all(ruleId)
    : db.prepare("SELECT * FROM releases ORDER BY id DESC").all()) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as number, ruleId: r.rule_id as string, version: r.version as number,
    endpoint: (r.endpoint as string) ?? null, method: (r.method as string) ?? null,
    action: r.action as string, status: r.status as string, effectiveAt: (r.effective_at as string) ?? null,
    createdAt: r.created_at as string, createdBy: (r.created_by as string) ?? null, note: (r.note as string) ?? null,
  }));
}

/** Publish the rule's current working version: snapshot it live (or scheduled), then fork the draft so the published version freezes. */
export async function publishRule(rootPath: string, ruleId: string, opts: { by?: string; scheduledFor?: string | null; note?: string | null }): Promise<{ version: number; status: string; effectiveAt: string }> {
  const rule = await readRule(rootPath, ruleId);
  if (!rule) throw new Error("rule not found");
  await syncCompiledRule(rootPath, ruleId); // ensure the current version is compiled (immutable snapshot)
  const version = rule.currentVersion;
  const scheduled = !!opts.scheduledFor && new Date(opts.scheduledFor).getTime() > Date.now();
  const effectiveAt = scheduled ? new Date(opts.scheduledFor as string).toISOString() : new Date().toISOString();
  recordRelease(rootPath, {
    ruleId, version, endpoint: rule.endpoint, method: rule.method,
    action: "publish", status: scheduled ? "scheduled" : "live", effectiveAt, by: opts.by, note: opts.note,
  });
  if (!scheduled) {
    // Immutability: advance the working draft so the just-published version is frozen.
    await writeRule(rootPath, { ...rule, currentVersion: version + 1, status: "draft", updatedAt: new Date().toISOString() });
    await syncCompiledRule(rootPath, ruleId);
  }
  return { version, status: scheduled ? "scheduled" : "live", effectiveAt };
}

/** Re-point the live binding to a prior published version (instant — versions are immutable). */
export async function rollbackRule(rootPath: string, ruleId: string, toVersion: number, opts: { by?: string; note?: string | null }): Promise<void> {
  const rule = await readRule(rootPath, ruleId);
  if (!rule) throw new Error("rule not found");
  recordRelease(rootPath, {
    ruleId, version: toVersion, endpoint: rule.endpoint, method: rule.method,
    action: "rollback", status: "live", effectiveAt: new Date().toISOString(), by: opts.by, note: opts.note ?? `rolled back to v${toVersion}`,
  });
}

/** Pull a rule off the live fleet entirely (the endpoint stops resolving). */
export async function unpublishRule(rootPath: string, ruleId: string, opts: { by?: string; note?: string | null }): Promise<void> {
  const rule = await readRule(rootPath, ruleId);
  if (!rule) throw new Error("rule not found");
  recordRelease(rootPath, {
    ruleId, version: rule.currentVersion, endpoint: rule.endpoint, method: rule.method,
    action: "unpublish", status: "live", effectiveAt: new Date().toISOString(), by: opts.by, note: opts.note,
  });
}
