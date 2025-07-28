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

const DIRS = ["rules", "nodes", "samples", "refs", "templates", "assets"];

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

/** List rules as lightweight summaries — for list pages and dropdowns. */
export async function listRules(rootPath: string): Promise<RuleSummary[]> {
  const dir = path.join(rootPath, "rules");
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const summaries: RuleSummary[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".") || entry.startsWith("_")) continue;
    const ruleDir = path.join(dir, entry);
    if (!(await isDirectory(ruleDir))) continue;
    const rule = await readJsonSafe<RuleOnDisk>(path.join(ruleDir, "rule.json"));
    if (!rule) continue;
    summaries.push({
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
    });
  }
  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

/** Read a single rule and assemble its full in-memory shape. */
export async function readRule(rootPath: string, id: string): Promise<Rule | null> {
  const ruleDir = path.join(rootPath, "rules", safeName(id));
  if (!(await isDirectory(ruleDir))) return null;

  const onDisk = await readJsonSafe<RuleOnDisk>(path.join(ruleDir, "rule.json"));
  if (!onDisk) return null;

  const inputSchema = (await readJsonSafe<JsonSchema>(path.join(ruleDir, "schema", "input.json"))) ?? { type: "object" };
  const outputSchema = (await readJsonSafe<JsonSchema>(path.join(ruleDir, "schema", "output.json"))) ?? { type: "object" };
  const contextSchema = (await readJsonSafe<JsonSchema>(path.join(ruleDir, "schema", "context.json"))) ?? undefined;

  const bindingsDir = path.join(ruleDir, "bindings");
  const bindings: Record<string, NodeBindings> = {};
  try {
    const bindingFiles = (await fs.readdir(bindingsDir)).filter((f) => f.endsWith(".json"));
    for (const f of bindingFiles) {
      const b = await readJsonSafe<NodeBindings>(path.join(bindingsDir, f));
      if (b?.instanceId) bindings[b.instanceId] = b;
    }
  } catch {
    // no bindings folder — ok for rules with only terminal nodes
  }

  const testsDir = path.join(ruleDir, "tests");
  const tests: RuleTest[] = [];
  try {
    const testFiles = (await fs.readdir(testsDir)).filter((f) => f.endsWith(".json"));
    for (const f of testFiles) {
      const t = await readJsonSafe<RuleTest>(path.join(testsDir, f));
      if (t?.id) tests.push(t);
    }
  } catch {
    // no tests folder — ok
  }
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

/** Write a rule by decomposing the in-memory shape into the folder layout. */
export async function writeRule(rootPath: string, rule: Rule): Promise<string> {
  const ruleDir = path.join(rootPath, "rules", safeName(rule.id));
  await fs.mkdir(path.join(ruleDir, "schema"), { recursive: true });
  await fs.mkdir(path.join(ruleDir, "bindings"), { recursive: true });
  await fs.mkdir(path.join(ruleDir, "tests"), { recursive: true });

  const stamp = new Date().toISOString();
  const onDisk: RuleOnDisk = {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    endpoint: rule.endpoint,
    method: rule.method,
    status: rule.status,
    currentVersion: rule.currentVersion,
    tags: rule.tags,
    category: rule.category,
    projectId: rule.projectId,
    instances: rule.instances,
    edges: rule.edges,
    updatedAt: stamp,
    updatedBy: rule.updatedBy,
  };
  await fs.writeFile(path.join(ruleDir, "rule.json"), JSON.stringify(onDisk, null, 2), "utf-8");

  // Engine-shaped sibling — best-effort. The editor's rule.json is the
  // source of truth for authoring; rule.engine.json is what the engine
  // host actually reads. Compile failures are logged but don't block save
  // (the rule may have incomplete bindings during authoring).
  try {
    const { compileRuleForEngine } = await import("@/lib/rule/compile-to-engine");
    const [nodeDefs, refs, templates, assets] = await Promise.all([
      listNodeDefs(rootPath),
      listReferences(rootPath),
      listTemplatesFull(rootPath),
      listAssetsFull(rootPath),
    ]);
    const engineRule = compileRuleForEngine(rule, nodeDefs, { refs, templates, assets });
    await fs.writeFile(
      path.join(ruleDir, "rule.engine.json"),
      JSON.stringify(engineRule, null, 2),
      "utf-8",
    );
  } catch (err) {
    // Don't block save; surface error to the API caller via the response.
    // (Caller writes a `compileWarnings` field; for now just log.)
    // eslint-disable-next-line no-console
    console.warn(`[workspace] compile-to-engine failed for rule ${rule.id}:`, (err as Error).message);
  }

  // Schemas
  await fs.writeFile(path.join(ruleDir, "schema", "input.json"), JSON.stringify(rule.inputSchema, null, 2), "utf-8");
  await fs.writeFile(path.join(ruleDir, "schema", "output.json"), JSON.stringify(rule.outputSchema, null, 2), "utf-8");
  if (rule.contextSchema) {
    await fs.writeFile(path.join(ruleDir, "schema", "context.json"), JSON.stringify(rule.contextSchema, null, 2), "utf-8");
  }

  // Bindings — overwrite the folder: write current set, delete files for vanished instances
  const liveInstanceIds = new Set(rule.instances.map((i) => i.instanceId));
  const existingBindings = await fs.readdir(path.join(ruleDir, "bindings")).catch(() => [] as string[]);
  for (const existing of existingBindings) {
    const baseId = existing.replace(/\.json$/, "");
    if (!liveInstanceIds.has(baseId) && !rule.bindings[baseId]) {
      await fs.unlink(path.join(ruleDir, "bindings", existing)).catch(() => {});
    }
  }
  for (const [instanceId, b] of Object.entries(rule.bindings)) {
    await fs.writeFile(path.join(ruleDir, "bindings", `${safeName(instanceId)}.json`), JSON.stringify(b, null, 2), "utf-8");
  }

  // Tests — overwrite: write current set, delete files for vanished tests
  const liveTestIds = new Set(rule.tests.map((t) => t.id));
  const existingTests = await fs.readdir(path.join(ruleDir, "tests")).catch(() => [] as string[]);
  for (const existing of existingTests) {
    const baseId = existing.replace(/\.json$/, "");
    if (!liveTestIds.has(baseId) && !rule.tests.find((t) => safeName(t.id) === baseId)) {
      await fs.unlink(path.join(ruleDir, "tests", existing)).catch(() => {});
    }
  }
  for (const t of rule.tests) {
    await fs.writeFile(path.join(ruleDir, "tests", `${safeName(t.id)}.json`), JSON.stringify(t, null, 2), "utf-8");
  }

  return ruleDir;
}

/** Delete a rule — removes the entire /rules/[id]/ folder. */
export async function deleteRule(rootPath: string, id: string): Promise<void> {
  const ruleDir = path.join(rootPath, "rules", safeName(id));
  await fs.rm(ruleDir, { recursive: true, force: true }).catch(() => {});
}

/** Read just the input schema for a rule — used for cross-rule schema-aware features (test page picker). */
export async function readRuleInputSchema(rootPath: string, ruleId: string): Promise<JsonSchema | null> {
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
