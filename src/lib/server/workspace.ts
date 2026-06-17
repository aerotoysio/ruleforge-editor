import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type {
  WorkspaceConfig,
  Rule,
  RuleSummary,
  RuleTest,
  Sample,
  ReferenceSet,
  NodeDef,
  JsonSchema,
  OutputTemplate,
  OutputTemplateSummary,
  Asset,
  AssetSummary,
  SchemaTemplate,
  SchemaTemplateSummary,
  HttpMethodKind,
  RuleStatus,
} from "@/lib/types";
import { getDb } from "./db";

// ─────────────────────────────────────────────────────────────────────────────
// Persistence layer. Workspace DATA lives in a shared SQLite `workspace.db`
// (see ./db.ts) that the engine also reads. Two things stay as files:
//   • machine settings + the Anthropic key → ~/.ruleforge-editor.json
//   • the workspace marker/config         → <root>/workspace.json
// Every function keeps its original signature so the API routes are unchanged.
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_FILE = path.join(os.homedir(), ".ruleforge-editor.json");

export type AiProvider = "ollama" | "anthropic";

type AppSettings = {
  rootPath: string | null;
  recentRoots: string[];
  engineUrl?: string;
  engineApiKey?: string;
  engineCliPath?: string;
  documentForgeUrl?: string;
  documentForgeDatabase?: string;
  aiProvider?: AiProvider;
  ollamaUrl?: string;
  ollamaModel?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
};

export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      rootPath: parsed.rootPath ?? null,
      recentRoots: parsed.recentRoots ?? [],
      engineUrl: parsed.engineUrl,
      engineApiKey: parsed.engineApiKey,
      engineCliPath: parsed.engineCliPath,
      documentForgeUrl: parsed.documentForgeUrl,
      documentForgeDatabase: parsed.documentForgeDatabase,
      aiProvider: parsed.aiProvider,
      ollamaUrl: parsed.ollamaUrl,
      ollamaModel: parsed.ollamaModel,
      anthropicApiKey: parsed.anthropicApiKey,
      anthropicModel: parsed.anthropicModel,
    };
  } catch {
    return { rootPath: null, recentRoots: [] };
  }
}

export async function writeSettings(next: Partial<AppSettings>): Promise<AppSettings> {
  const current = await readSettings();
  // Only overwrite keys explicitly provided: `undefined` means "leave as-is"
  // (so a partial update can't wipe unrelated fields like rootPath); pass `null`
  // to clear a field.
  const provided = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
  const merged: AppSettings = { ...current, ...(provided as Partial<AppSettings>) };
  if (merged.rootPath) {
    const recent = (merged.recentRoots ?? []).filter((p) => p !== merged.rootPath);
    merged.recentRoots = [merged.rootPath, ...recent].slice(0, 10);
  }
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

// ─── Workspace config (marker file <root>/workspace.json) ────────────────────

export async function seedWorkspace(rootPath: string, name?: string): Promise<WorkspaceConfig> {
  await fs.mkdir(rootPath, { recursive: true });
  getDb(rootPath); // create workspace.db + schema
  const config: WorkspaceConfig = {
    name: name ?? path.basename(rootPath),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    defaultMethod: "POST",
    defaultStatus: "draft",
  };
  const cfgPath = path.join(rootPath, "workspace.json");
  try {
    await fs.access(cfgPath);
  } catch {
    await fs.writeFile(cfgPath, JSON.stringify(config, null, 2), "utf-8");
  }
  return readWorkspaceConfig(rootPath);
}

export async function readWorkspaceConfig(rootPath: string): Promise<WorkspaceConfig> {
  const raw = await fs.readFile(path.join(rootPath, "workspace.json"), "utf-8");
  return JSON.parse(raw) as WorkspaceConfig;
}

export async function writeWorkspaceConfig(rootPath: string, config: WorkspaceConfig): Promise<void> {
  const next: WorkspaceConfig = { ...config, updatedAt: new Date().toISOString() };
  await fs.writeFile(path.join(rootPath, "workspace.json"), JSON.stringify(next, null, 2), "utf-8");
}

// ─── SQLite row helpers ──────────────────────────────────────────────────────

type Param = string | number | null;

function rowsJson<T>(rootPath: string, sql: string, ...params: Param[]): T[] {
  const rows = getDb(rootPath).prepare(sql).all(...params) as { json: string }[];
  return rows.map((r) => JSON.parse(r.json) as T);
}

function rowJson<T>(rootPath: string, sql: string, ...params: Param[]): T | null {
  const row = getDb(rootPath).prepare(sql).get(...params) as { json: string } | undefined;
  return row ? (JSON.parse(row.json) as T) : null;
}

function exec(rootPath: string, sql: string, ...params: Param[]): void {
  getDb(rootPath).prepare(sql).run(...params);
}

const stamp = () => new Date().toISOString();

// ─── Rules ───────────────────────────────────────────────────────────────────

function toRuleSummary(rule: {
  id: string; name: string; description?: string; endpoint: string; method: HttpMethodKind;
  status: RuleStatus; currentVersion: number; tags?: string[]; category?: string; updatedAt: string; updatedBy?: string;
}): RuleSummary {
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    endpoint: rule.endpoint,
    method: rule.method,
    status: rule.status,
    currentVersion: rule.currentVersion,
    tags: rule.tags,
    category: rule.category,
    updatedAt: rule.updatedAt,
    updatedBy: rule.updatedBy,
  };
}

