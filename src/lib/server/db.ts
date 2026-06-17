import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// ─── Shared SQLite workspace.db ──────────────────────────────────────────────
// One database file per workspace root, opened once and reused across requests.
// The engine (RuleForge.Api, Microsoft.Data.Sqlite) reads compiled_rules +
// reference_sets from the SAME file; the editor owns the authoring tables. WAL
// mode lets the engine read concurrently while the editor writes.
//
// IMPORTANT: the Anthropic key + machine settings live in ~/.ruleforge-editor.json,
// NEVER in this shared db.

const cache = new Map<string, DatabaseSync>();

const SCHEMA = `
PRAGMA journal_mode=WAL;

-- Authoring rules (the editor's source of truth; full Rule incl. instances,
-- bindings, schemas, tests, aiMeta as a JSON blob).
CREATE TABLE IF NOT EXISTS rules (
  id          TEXT PRIMARY KEY,
  updated_at  TEXT,
  json        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes            (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS templates        (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS schema_templates (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assets           (id TEXT PRIMARY KEY, template_id TEXT, json TEXT NOT NULL);

-- Samples are per-rule (rule_id = '' for shared/_shared).
CREATE TABLE IF NOT EXISTS samples (
  rule_id TEXT NOT NULL,
  id      TEXT NOT NULL,
  json    TEXT NOT NULL,
  PRIMARY KEY (rule_id, id)
);

-- Shared with the engine (mirrors RuleForge.Core SqliteSchema).
CREATE TABLE IF NOT EXISTS reference_sets (
  id       TEXT PRIMARY KEY,
  name     TEXT,
  version  INTEGER,
  json     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS compiled_rules (
  id        TEXT    NOT NULL,
  version   INTEGER NOT NULL,
  endpoint  TEXT    NOT NULL,
  method    TEXT    NOT NULL,
  status    TEXT,
  json      TEXT    NOT NULL,
  PRIMARY KEY (id, version)
);
CREATE INDEX IF NOT EXISTS idx_compiled_endpoint ON compiled_rules(endpoint, method, version);

-- Auth / RBAC. Users + password hashes live here (workspace.db is gitignored, so
-- they never leave the machine); the Anthropic key does NOT. Unused when
-- RULEFORGE_AUTH_MODE=external (identity comes from the upstream PSS gateway).
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  password_hash TEXT,
  created_at    TEXT
);
CREATE TABLE IF NOT EXISTS roles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  permissions TEXT NOT NULL          -- JSON array of capability strings ("*" = all)
);
CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (user_id, role_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TEXT,
  expires_at TEXT
);

-- API keys that secure the engine's runtime endpoints. Minted/revoked in the
-- editor; the engine validates X-AERO-Key against key_hash (SHA-256) in this
-- same db ("gold sync" — mint here, works against the engine immediately). Only
-- the hash + a display prefix are stored; the full key is shown once.
CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  name         TEXT,
  prefix       TEXT,
  key_hash     TEXT NOT NULL,
  created_by   TEXT,
  created_at   TEXT,
  last_used_at TEXT,
  revoked      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- Fleet registry. Engine instances self-register via heartbeat (POST
-- /api/fleet/heartbeat); the Overview reads this for per-engine health.
CREATE TABLE IF NOT EXISTS engines (
  id             TEXT PRIMARY KEY,
  name           TEXT,
  url            TEXT,
  version        TEXT,
  rule_source    TEXT,
  binding_count  INTEGER,
  generation     TEXT,
  uptime_seconds INTEGER,
  last_seen_at   TEXT
);

-- Release audit log + live-binding source of truth. Every publish / rollback /
-- unpublish is an immutable row; the live version per endpoint is derived from
-- it — so a draft can never go live, and any engine response (which carries its
-- rule version) traces back to exactly when/who/how that version went live.
CREATE TABLE IF NOT EXISTS releases (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id      TEXT NOT NULL,
  version      INTEGER NOT NULL,
  endpoint     TEXT,
  method       TEXT,
  action       TEXT NOT NULL,   -- publish | rollback | unpublish
  status       TEXT NOT NULL,   -- live | scheduled | superseded
  effective_at TEXT,            -- when it goes / went live (ISO)
  created_at   TEXT NOT NULL,
  created_by   TEXT,
  note         TEXT
);
CREATE INDEX IF NOT EXISTS idx_releases_rule ON releases(rule_id, id);
`;

export function dbPathFor(rootPath: string): string {
  return path.join(rootPath, "workspace.db");
}

/** Open (once) the workspace.db for a root, ensuring the schema exists. */
export function getDb(rootPath: string): DatabaseSync {
  const p = dbPathFor(rootPath);
  let db = cache.get(p);
  if (!db) {
    db = new DatabaseSync(p);
    db.exec(SCHEMA);
    cache.set(p, db);
  }
  return db;
}
