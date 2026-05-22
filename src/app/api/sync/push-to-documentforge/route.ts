import { NextResponse } from "next/server";
import {
  getActiveRoot,
  readSettings,
  listRules,
  readRule,
  listNodeDefs,
  listReferences,
  listTemplatesFull,
  listAssetsFull,
  listSchemaTemplatesFull,
  readWorkspaceConfig,
} from "@/lib/server/workspace";
import {
  ensureDatabase,
  replaceCollection,
  DocumentForgeError,
  type DfCollection,
} from "@/lib/server/documentforge";

/**
 * POST /api/sync/push-to-documentforge
 *
 * Walk every entity in the workspace and replace its matching collection on
 * the configured DocumentForge instance. Idempotent — each collection is
 * cleared then bulk-inserted, so the DocumentForge state ends up mirroring
 * the filesystem state exactly.
 *
 * The destination database name comes from (in order):
 *   - explicit `?database=foo` query param
 *   - settings.documentForgeDatabase
 *   - workspace.json's `name`
 *   - default: "ruleforge"
 *
 * Returns per-collection counts. Errors short-circuit but report which
 * collections were already pushed before the failure.
 */
export async function POST(req: Request) {
  const root = await getActiveRoot();
  const settings = await readSettings();
  if (!root) {
    return NextResponse.json({ error: "No workspace configured" }, { status: 409 });
  }
  if (!settings.documentForgeUrl) {
    return NextResponse.json(
      {
        error: "DocumentForge URL not configured. Set it in Settings → Engine runtime.",
      },
      { status: 409 },
    );
  }

  const url = new URL(req.url);
  let database = url.searchParams.get("database") ?? settings.documentForgeDatabase;
  if (!database) {
    try {
      const cfg = await readWorkspaceConfig(root);
      database = cfg.name?.trim() || "ruleforge";
    } catch {
      database = "ruleforge";
    }
  }
  // DocumentForge accepts most characters but normalising to a slug avoids
  // surprises and matches its `database = filename without .dfdb` convention.
  database = slugify(database);

  const baseUrl = settings.documentForgeUrl;
  const results: Record<DfCollection, { inserted: number; cleared: boolean }> = {} as Record<DfCollection, { inserted: number; cleared: boolean }>;
  const errors: { collection: string; detail: string }[] = [];

  try {
    await ensureDatabase(baseUrl, database);
  } catch (e) {
    return NextResponse.json(
      { error: "Couldn't create / attach DocumentForge database", detail: (e as Error).message, database },
      { status: 502 },
    );
  }

  // Read every entity locally first so a slow DocumentForge doesn't slow
  // the filesystem walk, and so a push error doesn't leave us holding open
  // file handles.
  const [ruleSummaries, schemas, templates, assets, references, nodeDefs] = await Promise.all([
    listRules(root),
    listSchemaTemplatesFull(root),
    listTemplatesFull(root),
    listAssetsFull(root),
    listReferences(root),
    listNodeDefs(root),
  ]);
  const rules = (await Promise.all(ruleSummaries.map((s) => readRule(root, s.id)))).filter(
    (r): r is NonNullable<typeof r> => r !== null,
  );

  // Each entity type → matching collection. Order doesn't matter (no FK
  // ordering needed; DocumentForge doesn't enforce referential integrity).
  const plan: Array<[DfCollection, unknown[]]> = [
    ["schemas",   schemas],
    ["templates", templates],
    ["assets",    assets],
    ["refs",      references],
    ["nodes",     nodeDefs],
    ["rules",     rules],
    // samples — listed via the existing /samples folder when it's wired up
    // through workspace; skip for now if we don't have a list helper.
  ];

  for (const [collection, docs] of plan) {
    try {
      results[collection] = await replaceCollection(baseUrl, database, collection, docs);
    } catch (e) {
      const detail = e instanceof DocumentForgeError
        ? `${e.status} ${e.message}${e.detail ? ` — ${typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail)}` : ""}`
        : (e as Error).message;
      errors.push({ collection, detail });
    }
  }

  const totalInserted = Object.values(results).reduce((a, r) => a + r.inserted, 0);
  return NextResponse.json({
    ok: errors.length === 0,
    database,
    totalInserted,
    collections: results,
    errors,
    /**
     * Cheat-sheet: the URL the engine would point at to read this workspace
     * once DocumentForge becomes a rule source.
     */
    engineSource: {
      documentForgeUrl: baseUrl,
      database,
    },
  });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    || "ruleforge";
}