export async function listRules(rootPath: string): Promise<RuleSummary[]> {
  const rules = rowsJson<Rule>(rootPath, "SELECT json FROM rules");
  return rules
    .filter((r) => r?.id)
    .map(toRuleSummary)
    .sort((a, b) => a.name.localeCompare(b.name));
}

type RuleWithRefs = Rule & { inputSchemaRef?: string; outputSchemaRef?: string; contextSchemaRef?: string };

async function resolveSchemas(
  rootPath: string,
  inline: { input?: JsonSchema; output?: JsonSchema; context?: JsonSchema },
  refs: { inputSchemaRef?: string; outputSchemaRef?: string; contextSchemaRef?: string },
): Promise<{ inputSchema: JsonSchema; outputSchema: JsonSchema; contextSchema?: JsonSchema }> {
  const inputSchema = refs.inputSchemaRef
    ? (await readSchemaTemplate(rootPath, refs.inputSchemaRef))?.schema ?? inline.input ?? { type: "object" }
    : inline.input ?? { type: "object" };
  const outputSchema = refs.outputSchemaRef
    ? (await readSchemaTemplate(rootPath, refs.outputSchemaRef))?.schema ?? inline.output ?? { type: "object" }
    : inline.output ?? { type: "object" };
  const contextSchema = refs.contextSchemaRef
    ? (await readSchemaTemplate(rootPath, refs.contextSchemaRef))?.schema ?? inline.context
    : inline.context;
  return { inputSchema, outputSchema, contextSchema };
}

export async function readRule(rootPath: string, id: string): Promise<Rule | null> {
  const flat = rowJson<RuleWithRefs>(rootPath, "SELECT json FROM rules WHERE id = ?", id);
  if (!flat?.id) return null;
  const { inputSchema, outputSchema, contextSchema } = await resolveSchemas(
    rootPath,
    { input: flat.inputSchema, output: flat.outputSchema, context: flat.contextSchema },
    { inputSchemaRef: flat.inputSchemaRef, outputSchemaRef: flat.outputSchemaRef, contextSchemaRef: flat.contextSchemaRef },
  );
  return {
    ...flat,
    inputSchema,
    outputSchema,
    contextSchema,
    bindings: flat.bindings ?? {},
    tests: Array.isArray(flat.tests) ? flat.tests : [],
  };
}

/** Persist a rule as one row. Returns the rule id (was a file path under the folder layout). */
export async function writeRule(rootPath: string, rule: Rule): Promise<string> {
  const next: Rule = { ...rule, updatedAt: stamp() };
  exec(rootPath, "INSERT OR REPLACE INTO rules (id, updated_at, json) VALUES (?, ?, ?)", rule.id, next.updatedAt, JSON.stringify(next));
  return rule.id;
}

export async function deleteRule(rootPath: string, id: string): Promise<void> {
  exec(rootPath, "DELETE FROM rules WHERE id = ?", id);
  exec(rootPath, "DELETE FROM compiled_rules WHERE id = ?", id);
}

export async function readRuleInputSchema(rootPath: string, ruleId: string): Promise<JsonSchema | null> {
  const rule = await readRule(rootPath, ruleId);
  return rule?.inputSchema ?? null;
}

// Per-rule tests live embedded in the rule document (flat layout).
export async function readRuleTest(rootPath: string, ruleId: string, testId: string): Promise<RuleTest | null> {
  const rule = await readRule(rootPath, ruleId);
  return rule?.tests?.find((t) => t.id === testId) ?? null;
}

export async function writeRuleTest(rootPath: string, ruleId: string, test: RuleTest): Promise<void> {
  const rule = await readRule(rootPath, ruleId);
  if (!rule) return;
  const tests = (rule.tests ?? []).filter((t) => t.id !== test.id);
  tests.push({ ...test, updatedAt: stamp() });
  await writeRule(rootPath, { ...rule, tests });
}

