import { NextResponse } from "next/server";
import {
  getActiveRoot,
  readSettings,
  readWorkspaceConfig,
  writeRule,
  writeNodeDef,
  writeReference,
  writeTemplate,
  writeSchemaTemplate,
  writeAsset,
} from "@/lib/server/workspace";
import {
  listCollection,
  listCollectionNames,
  DocumentForgeError,
  type DfCollection,
} from "@/lib/server/documentforge";
import type {
  Rule,
  NodeDef,
  ReferenceSet,
  OutputTemplate,
  SchemaTemplate,
  Asset,
} from "@/lib/types";

/**
 * POST /api/sync/pull-from-documentforge
 *
 * Read every collection from the configured DocumentForge database and
 * write the documents back to the filesystem via the same writeRule /
 * writeSchemaTemplate / etc. helpers the editor's normal save path uses.
 *
 * Idempotent. Files for entities that exist locally but NOT in DocumentForge
 * are left alone (additive merge) — call this a "fetch", not a "sync down".
 * For a destructive sync (wipe local, then pull), the user does it manually
 * by deleting workspace folders first.
 *
 * Returns per-collection counts + errors.
 */
export async function POST(req: Request) {
  const root = await getActiveRoot();
  const settings = await readSettings();
  if (!root) {
    return NextResponse.json({ error: "No workspace configured" }, { status: 409 });
  }
  if (!settings.documentForgeUrl) {
    return NextResponse.json(
      { error: "DocumentForge URL not configured. Set it in Settings → Engine runtime." },
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
  database = slugify(database);
  const baseUrl = settings.documentForgeUrl;

  // First check the database exists — DocumentForge returns 404 from
  // listCollectionNames if it doesn't, and that's a more actionable error
  // than failing every per-collection query downstream.
  let availableCollections: string[] = [];
  try {
    availableCollections = await listCollectionNames(baseUrl, database);
  } catch (e) {
    return NextResponse.json(
      {
        error: `Couldn't reach DocumentForge database '${database}'`,
        detail: (e as Error).message,
        hint: "Push a workspace first with /api/sync/push-to-documentforge to create the database.",
      },
      { status: 502 },
    );
  }

  const results: Record<string, { pulled: number; written: number }> = {};
  const errors: { collection: string; id?: string; detail: string }[] = [];

  // Per-collection writer dispatch. Each writer is the same one the editor's
  // own save path uses, so the on-disk shape ends up identical (flat
  // rules/<id>.json, schemas/<id>.json, etc.).
  const writers: Record<DfCollection, (root: string, doc: unknown) => Promise<void>> = {
    schemas:   (r, d) => writeSchemaTemplate(r, d as SchemaTemplate),
    templates: (r, d) => writeTemplate(r, d as OutputTemplate),
    assets:    (r, d) => writeAsset(r, d as Asset),
    refs:      (r, d) => writeReference(r, d as ReferenceSet),
    nodes:     (r, d) => writeNodeDef(r, d as NodeDef),
    rules:     async (r, d) => { await writeRule(r, d as Rule); },
    samples:   async () => { /* samples writer not wired up yet — skip silently */ },
  };

  // Pull schemas first so a rule's inputSchemaRef resolves on next page-load
  // (writeRule re-resolves refs); then templates / assets / refs / nodes;
  // rules last. This minimises the chance of intermediate "resolves-to-null"
  // states between collections during the pull.
  const pullOrder: DfCollection[] = ["schemas", "templates", "assets", "refs", "nodes", "rules"];

  for (const collection of pullOrder) {
    if (!availableCollections.includes(collection)) {
      results[collection] = { pulled: 0, written: 0 };
      continue;
    }
    try {
      const docs = await listCollection(baseUrl, database, collection);
      let written = 0;
      for (const doc of docs) {
        const id = (doc as { id?: string })?.id;
        try {
          await writers[collection](root, doc);
          written++;
        } catch (e) {
          errors.push({ collection, id, detail: (e as Error).message });
        }
      }
      results[collection] = { pulled: docs.length, written };
    } catch (e) {
      const detail = e instanceof DocumentForgeError
        ? `${e.status} ${e.message}`
        : (e as Error).message;
      errors.push({ collection, detail });
    }
  }

  const totalPulled = Object.values(results).reduce((a, r) => a + r.pulled, 0);
  return NextResponse.json({
    ok: errors.length === 0,
    database,
    totalPulled,
    collections: results,
    errors,
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
