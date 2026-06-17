import crypto from "node:crypto";
import { getDb } from "./db";
import { getLiveBindings } from "./release";

// ─── Control-plane sync surface ──────────────────────────────────────────────
// Read-only projection of the central workspace.db that the engine fleet pulls
// over HTTP (see ARCHITECTURE.md). Engines mirror compiled_rules + reference_sets
// + active api_keys into their OWN local SQLite replica, then serve from it. The
// manifest is the small "what's current" snapshot; rule/refset artifacts are
// immutable per (id, version) so they're cache-forever.

export type ManifestRule = {
  id: string;
  version: number;
  endpoint: string;
  method: string;
  status: string | null;
};
export type ManifestRefSet = { id: string; version: number };
export type SyncManifest = {
  generation: string; // changes whenever anything below changes — engines poll this
  rules: ManifestRule[];
  referenceSets: ManifestRefSet[];
  keysGeneration: string; // changes when the active key set changes
};

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function buildManifest(rootPath: string, opts?: { includeDrafts?: boolean }): SyncManifest {
  const db = getDb(rootPath);
  let rules: ManifestRule[];
  if (opts?.includeDrafts) {
    // Test engines: every compiled version (the engine binds the latest, incl. drafts).
    rules = (db.prepare("SELECT id, version, endpoint, method, status FROM compiled_rules ORDER BY id, version").all() as Array<{ id: string; version: number; endpoint: string; method: string; status: string | null }>).map(
      (r) => ({ id: r.id, version: r.version, endpoint: r.endpoint, method: r.method, status: r.status ?? null }),
    );
  } else {
    // Fleet: ONLY the live published binding per endpoint. Drafts never ship — a
    // restarted engine re-pulls only what has actually been published.
    const live = getLiveBindings(rootPath);
    const get = db.prepare("SELECT id, version, endpoint, method, status FROM compiled_rules WHERE id = ? AND version = ? LIMIT 1");
    rules = [];
    for (const { ruleId, version } of live.values()) {
      const row = (get.all(ruleId, version) as Array<{ id: string; version: number; endpoint: string; method: string; status: string | null }>)[0];
      if (row) rules.push({ id: row.id, version: row.version, endpoint: row.endpoint, method: row.method, status: row.status ?? null });
    }
    rules.sort((a, b) => a.id.localeCompare(b.id) || a.version - b.version);
  }
  const referenceSets = (db.prepare("SELECT id, version FROM reference_sets ORDER BY id").all() as Array<{ id: string; version: number | null }>).map(
    (r) => ({ id: r.id, version: r.version ?? 1 }),
  );
  const hashes = (db.prepare("SELECT key_hash FROM api_keys WHERE revoked = 0 ORDER BY key_hash").all() as Array<{ key_hash: string }>).map((r) => r.key_hash);
  const keysGeneration = sha256(hashes.join(","));
  const generation = sha256(JSON.stringify({ rules, referenceSets, keysGeneration }));
  return { generation, rules, referenceSets, keysGeneration };
}

export function getCompiledRuleRow(rootPath: string, id: string, version: number) {
  const row = (getDb(rootPath)
    .prepare("SELECT id, version, endpoint, method, status, json FROM compiled_rules WHERE id = ? AND version = ? LIMIT 1")
    .all(id, version) as Array<{ id: string; version: number; endpoint: string; method: string; status: string | null; json: string }>)[0];
  if (!row) return null;
  return { id: row.id, version: row.version, endpoint: row.endpoint, method: row.method, status: row.status ?? null, json: row.json };
}

export function getReferenceSetRow(rootPath: string, id: string) {
  const row = (getDb(rootPath)
    .prepare("SELECT id, name, version, json FROM reference_sets WHERE id = ? LIMIT 1")
    .all(id) as Array<{ id: string; name: string | null; version: number | null; json: string }>)[0];
  if (!row) return null;
  return { id: row.id, name: row.name ?? null, version: row.version ?? 1, json: row.json };
}

export function getActiveApiKeys(rootPath: string) {
  return (getDb(rootPath).prepare("SELECT id, prefix, key_hash FROM api_keys WHERE revoked = 0").all() as Array<{ id: string; prefix: string | null; key_hash: string }>).map(
    (r) => ({ id: r.id, prefix: r.prefix ?? "", keyHash: r.key_hash }),
  );
}

/**
 * Service-token gate for the sync surface. If RULEFORGE_SYNC_TOKEN is set, an
 * engine must present a matching X-Sync-Token header; if it's unset, the surface
 * is open (local dev). Engines are trusted internal clients, not end users — so
 * this is deliberately separate from the human auth/RBAC layer.
 */
export function syncTokenOk(req: Request): boolean {
  const expected = process.env.RULEFORGE_SYNC_TOKEN;
  if (!expected) return true;
  const supplied = req.headers.get("x-sync-token") ?? "";
  return supplied.length > 0 && supplied === expected;
}
