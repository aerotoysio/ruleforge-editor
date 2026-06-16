// Standalone one-shot: import the folder workspace into workspace.db's authoring
// tables. Mirrors src/lib/server/migrate-to-sqlite.ts but runs in plain Node
// (no dev server needed). Usage: node scripts/migrate-to-sqlite.mjs "<workspace root>"
import { promises as fs } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.argv[2] || "C:\\DATA\\14. Aerotoys RuleForge\\ruleforge-sample-workspace";
const dbPath = path.join(root, "workspace.db");

const SCHEMA = `
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS rules (id TEXT PRIMARY KEY, updated_at TEXT, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS schema_templates (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, template_id TEXT, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS samples (rule_id TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (rule_id, id));
CREATE TABLE IF NOT EXISTS reference_sets (id TEXT PRIMARY KEY, name TEXT, version INTEGER, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS compiled_rules (id TEXT NOT NULL, version INTEGER NOT NULL, endpoint TEXT NOT NULL, method TEXT NOT NULL, status TEXT, json TEXT NOT NULL, PRIMARY KEY (id, version));
CREATE INDEX IF NOT EXISTS idx_compiled_endpoint ON compiled_rules(endpoint, method, version);
`;

const db = new DatabaseSync(dbPath);
db.exec(SCHEMA);

const readJson = async (p) => { try { return JSON.parse(await fs.readFile(p, "utf-8")); } catch { return null; } };
const listJson = async (dir) => { try { return (await fs.readdir(dir)).filter((f) => f.endsWith(".json") && !f.startsWith("_") && !f.startsWith(".") && !f.endsWith(".engine.json")); } catch { return []; } };

const counts = {};
async function simple(dir, table, extraCols, extract) {
  const cols = ["id", ...extraCols, "json"];
  const ins = db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`);
  let n = 0;
  for (const f of await listJson(path.join(root, dir))) {
    const d = await readJson(path.join(root, dir, f));
    if (!d || typeof d.id !== "string") continue;
    ins.run(d.id, ...extract(d), JSON.stringify(d));
    n++;
  }
  return n;
}

counts.rules      = await simple("rules", "rules", ["updated_at"], (d) => [typeof d.updatedAt === "string" ? d.updatedAt : null]);

// Legacy directory-layout rules: rules/<id>/rule.json + bindings/ + tests/ + schema/.
// Flat files shadow directories of the same id (already inserted above).
{
  const rulesBase = path.join(root, "rules");
  const insRule = db.prepare("INSERT OR REPLACE INTO rules (id, updated_at, json) VALUES (?, ?, ?)");
  const exists = db.prepare("SELECT 1 FROM rules WHERE id = ?");
  let entries = [];
  try { entries = await fs.readdir(rulesBase, { withFileTypes: true }); } catch {}
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const ruleDir = path.join(rulesBase, e.name);
    const onDisk = await readJson(path.join(ruleDir, "rule.json"));
    if (!onDisk || typeof onDisk.id !== "string") continue;
    if (exists.get(onDisk.id)) continue; // flat wins
    const bindings = {};
    for (const bf of await listJson(path.join(ruleDir, "bindings"))) {
      const b = await readJson(path.join(ruleDir, "bindings", bf));
      if (b && typeof b.instanceId === "string") bindings[b.instanceId] = b;
    }
    const tests = [];
    for (const tf of await listJson(path.join(ruleDir, "tests"))) {
      const t = await readJson(path.join(ruleDir, "tests", tf));
      if (t && typeof t.id === "string") tests.push(t);
    }
    const inputSchema = await readJson(path.join(ruleDir, "schema", "input.json"));
    const outputSchema = await readJson(path.join(ruleDir, "schema", "output.json"));
    const contextSchema = await readJson(path.join(ruleDir, "schema", "context.json"));
    const full = { ...onDisk, bindings, tests };
    if (inputSchema) full.inputSchema = inputSchema;
    if (outputSchema) full.outputSchema = outputSchema;
    if (contextSchema) full.contextSchema = contextSchema;
    insRule.run(full.id, typeof full.updatedAt === "string" ? full.updatedAt : null, JSON.stringify(full));
    counts.rules++;
  }
}

counts.nodes      = await simple("nodes", "nodes", [], () => []);
counts.references = await simple("refs", "reference_sets", ["name", "version"], (d) => [d.name ?? null, typeof d.currentVersion === "number" ? d.currentVersion : 1]);
counts.templates  = await simple("templates", "templates", [], () => []);
counts.schemas    = await simple("schemas", "schema_templates", [], () => []);
counts.assets     = await simple("assets", "assets", ["template_id"], (d) => [d.templateId ?? null]);

counts.samples = 0;
{
  const base = path.join(root, "samples");
  const ins = db.prepare("INSERT OR REPLACE INTO samples (rule_id, id, json) VALUES (?, ?, ?)");
  let subs = [];
  try { subs = (await fs.readdir(base, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name); } catch {}
  for (const sub of subs) {
    const fb = sub === "_shared" ? "" : sub;
    for (const f of await listJson(path.join(base, sub))) {
      const s = await readJson(path.join(base, sub, f));
      if (!s || typeof s.id !== "string") continue;
      ins.run(typeof s.ruleId === "string" && s.ruleId ? s.ruleId : fb, s.id, JSON.stringify(s));
      counts.samples++;
    }
  }
}

console.log("migrated: " + JSON.stringify(counts));
db.close();
