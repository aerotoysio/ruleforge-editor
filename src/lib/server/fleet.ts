import { getDb } from "./db";

// Fleet registry — engine instances POST heartbeats here; the Overview reads
// them back with a computed online/stale flag. The `engines` table is in the
// shared schema (db.ts); we also ensure it here so a cached connection that
// predates the table still works without a restart.

const ENSURE =
  "CREATE TABLE IF NOT EXISTS engines (id TEXT PRIMARY KEY, name TEXT, url TEXT, version TEXT, rule_source TEXT, binding_count INTEGER, generation TEXT, uptime_seconds INTEGER, last_seen_at TEXT)";

// An engine is "online" if we've heard from it within this window. Heartbeats
// are ~12s apart, so ~3 missed beats = offline.
const ONLINE_WINDOW_S = 40;

export type EngineHeartbeat = {
  engineId: string;
  name?: string;
  url?: string;
  version?: string;
  ruleSource?: string;
  bindingCount?: number;
  generation?: string | null;
  uptimeSeconds?: number;
};

export type EngineRow = {
  id: string;
  name: string | null;
  url: string | null;
  version: string | null;
  ruleSource: string | null;
  bindingCount: number | null;
  generation: string | null;
  uptimeSeconds: number | null;
  lastSeenAt: string | null;
  secondsAgo: number;
  online: boolean;
};

export function recordHeartbeat(rootPath: string, hb: EngineHeartbeat): void {
  const db = getDb(rootPath);
  db.exec(ENSURE);
  db.prepare(
    `INSERT INTO engines (id, name, url, version, rule_source, binding_count, generation, uptime_seconds, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, url=excluded.url, version=excluded.version, rule_source=excluded.rule_source,
       binding_count=excluded.binding_count, generation=excluded.generation, uptime_seconds=excluded.uptime_seconds,
       last_seen_at=excluded.last_seen_at`,
  ).run(
    hb.engineId,
    hb.name ?? null,
    hb.url ?? null,
    hb.version ?? null,
    hb.ruleSource ?? null,
    typeof hb.bindingCount === "number" ? hb.bindingCount : null,
    hb.generation ?? null,
    typeof hb.uptimeSeconds === "number" ? hb.uptimeSeconds : null,
    new Date().toISOString(),
  );
}

export function listEngines(rootPath: string): EngineRow[] {
  const db = getDb(rootPath);
  db.exec(ENSURE);
  const rows = db.prepare("SELECT * FROM engines ORDER BY name, id").all() as Array<{
    id: string; name: string | null; url: string | null; version: string | null; rule_source: string | null;
    binding_count: number | null; generation: string | null; uptime_seconds: number | null; last_seen_at: string | null;
  }>;
  const now = Date.now();
  return rows.map((r) => {
    const secondsAgo = r.last_seen_at ? Math.max(0, Math.round((now - new Date(r.last_seen_at).getTime()) / 1000)) : 1_000_000;
    return {
      id: r.id,
      name: r.name,
      url: r.url,
      version: r.version,
      ruleSource: r.rule_source,
      bindingCount: r.binding_count,
      generation: r.generation,
      uptimeSeconds: r.uptime_seconds,
      lastSeenAt: r.last_seen_at,
      secondsAgo,
      online: secondsAgo <= ONLINE_WINDOW_S,
    };
  });
}

/** Drop engines we haven't heard from in a long time (default 1h). */
export function forgetEngine(rootPath: string, id: string): void {
  const db = getDb(rootPath);
  db.exec(ENSURE);
  db.prepare("DELETE FROM engines WHERE id = ?").run(id);
}
