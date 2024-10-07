import { NextResponse, type NextRequest } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import { getActiveRoot, readSettings, readRule } from "@/lib/server/workspace";

type Body = {
  ruleId: string;
  payload: unknown;
};

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
    path.join(root, "rules"),
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
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ envelope, stderr: result.stderr });
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
