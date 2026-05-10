import { NextResponse, type NextRequest } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  getActiveRoot,
  readSettings,
  readRule,
  listRules,
  listNodeDefs,
  listReferences,
  listTemplatesFull,
  listAssetsFull,
} from "@/lib/server/workspace";
import { compileRuleForEngine, CompileError } from "@/lib/rule/compile-to-engine";

type Body = {
  ruleId: string;
  payload: unknown;
};

/**
 * Stage all editor-authored rules into the flat fixture layout the engine's
 * `LocalFileRuleSource` expects:
 *
 *   <root>/.engine-staging/_endpoint-bindings.json    "POST /ep" → "ruleId@N"
 *   <root>/.engine-staging/<ruleId>.v<N>.json          engine-shaped rule
 *
 * The engine resolves refs at `<fixtures>/../refs`, which falls into
 * `<root>/refs/` — already where the editor keeps them. No symlink needed.
 *
 * Compile every rule on every test invocation. Cheap (a dozen JSON walks)
 * and avoids stale staged rules surviving a code-only edit.
 */
async function stageEngineFixtures(root: string): Promise<{
  fixturesDir: string;
  errors: { ruleId: string; detail: string }[];
}> {
  const fixturesDir = path.join(root, ".engine-staging");
  await fs.mkdir(fixturesDir, { recursive: true });

  // Wipe stale .json files from a previous run — keeps the dir tidy and
  // ensures a deleted editor rule doesn't keep serving from staging.
  const existing = await fs.readdir(fixturesDir).catch(() => [] as string[]);
  for (const f of existing) {
    if (f.endsWith(".json")) {
      await fs.unlink(path.join(fixturesDir, f)).catch(() => {});
    }
  }

  const [summaries, nodeDefs, refs, templates, assets] = await Promise.all([
    listRules(root),
    listNodeDefs(root),
    listReferences(root),
    listTemplatesFull(root),
    listAssetsFull(root),
  ]);

  const bindings: Record<string, string> = {};
  const errors: { ruleId: string; detail: string }[] = [];

  for (const summary of summaries) {
    const rule = await readRule(root, summary.id);
    if (!rule) continue;
    try {
      const engineRule = compileRuleForEngine(rule, nodeDefs, { refs, templates, assets });
      const fileName = `${summary.id}.v${rule.currentVersion}.json`;
      await fs.writeFile(
        path.join(fixturesDir, fileName),
        JSON.stringify(engineRule, null, 2),
        "utf-8",
      );
      // Engine binding key: "<METHOD> <endpoint>"
      const method = (rule.method ?? "POST").toUpperCase();
      bindings[`${method} ${rule.endpoint}`] = `${summary.id}@${rule.currentVersion}`;
    } catch (err) {
      const detail =
        err instanceof CompileError
          ? `${err.instanceId}${err.portName ? `.${err.portName}` : ""}: ${err.message}`
          : (err as Error).message;
      errors.push({ ruleId: summary.id, detail });
    }
  }

  await fs.writeFile(
    path.join(fixturesDir, "_endpoint-bindings.json"),
    JSON.stringify(bindings, null, 2),
    "utf-8",
  );

  return { fixturesDir, errors };
}

export async function POST(req: NextRequest) {
  const root = await getActiveRoot();
  const settings = await readSettings();
  if (!root) return NextResponse.json({ error: "No workspace configured" }, { status: 409 });
  if (!settings.engineCliPath) {
    return NextResponse.json(
      { error: "Engine CLI path not configured. Set it in Settings (path to the cloned ruleforge repo)." },
      { status: 409 },
    );
  }

  const body = (await req.json()) as Body;
  const rule = await readRule(root, body.ruleId);
  if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  const cliProject = path.join(settings.engineCliPath, "src", "RuleForge.Cli");
  try {
    await fs.access(cliProject);
  } catch {
    return NextResponse.json(
      { error: `RuleForge.Cli project not found at ${cliProject}. Check the engine CLI path.` },
      { status: 400 },
    );
  }

  // Bridge the editor's per-rule directory layout into the flat fixture
  // layout LocalFileRuleSource consumes. If THIS rule failed to compile,
  // surface that error rather than handing the engine a missing fixture
  // (which would just say "no rule bound to <endpoint>").
  const { fixturesDir, errors } = await stageEngineFixtures(root);
  const ruleCompileError = errors.find((e) => e.ruleId === body.ruleId);
  if (ruleCompileError) {
    return NextResponse.json(
      {
        error: "compile_failed",
        detail: ruleCompileError.detail,
        otherCompileErrors: errors.filter((e) => e.ruleId !== body.ruleId),
      },
      { status: 422 },
    );
  }

  const args = [
    "run",
    "--no-build",
    "--project",
    cliProject,
    "--",
    "run",
    "--endpoint",
    rule.endpoint,
    "--request",
    JSON.stringify(body.payload),
    "--fixtures",
    fixturesDir,
    "--debug",
  ];

  const result = await spawnDotnet(args, settings.engineCliPath);

  const envelope = extractJson(result.stdout);
  if (!envelope) {
    return NextResponse.json(
      {
        error: "Engine did not return a parseable envelope.",
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code,
        otherCompileErrors: errors,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ envelope, stderr: result.stderr, otherCompileErrors: errors });
}

async function spawnDotnet(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn("dotnet", args, { cwd, shell: false, env: process.env });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("error", (err) => {
      stderr += `\n[spawn error] ${err.message}`;
      resolve({ stdout, stderr, code: -1 });
    });
    proc.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

function extractJson(stdout: string): unknown | null {
  const objects = collectTopLevelObjects(stdout);
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (looksLikeEnvelope(obj)) return obj;
  }
  return objects.length > 0 ? objects[objects.length - 1] : null;
}

function collectTopLevelObjects(text: string): unknown[] {
  const out: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") { inString = true; continue; }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          out.push(JSON.parse(text.substring(start, i + 1)));
        } catch {
          // skip non-JSON braces
        }
        start = -1;
      }
    }
  }
  return out;
}

function looksLikeEnvelope(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return "decision" in o && "ruleId" in o;
}
