import { NextResponse } from "next/server";
import {
  getActiveRoot,
  listRules,
  readRule,
  listNodeDefs,
  listReferences,
  listTemplatesFull,
  listAssetsFull,
  listSchemaTemplatesFull,
} from "@/lib/server/workspace";

/**
 * GET /api/export — return the entire workspace as one document.
 *
 * Intended use: migrating a workspace into another store (DocumentForge,
 * a database, an object store). The shape collapses the on-disk directory
 * layout into a single flat object:
 *
 *   {
 *     exportedAt: <iso>,
 *     workspaceRoot: <path>,
 *     rules: Rule[],              // each rule fully resolved — schemas inlined,
 *                                 // bindings flattened, tests embedded
 *     schemas: SchemaTemplate[],  // shared input/output/context shapes
 *     templates: OutputTemplate[],// output-shape templates
 *     assets: Asset[],            // concrete template instances
 *     references: ReferenceSet[], // lookup tables
 *     nodeDefs: NodeDef[],        // the node library (typically read-only baseline)
 *   }
 *
 * Cross-entity references (Rule.inputSchemaRef → Schema.id,
 * Asset.templateId → Template.id, etc.) remain as string ids — they don't
 * need rewriting because every referenced entity is in the same bundle.
 *
 * To import elsewhere: iterate each collection and POST to the destination
 * by id. References stay valid as long as you preserve ids.
 */
export async function GET() {
  const root = await getActiveRoot();
  if (!root) {
    return NextResponse.json({ error: "No workspace configured" }, { status: 409 });
  }

  const [summaries, schemas, templates, assets, references, nodeDefs] = await Promise.all([
    listRules(root),
    listSchemaTemplatesFull(root),
    listTemplatesFull(root),
    listAssetsFull(root),
    listReferences(root),
    listNodeDefs(root),
  ]);

  // Read each rule fully so the exported document embeds resolved input
  // schemas + bindings + tests. Callers don't need to re-resolve refs.
  const rules = (
    await Promise.all(summaries.map((s) => readRule(root, s.id)))
  ).filter((r): r is NonNullable<typeof r> => r !== null);

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    workspaceRoot: root,
    rules,
    schemas,
    templates,
    assets,
    references,
    nodeDefs,
    /**
     * Identification & stats — handy for the receiver to verify the bundle.
     */
    stats: {
      rules: rules.length,
      schemas: schemas.length,
      templates: templates.length,
      assets: assets.length,
      references: references.length,
      nodeDefs: nodeDefs.length,
    },
  });
}
