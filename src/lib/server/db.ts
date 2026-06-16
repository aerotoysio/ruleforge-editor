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
