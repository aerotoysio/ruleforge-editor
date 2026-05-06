import { NextResponse, type NextRequest } from "next/server";
import path from "node:path";
import {
  readSettings,
  writeSettings,
  seedWorkspace,
  workspaceExists,
  readWorkspaceConfig,
} from "@/lib/server/workspace";

export async function GET() {
  const settings = await readSettings();
  let workspace = null;
  if (settings.rootPath && (await workspaceExists(settings.rootPath))) {
    workspace = await readWorkspaceConfig(settings.rootPath).catch(() => null);
  }
  return NextResponse.json({
    rootPath: settings.rootPath,
    recentRoots: settings.recentRoots,
    engineUrl: settings.engineUrl ?? null,
    engineCliPath: settings.engineCliPath ?? null,
    documentForgeUrl: settings.documentForgeUrl ?? null,
    ollamaUrl: settings.ollamaUrl ?? null,
    ollamaModel: settings.ollamaModel ?? null,
    workspace,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    rootPath?: string | null;
    engineUrl?: string | null;
    engineCliPath?: string | null;
    documentForgeUrl?: string | null;
    ollamaUrl?: string | null;
    ollamaModel?: string | null;
    seed?: boolean;
  };

  let resolved: string | null | undefined = body.rootPath;
  if (typeof resolved === "string") {
    resolved = path.resolve(resolved.trim());
    if (body.seed) {
      try {
        await seedWorkspace(resolved);
      } catch (err) {
        return NextResponse.json(
          { error: `Could not seed workspace: ${(err as Error).message}` },
          { status: 400 },
        );
      }
    } else if (!(await workspaceExists(resolved))) {
      return NextResponse.json(
        {
          error: `No workspace.json found at ${resolved}. Pass seed=true to initialize.`,
          needsSeed: true,
          resolvedPath: resolved,
        },
        { status: 409 },
      );
    }
  }

  const next = await writeSettings({
    rootPath: resolved === undefined ? undefined : resolved,
    engineUrl: body.engineUrl ?? undefined,
    engineCliPath: body.engineCliPath ?? undefined,
    documentForgeUrl: body.documentForgeUrl ?? undefined,
    ollamaUrl: body.ollamaUrl ?? undefined,
    ollamaModel: body.ollamaModel ?? undefined,
  });

  let workspace = null;
  if (next.rootPath && (await workspaceExists(next.rootPath))) {
    workspace = await readWorkspaceConfig(next.rootPath).catch(() => null);
  }

  return NextResponse.json({
    rootPath: next.rootPath,
    recentRoots: next.recentRoots,
    engineUrl: next.engineUrl ?? null,
    engineCliPath: next.engineCliPath ?? null,
    documentForgeUrl: next.documentForgeUrl ?? null,
    ollamaUrl: next.ollamaUrl ?? null,
    ollamaModel: next.ollamaModel ?? null,
    workspace,
  });
}
