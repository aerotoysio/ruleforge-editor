import { promises as fs } from "node:fs";
import path from "node:path";
import { getDb } from "./db";

// One-shot importer: copy the folder workspace into the SQLite authoring tables.
// Reads the folders directly (independent of workspace.ts, so it keeps working
// after workspace.ts moves to SQLite) and stores each document as a JSON blob.
// Idempotent (INSERT OR REPLACE) — safe to re-run.

async function readJson(p: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).filter(
      (f) => f.endsWith(".json") && !f.startsWith("_") && !f.startsWith(".") && !f.endsWith(".engine.json"),
    );
  } catch {
    return [];
  }
}

export async function migrateFoldersToSqlite(rootPath: string): Promise<Record<string, number>> {
  const db = getDb(rootPath);
  const counts: Record<string, number> = {
    rules: 0, nodes: 0, references: 0, templates: 0, schemas: 0, assets: 0, samples: 0,
  };

  const simple = async (dir: string, table: string, extraCols: string[], extract: (d: Record<string, unknown>) => (string | number | null)[]) => {
    const cols = ["id", ...extraCols, "json"];
    const placeholders = cols.map(() => "?").join(", ");
    const ins = db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`);
    let n = 0;
    for (const f of await listJsonFiles(path.join(rootPath, dir))) {
      const d = await readJson(path.join(rootPath, dir, f));
      if (!d || typeof d.id !== "string") continue;
      ins.run(d.id, ...extract(d), JSON.stringify(d));
      n++;
    }
    return n;
  };

  counts.rules      = await simple("rules", "rules", ["updated_at"], (d) => [typeof d.updatedAt === "string" ? d.updatedAt : null]);
  counts.nodes      = await simple("nodes", "nodes", [], () => []);
  counts.references = await simple("refs", "reference_sets", ["name", "version"], (d) => [typeof d.name === "string" ? d.name : null, typeof d.currentVersion === "number" ? d.currentVersion : 1]);
  counts.templates  = await simple("templates", "templates", [], () => []);
  counts.schemas    = await simple("schemas", "schema_templates", [], () => []);
  counts.assets     = await simple("assets", "assets", ["template_id"], (d) => [typeof d.templateId === "string" ? d.templateId : null]);

  // Samples: samples/<ruleId>/*.json and samples/_shared/*.json
  {
    const base = path.join(rootPath, "samples");
    const ins = db.prepare("INSERT OR REPLACE INTO samples (rule_id, id, json) VALUES (?, ?, ?)");
    let subdirs: string[] = [];
    try {
      subdirs = (await fs.readdir(base, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
    } catch { /* no samples dir */ }
    for (const sub of subdirs) {
      const fallbackRuleId = sub === "_shared" ? "" : sub;
      for (const f of await listJsonFiles(path.join(base, sub))) {
        const s = await readJson(path.join(base, sub, f));
        if (!s || typeof s.id !== "string") continue;
        const ruleId = typeof s.ruleId === "string" && s.ruleId ? s.ruleId : fallbackRuleId;
        ins.run(ruleId, s.id, JSON.stringify(s));
        counts.samples++;
      }
    }
  }

  return counts;
}
