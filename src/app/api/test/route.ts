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

  const body = (await req.json()) as Body;
  const rule = await readRule(root, body.ruleId);
  if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  // Two execution modes, picked automatically. HTTP mode is roughly 25× faster
  // because the engine stays warm — no dotnet JIT, no fixture re-load, just
  // loopback HTTP + microsecond NCalc eval. Falls back to CLI when no HTTP
  // engine is reachable.
  //
  //   HTTP  — `engineUrl` set in Settings AND the engine is reachable.
  //           Typical round-trip ≈ 3–8ms.
  //   CLI   — spawn `dotnet run` against `engineCliPath`. Typical 80–150ms
  //           (dotnet startup) regardless of how trivial the rule is.
  //
  // Compile-to-engine + stage-fixtures still runs on every CLI invocation
  // because that's what the engine reads from disk. HTTP mode skips staging
  // (the running engine watches its fixtures dir itself if started with
  // `--watch`, OR consumes the same fixtures the editor stages — we still
  // stage them as a safety net).
  const wantHttp = !!settings.engineUrl;
  const tStart = Date.now();

  // Always stage so that BOTH modes have fresh engine-shaped JSON on disk —
  // HTTP engines started with `--fixtures <staging>` will see the new rule
  // when they re-read fixtures (either auto-watched or on-startup).
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
  const tStaged = Date.now();

  if (wantHttp) {
    // ── HTTP path ────────────────────────────────────────────────────────
    const httpResult = await callEngineHttp(settings.engineUrl!, rule.method, rule.endpoint, body.payload);
    const tEnd = Date.now();

    if (httpResult.kind === "ok") {
      return NextResponse.json({
        envelope: httpResult.envelope,
        stderr: null,
        otherCompileErrors: errors,
        timing: {
          mode: "http",
          totalMs: tEnd - tStart,
          stageMs: tStaged - tStart,
          engineMs: tEnd - tStaged,
        },
      });
    }
    // HTTP mode failed — only fall back to CLI if engineCliPath is configured.
    // Otherwise surface the HTTP error directly so the user can fix it.
    if (!settings.engineCliPath) {
      return NextResponse.json(
        {
          error: "Engine HTTP call failed and no CLI fallback configured.",
          detail: httpResult.detail,
          mode: "http",
          otherCompileErrors: errors,
        },
        { status: 502 },
      );
    }
    // Fall through to CLI mode below — we'll annotate the timing with a
    // `fallbackFromHttp` flag so the UI can tell the user their HTTP engine
    // didn't answer.
  }
  // Track whether we just fell back from a failed HTTP attempt so the UI can
  // surface "HTTP unreachable, used CLI" instead of pretending CLI was the
  // intended path.
  const fellBackFromHttp = wantHttp;

  // ── CLI path (fallback or default when no engineUrl) ───────────────────
  if (!settings.engineCliPath) {
    return NextResponse.json(
      {
        error: "Neither Engine URL nor Engine CLI path configured. Set one in Settings — Engine URL for a running HTTP engine (~5ms per test), or Engine CLI path for spawn-per-test (~120ms).",
      },
      { status: 409 },
    );
  }

  const cliProject = path.join(settings.engineCliPath, "src", "RuleForge.Cli");
  try {
    await fs.access(cliProject);
  } catch {
    return NextResponse.json(
      { error: `RuleForge.Cli project not found at ${cliProject}. Check the engine CLI path.` },
      { status: 400 },
    );
  }

  const args = [
    "run", "--no-build", "--project", cliProject,
    "--",
    "run",
    "--endpoint", rule.endpoint,
    "--request", JSON.stringify(body.payload),
    "--fixtures", fixturesDir,
    "--debug",
  ];

  const result = await spawnDotnet(args, settings.engineCliPath);
  const tEnd = Date.now();

  const envelope = extractJson(result.stdout);
  if (!envelope) {
    return NextResponse.json(
      {
        error: "Engine did not return a parseable envelope.",
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code,
        otherCompileErrors: errors,
        timing: { mode: "cli", totalMs: tEnd - tStart, stageMs: tStaged - tStart, engineMs: tEnd - tStaged },
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    envelope,
    stderr: result.stderr,
    otherCompileErrors: errors,
    timing: {
      mode: "cli",
      totalMs: tEnd - tStart,
      stageMs: tStaged - tStart,
      engineMs: tEnd - tStaged,
      fellBackFromHttp,
    },
  });
}

/**
 * Call the engine over HTTP. Tries `<engineUrl><endpoint>` first; if that 404s
 * or fails we surface the detail so the caller can decide to fall back to CLI.
 */
async function callEngineHttp(
  engineUrl: string,
  method: string,
  endpoint: string,
  payload: unknown,
): Promise<
  | { kind: "ok"; envelope: unknown }
  | { kind: "err"; detail: string }
> {
  const base = engineUrl.replace(/\/$/, "");
  const url = `${base}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: method.toUpperCase() === "GET" ? undefined : JSON.stringify(payload),
      // Give a fast engine 2s to respond — anything slower means it's
      // probably not running (or cold-starting itself), and we should
      // surface that quickly so the caller can fall back to CLI.
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { kind: "err", detail: `${res.status} ${res.statusText}: ${text.slice(0, 200)}` };
    }
    const envelope = await res.json();
    return { kind: "ok", envelope };
  } catch (err) {
    return { kind: "err", detail: (err as Error).message };
  }
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
