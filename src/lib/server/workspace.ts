import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type {
  WorkspaceConfig,
  Rule,
  RuleSummary,
  RuleOnDisk,
  RuleTest,
  Sample,
  ReferenceSet,
  NodeDef,
  NodeBindings,
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

const SETTINGS_FILE = path.join(os.homedir(), ".ruleforge-editor.json");

export type AiProvider = "ollama" | "anthropic";

type AppSettings = {
  rootPath: string | null;
  recentRoots: string[];
  engineUrl?: string;
  engineCliPath?: string;
  documentForgeUrl?: string;
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
      engineCliPath: parsed.engineCliPath,
      documentForgeUrl: parsed.documentForgeUrl,
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
  const merged: AppSettings = { ...current, ...next };
  if (merged.rootPath) {
    const recent = (merged.recentRoots ?? []).filter((p) => p !== merged.rootPath);
    merged.recentRoots = [merged.rootPath, ...recent].slice(0, 10);
  }
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

const DIRS = ["rules", "nodes", "samples", "refs", "templates", "assets", "schemas"];

export async function seedWorkspace(rootPath: string, name?: string): Promise<WorkspaceConfig> {
  await fs.mkdir(rootPath, { recursive: true });
  for (const dir of DIRS) {
    await fs.mkdir(path.join(rootPath, dir), { recursive: true });
  }
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

function safeName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

// =====================================================================
// Rules — folder-per-rule layout
//   /rules/[id]/rule.json
//   /rules/[id]/schema/{input,output,context}.json
//   /rules/[id]/bindings/[instanceId].json
//   /rules/[id]/tests/*.json
// =====================================================================

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

/**
 * List rules as lightweight summaries — for list pages and dropdowns.
 *
 * Two on-disk layouts are supported, in priority order:
 *   1. FLAT (preferred):       rules/<id>.json   — single document per rule
 *   2. DIRECTORY (legacy):     rules/<id>/rule.json + sibling sub-files
 *
 * Layout 1 is the canonical going-forward shape: matches the `Rule` in-memory
 * type, matches `/api/export`, maps cleanly to one document per rule in any
 * document store. Layout 2 is preserved for backward compat — old workspaces
 * continue to work without a migration. The directory layout is "upgraded" on
 * the next writeRule (which always writes flat going forward).
 *
 * A flat file shadows the directory of the same id — if both exist, flat
 * wins. This makes the migration script safe: write the flat file, leave the
 * directory in place as a backup, optionally delete later.
 */
export async function listRules(rootPath: string): Promise<RuleSummary[]> {
  const dir = path.join(rootPath, "rules");
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const summaries = new Map<string, RuleSummary>();

  // Pass 1 — flat .json files. These win over directories of the same id.
  for (const entry of entries) {
    if (entry.startsWith(".") || entry.startsWith("_")) continue;
    if (!entry.endsWith(".json")) continue;
    if (entry.endsWith(".engine.json")) continue; // engine-shape sibling, not a rule
    const filePath = path.join(dir, entry);
    const rule = await readJsonSafe<Rule>(filePath);
    if (!rule?.id) continue;
    summaries.set(rule.id, toRuleSummary(rule));
  }

  // Pass 2 — legacy directory layout. Only include if no flat shadow exists.
  for (const entry of entries) {
    if (entry.startsWith(".") || entry.startsWith("_")) continue;
    if (entry.endsWith(".json")) continue;
    const ruleDir = path.join(dir, entry);
    if (!(await isDirectory(ruleDir))) continue;
    const rule = await readJsonSafe<RuleOnDisk>(path.join(ruleDir, "rule.json"));
    if (!rule?.id) continue;
    if (summaries.has(rule.id)) continue; // shadowed by flat
    summaries.set(rule.id, toRuleSummary(rule));
  }

  return Array.from(summaries.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function toRuleSummary(rule: { id: string; name: string; description?: string; endpoint: string; method: HttpMethodKind; status: RuleStatus; currentVersion: number; tags?: string[]; category?: string; updatedAt: string; updatedBy?: string }): RuleSummary {
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

/**
 * Read a single rule and assemble its full in-memory shape.
 *
 * Two layouts supported:
 *   • FLAT (preferred):   rules/<id>.json carries the entire Rule object
 *                         (schemas, bindings, tests all embedded).
 *   • DIRECTORY (legacy): rules/<id>/rule.json + bindings/, tests/, schema/
 *                         sibling sub-files. Older workspaces use this; we
 *                         continue to read it until the next writeRule
 *                         upgrades the storage.
 *
 * In both cases, when a SchemaTemplate ref is set we resolve from
 * /schemas/<ref>.json and let the resolved schema win over any inline value.
 * This is what makes shared schemas fan-out on edit.
 */
export async function readRule(rootPath: string, id: string): Promise<Rule | null> {
  // Resolve schema refs once we have a candidate rule from either layout.
  async function resolveSchemas(
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

  // ── FLAT: rules/<id>.json ──────────────────────────────────────────
  const flatPath = path.join(rootPath, "rules", `${safeName(id)}.json`);
  const flat = await readJsonSafe<Rule>(flatPath);
  if (flat?.id) {
    const { inputSchema, outputSchema, contextSchema } = await resolveSchemas(
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

  // ── DIRECTORY (legacy): rules/<id>/... ─────────────────────────────
  const ruleDir = path.join(rootPath, "rules", safeName(id));
  if (!(await isDirectory(ruleDir))) return null;

  const onDisk = await readJsonSafe<RuleOnDisk>(path.join(ruleDir, "rule.json"));
  if (!onDisk) return null;

  const localInput = (await readJsonSafe<JsonSchema>(path.join(ruleDir, "schema", "input.json"))) ?? undefined;
  const localOutput = (await readJsonSafe<JsonSchema>(path.join(ruleDir, "schema", "output.json"))) ?? undefined;
  const localContext = (await readJsonSafe<JsonSchema>(path.join(ruleDir, "schema", "context.json"))) ?? undefined;

  const { inputSchema, outputSchema, contextSchema } = await resolveSchemas(
    { input: localInput, output: localOutput, context: localContext },
    { inputSchemaRef: onDisk.inputSchemaRef, outputSchemaRef: onDisk.outputSchemaRef, contextSchemaRef: onDisk.contextSchemaRef },
  );

  const bindingsDir = path.join(ruleDir, "bindings");
  const bindings: Record<string, NodeBindings> = {};
  try {
    const bindingFiles = (await fs.readdir(bindingsDir)).filter((f) => f.endsWith(".json"));
    for (const f of bindingFiles) {
      const b = await readJsonSafe<NodeBindings>(path.join(bindingsDir, f));
      if (b?.instanceId) bindings[b.instanceId] = b;
    }
  } catch { /* no bindings folder */ }

  const testsDir = path.join(ruleDir, "tests");
  const tests: RuleTest[] = [];
  try {
    const testFiles = (await fs.readdir(testsDir)).filter((f) => f.endsWith(".json"));
    for (const f of testFiles) {
      const t = await readJsonSafe<RuleTest>(path.join(testsDir, f));
      if (t?.id) tests.push(t);
    }
  } catch { /* no tests folder */ }
  tests.sort((a, b) => a.id.localeCompare(b.id));

  return {
    ...onDisk,
    inputSchema,
    outputSchema,
    contextSchema,
    bindings,
    tests,
  };
}

/**
 * Write a rule as a single flat document — `rules/<id>.json`.
 *
 * One file = one document = one row in any document store. Matches the
 * `Rule` in-memory shape, `/api/export` output, and what `/api/rules/<id>`
 * returns. No directory, no sibling sub-files, no fan-out.
 *
 * If a legacy directory exists for this id, we delete it AFTER successfully
 * writing the flat file — upgrade-on-save with no manual migration step.
 *
 * Engine-shape compilation still happens on every test invocation (see
 * `stageEngineFixtures` in `/api/test/route.ts`); we no longer emit a
 * `rule.engine.json` sibling on save because the staging step rebuilds it
 * each time anyway.
 */
export async function writeRule(rootPath: string, rule: Rule): Promise<string> {
  const rulesDir = path.join(rootPath, "rules");
  await fs.mkdir(rulesDir, { recursive: true });
  const flatPath = path.join(rulesDir, `${safeName(rule.id)}.json`);

  const stamp = new Date().toISOString();
  const flatRule: Rule = { ...rule, updatedAt: stamp };

  // Inputs/outputs/context are embedded literally. If the rule references a
  // shared SchemaTemplate, the editor has already populated rule.inputSchema
  // with the resolved schema (via readRule), so writing it back is a faithful
  // snapshot — and readRule will re-resolve from the template on next load
  // if the template has since been edited.
  await fs.writeFile(flatPath, JSON.stringify(flatRule, null, 2), "utf-8");

  // Clean up the legacy directory layout if it exists for this id — upgrade
  // on save. Safe because the flat file now has everything the directory
  // had. If users have hand-edited content in the directory, they'd have
  // lost it on next save under the old layout too.
  const legacyDir = path.join(rulesDir, safeName(rule.id));
  try {
    const st = await fs.stat(legacyDir);
    if (st.isDirectory()) {
      await fs.rm(legacyDir, { recursive: true, force: true });
    }
  } catch {
    // No legacy dir — nothing to clean.
  }

  return flatPath;
}

/** Delete a rule — removes the flat file AND the legacy directory if present. */
export async function deleteRule(rootPath: string, id: string): Promise<void> {
  const flatPath = path.join(rootPath, "rules", `${safeName(id)}.json`);
  await fs.unlink(flatPath).catch(() => {});
  const legacyDir = path.join(rootPath, "rules", safeName(id));
  await fs.rm(legacyDir, { recursive: true, force: true }).catch(() => {});
}

/** Read just the input schema for a rule — used for cross-rule schema-aware features (test page picker). */
export async function readRuleInputSchema(rootPath: string, ruleId: string): Promise<JsonSchema | null> {
  // Try flat file first
  const flatPath = path.join(rootPath, "rules", `${safeName(ruleId)}.json`);
  const flat = await readJsonSafe<Rule>(flatPath);
  if (flat) {
    if (flat.inputSchemaRef) {
      const tpl = await readSchemaTemplate(rootPath, flat.inputSchemaRef);
      if (tpl) return tpl.schema;
    }
    return flat.inputSchema ?? null;
  }
  // Fall back to legacy directory
  return readJsonSafe<JsonSchema>(path.join(rootPath, "rules", safeName(ruleId), "schema", "input.json"));
}

// =====================================================================
// Per-rule tests (subfolder of a rule)
// =====================================================================

export async function readRuleTest(rootPath: string, ruleId: string, testId: string): Promise<RuleTest | null> {
  return readJsonSafe<RuleTest>(path.join(rootPath, "rules", safeName(ruleId), "tests", `${safeName(testId)}.json`));
}

export async function writeRuleTest(rootPath: string, ruleId: string, test: RuleTest): Promise<void> {
  const dir = path.join(rootPath, "rules", safeName(ruleId), "tests");
  await fs.mkdir(dir, { recursive: true });
  const next: RuleTest = { ...test, updatedAt: new Date().toISOString() };
  await fs.writeFile(path.join(dir, `${safeName(test.id)}.json`), JSON.stringify(next, null, 2), "utf-8");
}

export async function deleteRuleTest(rootPath: string, ruleId: string, testId: string): Promise<void> {
  await fs.unlink(path.join(rootPath, "rules", safeName(ruleId), "tests", `${safeName(testId)}.json`)).catch(() => {});
}

// =====================================================================
// Global node library (/nodes/)
// =====================================================================

export async function listNodeDefs(rootPath: string): Promise<NodeDef[]> {
  const dir = path.join(rootPath, "nodes");
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    const out: NodeDef[] = [];
    for (const f of files) {
      const n = await readJsonSafe<NodeDef>(path.join(dir, f));
      if (n?.id) out.push(n);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function readNodeDef(rootPath: string, id: string): Promise<NodeDef | null> {
  return readJsonSafe<NodeDef>(path.join(rootPath, "nodes", `${safeName(id)}.json`));
}

export async function writeNodeDef(rootPath: string, node: NodeDef): Promise<void> {
  const dir = path.join(rootPath, "nodes");
  await fs.mkdir(dir, { recursive: true });
  const next: NodeDef = { ...node, updatedAt: new Date().toISOString() };
  await fs.writeFile(path.join(dir, `${safeName(node.id)}.json`), JSON.stringify(next, null, 2), "utf-8");
}

export async function deleteNodeDef(rootPath: string, id: string): Promise<void> {
  await fs.unlink(path.join(rootPath, "nodes", `${safeName(id)}.json`)).catch(() => {});
}

export async function listSamples(rootPath: string, ruleId?: string | null): Promise<Sample[]> {
  const dir = ruleId ? path.join(rootPath, "samples", safeName(ruleId)) : path.join(rootPath, "samples", "_shared");
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    const samples: Sample[] = [];
    for (const f of files) {
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf-8");
        samples.push(JSON.parse(raw) as Sample);
      } catch {
        // skip
      }
    }
    return samples.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function writeSample(rootPath: string, sample: Sample): Promise<void> {
  const folder = sample.ruleId ? safeName(sample.ruleId) : "_shared";
  const dir = path.join(rootPath, "samples", folder);
  await fs.mkdir(dir, { recursive: true });
  const next: Sample = { ...sample, updatedAt: new Date().toISOString() };
  await fs.writeFile(path.join(dir, `${safeName(sample.id)}.json`), JSON.stringify(next, null, 2), "utf-8");
}

export async function deleteSample(rootPath: string, ruleId: string | null, id: string): Promise<void> {
  const folder = ruleId ? safeName(ruleId) : "_shared";
  const filePath = path.join(rootPath, "samples", folder, `${safeName(id)}.json`);
  await fs.unlink(filePath).catch(() => {});
}

// =====================================================================
// References (lookup tables) — global
// =====================================================================

export async function listReferences(rootPath: string): Promise<ReferenceSet[]> {
  const dir = path.join(rootPath, "refs");
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    const out: ReferenceSet[] = [];
    for (const f of files) {
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf-8");
        out.push(JSON.parse(raw) as ReferenceSet);
      } catch {
        // skip
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function readReference(rootPath: string, id: string): Promise<ReferenceSet | null> {
  const filePath = path.join(rootPath, "refs", `${safeName(id)}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as ReferenceSet;
  } catch {
    return null;
  }
}

export async function writeReference(rootPath: string, ref: ReferenceSet): Promise<void> {
  const dir = path.join(rootPath, "refs");
  await fs.mkdir(dir, { recursive: true });
  const next: ReferenceSet = { ...ref, updatedAt: new Date().toISOString() };
  await fs.writeFile(path.join(dir, `${safeName(ref.id)}.json`), JSON.stringify(next, null, 2), "utf-8");
}

export async function deleteReference(rootPath: string, id: string): Promise<void> {
  const filePath = path.join(rootPath, "refs", `${safeName(id)}.json`);
  await fs.unlink(filePath).catch(() => {});
}

// ----- Output templates -------------------------------------------------

export async function listTemplates(rootPath: string): Promise<OutputTemplateSummary[]> {
  const dir = path.join(rootPath, "templates");
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    const out: OutputTemplateSummary[] = [];
    for (const f of files) {
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf-8");
        const t = JSON.parse(raw) as OutputTemplate;
        out.push({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          updatedAt: t.updatedAt,
          fieldCount: (t.fields ?? []).length,
        });
      } catch {
        // skip invalid template
      }
    }
    return out.sort((a, b) => {
      const c = (a.category ?? "").localeCompare(b.category ?? "");
      return c !== 0 ? c : a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

export async function readTemplate(rootPath: string, id: string): Promise<OutputTemplate | null> {
  const filePath = path.join(rootPath, "templates", `${safeName(id)}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as OutputTemplate;
  } catch {
    return null;
  }
}

export async function listTemplatesFull(rootPath: string): Promise<OutputTemplate[]> {
  const dir = path.join(rootPath, "templates");
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    const out: OutputTemplate[] = [];
    for (const f of files) {
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf-8");
        out.push(JSON.parse(raw) as OutputTemplate);
      } catch {
        // skip
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function writeTemplate(rootPath: string, tpl: OutputTemplate): Promise<void> {
  const dir = path.join(rootPath, "templates");
  await fs.mkdir(dir, { recursive: true });
  const next: OutputTemplate = { ...tpl, updatedAt: new Date().toISOString() };
  await fs.writeFile(
    path.join(dir, `${safeName(tpl.id)}.json`),
    JSON.stringify(next, null, 2),
    "utf-8",
  );
}

export async function deleteTemplate(rootPath: string, id: string): Promise<void> {
  const filePath = path.join(rootPath, "templates", `${safeName(id)}.json`);
  await fs.unlink(filePath).catch(() => {});
}

// ----- Schema templates (shared input/output/context shapes) -------------
//
// Stored at /schemas/<id>.json. Rules reference them via inputSchemaRef /
// outputSchemaRef / contextSchemaRef. The editor resolves on load; engine
// staging inlines the resolved schema before invoking dotnet (so the engine
// itself is unaware of the indirection).

export async function readSchemaTemplate(rootPath: string, id: string): Promise<SchemaTemplate | null> {
  const filePath = path.join(rootPath, "schemas", `${safeName(id)}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as SchemaTemplate;
  } catch {
    return null;
  }
}

export async function listSchemaTemplatesFull(rootPath: string): Promise<SchemaTemplate[]> {
  const dir = path.join(rootPath, "schemas");
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    const out: SchemaTemplate[] = [];
    for (const f of files) {
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf-8");
        out.push(JSON.parse(raw) as SchemaTemplate);
      } catch {
        // skip invalid
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/**
 * Listing summary — includes a `refCount` of how many rules currently reference
 * the template. Lazily resolved by walking /rules/<id>/rule.json files.
 */
export async function listSchemaTemplates(rootPath: string): Promise<SchemaTemplateSummary[]> {
  const full = await listSchemaTemplatesFull(rootPath);
  const refCounts = await countSchemaTemplateReferences(rootPath);
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
  const dir = path.join(rootPath, "schemas");
  await fs.mkdir(dir, { recursive: true });
  const next: SchemaTemplate = { ...tpl, updatedAt: new Date().toISOString() };
  await fs.writeFile(
    path.join(dir, `${safeName(tpl.id)}.json`),
    JSON.stringify(next, null, 2),
    "utf-8",
  );
}

export async function deleteSchemaTemplate(rootPath: string, id: string): Promise<void> {
  const filePath = path.join(rootPath, "schemas", `${safeName(id)}.json`);
  await fs.unlink(filePath).catch(() => {});
}

/**
 * Walk every rule.json on disk and tally how many rules reference each
 * schema-template id (via inputSchemaRef / outputSchemaRef / contextSchemaRef).
 * Used by the listing page to show "used by N rules" on each template.
 */
async function countSchemaTemplateReferences(rootPath: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const rulesDir = path.join(rootPath, "rules");
  try {
    const entries = await fs.readdir(rulesDir, { withFileTypes: true });
    const counted = new Set<string>(); // rule ids we've already tallied (flat shadows directory)

    // Pass 1 — flat rules/<id>.json
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".json") || e.name.endsWith(".engine.json")) continue;
      try {
        const raw = await fs.readFile(path.join(rulesDir, e.name), "utf-8");
        const data = JSON.parse(raw) as { id?: string; inputSchemaRef?: string; outputSchemaRef?: string; contextSchemaRef?: string };
        if (data.id) counted.add(data.id);
        for (const ref of [data.inputSchemaRef, data.outputSchemaRef, data.contextSchemaRef]) {
          if (typeof ref === "string" && ref.length > 0) {
            counts.set(ref, (counts.get(ref) ?? 0) + 1);
          }
        }
      } catch {
        // skip
      }
    }

    // Pass 2 — legacy directory layout (only count if not already shadowed)
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      try {
        const raw = await fs.readFile(path.join(rulesDir, e.name, "rule.json"), "utf-8");
        const data = JSON.parse(raw) as { id?: string; inputSchemaRef?: string; outputSchemaRef?: string; contextSchemaRef?: string };
        if (data.id && counted.has(data.id)) continue;
        for (const ref of [data.inputSchemaRef, data.outputSchemaRef, data.contextSchemaRef]) {
          if (typeof ref === "string" && ref.length > 0) {
            counts.set(ref, (counts.get(ref) ?? 0) + 1);
          }
        }
      } catch {
        // skip
      }
    }
  } catch {
    // no rules dir → no refs
  }
  return counts;
}

// ----- Assets (template instances) --------------------------------------

export async function listAssets(rootPath: string, templateId?: string): Promise<AssetSummary[]> {
  const dir = path.join(rootPath, "assets");
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    const out: AssetSummary[] = [];
    for (const f of files) {
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf-8");
        const a = JSON.parse(raw) as Asset;
        if (templateId && a.templateId !== templateId) continue;
        out.push({
          id: a.id,
          templateId: a.templateId,
          name: a.name,
          description: a.description,
          category: a.category,
          updatedAt: a.updatedAt,
        });
      } catch {
        // skip invalid
      }
    }
    return out.sort((a, b) => {
      // Sort by template, then category, then name
      const t = a.templateId.localeCompare(b.templateId);
      if (t !== 0) return t;
      const c = (a.category ?? "").localeCompare(b.category ?? "");
      if (c !== 0) return c;
      return (a.name ?? a.id).localeCompare(b.name ?? b.id);
    });
  } catch {
    return [];
  }
}

export async function listAssetsFull(rootPath: string, templateId?: string): Promise<Asset[]> {
  const dir = path.join(rootPath, "assets");
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    const out: Asset[] = [];
    for (const f of files) {
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf-8");
        const a = JSON.parse(raw) as Asset;
        if (templateId && a.templateId !== templateId) continue;
        out.push(a);
      } catch {
        // skip
      }
    }
    return out.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
  } catch {
    return [];
  }
}

export async function readAsset(rootPath: string, id: string): Promise<Asset | null> {
  const filePath = path.join(rootPath, "assets", `${safeName(id)}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as Asset;
  } catch {
    return null;
  }
}

export async function writeAsset(rootPath: string, asset: Asset): Promise<void> {
  const dir = path.join(rootPath, "assets");
  await fs.mkdir(dir, { recursive: true });
  const next: Asset = { ...asset, updatedAt: new Date().toISOString() };
  await fs.writeFile(
    path.join(dir, `${safeName(asset.id)}.json`),
    JSON.stringify(next, null, 2),
    "utf-8",
  );
}

export async function deleteAsset(rootPath: string, id: string): Promise<void> {
  const filePath = path.join(rootPath, "assets", `${safeName(id)}.json`);
  await fs.unlink(filePath).catch(() => {});
}

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