export async function deleteRuleTest(rootPath: string, ruleId: string, testId: string): Promise<void> {
  const rule = await readRule(rootPath, ruleId);
  if (!rule) return;
  await writeRule(rootPath, { ...rule, tests: (rule.tests ?? []).filter((t) => t.id !== testId) });
}

// ─── Node library ────────────────────────────────────────────────────────────

export async function listNodeDefs(rootPath: string): Promise<NodeDef[]> {
  return rowsJson<NodeDef>(rootPath, "SELECT json FROM nodes")
    .filter((n) => n?.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function readNodeDef(rootPath: string, id: string): Promise<NodeDef | null> {
  return rowJson<NodeDef>(rootPath, "SELECT json FROM nodes WHERE id = ?", id);
}

export async function writeNodeDef(rootPath: string, node: NodeDef): Promise<void> {
  const next: NodeDef = { ...node, updatedAt: stamp() };
  exec(rootPath, "INSERT OR REPLACE INTO nodes (id, json) VALUES (?, ?)", node.id, JSON.stringify(next));
}

export async function deleteNodeDef(rootPath: string, id: string): Promise<void> {
  exec(rootPath, "DELETE FROM nodes WHERE id = ?", id);
}

// ─── Samples (per-rule; rule_id '' = shared) ─────────────────────────────────

export async function listSamples(rootPath: string, ruleId?: string | null): Promise<Sample[]> {
  return rowsJson<Sample>(rootPath, "SELECT json FROM samples WHERE rule_id = ?", ruleId ?? "")
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function writeSample(rootPath: string, sample: Sample): Promise<void> {
  const next: Sample = { ...sample, updatedAt: stamp() };
  exec(rootPath, "INSERT OR REPLACE INTO samples (rule_id, id, json) VALUES (?, ?, ?)", sample.ruleId ?? "", sample.id, JSON.stringify(next));
}

export async function deleteSample(rootPath: string, ruleId: string | null, id: string): Promise<void> {
  exec(rootPath, "DELETE FROM samples WHERE rule_id = ? AND id = ?", ruleId ?? "", id);
}

// ─── References (lookup tables; shared with the engine) ──────────────────────

export async function listReferences(rootPath: string): Promise<ReferenceSet[]> {
  return rowsJson<ReferenceSet>(rootPath, "SELECT json FROM reference_sets")
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function readReference(rootPath: string, id: string): Promise<ReferenceSet | null> {
  return rowJson<ReferenceSet>(rootPath, "SELECT json FROM reference_sets WHERE id = ?", id);
}

export async function writeReference(rootPath: string, ref: ReferenceSet): Promise<void> {
  const next: ReferenceSet = { ...ref, updatedAt: stamp() };
  exec(
    rootPath,
    "INSERT OR REPLACE INTO reference_sets (id, name, version, json) VALUES (?, ?, ?, ?)",
    ref.id, ref.name ?? null, ref.currentVersion ?? 1, JSON.stringify(next),
  );
}

export async function deleteReference(rootPath: string, id: string): Promise<void> {
  exec(rootPath, "DELETE FROM reference_sets WHERE id = ?", id);
}

// ─── Output templates ────────────────────────────────────────────────────────

export async function listTemplates(rootPath: string): Promise<OutputTemplateSummary[]> {
  return rowsJson<OutputTemplate>(rootPath, "SELECT json FROM templates")
    .filter((t) => t?.id)
    .map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      updatedAt: t.updatedAt,
      fieldCount: (t.fields ?? []).length,
    }))
    .sort((a, b) => {
      const c = (a.category ?? "").localeCompare(b.category ?? "");
      return c !== 0 ? c : a.name.localeCompare(b.name);
    });
}

export async function readTemplate(rootPath: string, id: string): Promise<OutputTemplate | null> {
  return rowJson<OutputTemplate>(rootPath, "SELECT json FROM templates WHERE id = ?", id);
}

export async function listTemplatesFull(rootPath: string): Promise<OutputTemplate[]> {
  return rowsJson<OutputTemplate>(rootPath, "SELECT json FROM templates")
    .filter((t) => t?.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function writeTemplate(rootPath: string, tpl: OutputTemplate): Promise<void> {
  const next: OutputTemplate = { ...tpl, updatedAt: stamp() };
  exec(rootPath, "INSERT OR REPLACE INTO templates (id, json) VALUES (?, ?)", tpl.id, JSON.stringify(next));
}

export async function deleteTemplate(rootPath: string, id: string): Promise<void> {
  exec(rootPath, "DELETE FROM templates WHERE id = ?", id);
}

// ─── Schema templates (shared input/output/context shapes) ───────────────────

export async function readSchemaTemplate(rootPath: string, id: string): Promise<SchemaTemplate | null> {
  return rowJson<SchemaTemplate>(rootPath, "SELECT json FROM schema_templates WHERE id = ?", id);
}

export async function listSchemaTemplatesFull(rootPath: string): Promise<SchemaTemplate[]> {
  return rowsJson<SchemaTemplate>(rootPath, "SELECT json FROM schema_templates")
    .filter((t) => t?.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listSchemaTemplates(rootPath: string): Promise<SchemaTemplateSummary[]> {
  const full = await listSchemaTemplatesFull(rootPath);
  const refCounts = countSchemaTemplateReferences(rootPath);
  return full.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    intent: t.intent,
    updatedAt: t.updatedAt,
    fieldCount: Object.keys(t.schema?.properties ?? {}).length,
    refCount: refCounts.get(t.id) ?? 0,
  }));
}

export async function writeSchemaTemplate(rootPath: string, tpl: SchemaTemplate): Promise<void> {
  const next: SchemaTemplate = { ...tpl, updatedAt: stamp() };
  exec(rootPath, "INSERT OR REPLACE INTO schema_templates (id, json) VALUES (?, ?)", tpl.id, JSON.stringify(next));
}

export async function deleteSchemaTemplate(rootPath: string, id: string): Promise<void> {
  exec(rootPath, "DELETE FROM schema_templates WHERE id = ?", id);
}

/** Tally how many rules reference each schema-template id (input/output/context refs). */
function countSchemaTemplateReferences(rootPath: string): Map<string, number> {
  const counts = new Map<string, number>();
  const rules = rowsJson<{ inputSchemaRef?: string; outputSchemaRef?: string; contextSchemaRef?: string }>(
    rootPath, "SELECT json FROM rules",
  );
  for (const r of rules) {
    for (const ref of [r.inputSchemaRef, r.outputSchemaRef, r.contextSchemaRef]) {
      if (typeof ref === "string" && ref.length > 0) counts.set(ref, (counts.get(ref) ?? 0) + 1);
    }
  }
  return counts;
}

// ─── Assets (template instances) ─────────────────────────────────────────────

export async function listAssets(rootPath: string, templateId?: string): Promise<AssetSummary[]> {
  const rows = templateId
    ? rowsJson<Asset>(rootPath, "SELECT json FROM assets WHERE template_id = ?", templateId)
    : rowsJson<Asset>(rootPath, "SELECT json FROM assets");
  return rows
    .filter((a) => a?.id)
    .map((a) => ({ id: a.id, templateId: a.templateId, name: a.name, description: a.description, category: a.category, updatedAt: a.updatedAt }))
    .sort((a, b) => {
      const t = a.templateId.localeCompare(b.templateId);
      if (t !== 0) return t;
      const c = (a.category ?? "").localeCompare(b.category ?? "");
      if (c !== 0) return c;
      return (a.name ?? a.id).localeCompare(b.name ?? b.id);
    });
}

export async function listAssetsFull(rootPath: string, templateId?: string): Promise<Asset[]> {
  const rows = templateId
    ? rowsJson<Asset>(rootPath, "SELECT json FROM assets WHERE template_id = ?", templateId)
    : rowsJson<Asset>(rootPath, "SELECT json FROM assets");
  return rows.filter((a) => a?.id).sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
}

export async function readAsset(rootPath: string, id: string): Promise<Asset | null> {
  return rowJson<Asset>(rootPath, "SELECT json FROM assets WHERE id = ?", id);
}

export async function writeAsset(rootPath: string, asset: Asset): Promise<void> {
  const next: Asset = { ...asset, updatedAt: stamp() };
  exec(rootPath, "INSERT OR REPLACE INTO assets (id, template_id, json) VALUES (?, ?, ?)", asset.id, asset.templateId ?? null, JSON.stringify(next));
}

export async function deleteAsset(rootPath: string, id: string): Promise<void> {
  exec(rootPath, "DELETE FROM assets WHERE id = ?", id);
}

// ─── Workspace existence / active root ───────────────────────────────────────

export async function workspaceExists(rootPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(rootPath, "workspace.json"));
    return true;
  } catch {
    return false;
  }
}

export async function getActiveRoot(): Promise<string | null> {
  const settings = await readSettings();
  if (!settings.rootPath) return null;
  if (await workspaceExists(settings.rootPath)) return settings.rootPath;
  return null;
}
