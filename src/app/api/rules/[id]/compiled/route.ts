import { NextResponse, type NextRequest } from "next/server";
import {
  readRule,
  listNodeDefs,
  listReferences,
  listTemplatesFull,
  listAssetsFull,
  getActiveRoot,
} from "@/lib/server/workspace";
import { compileRuleForEngine, CompileError } from "@/lib/rule/compile-to-engine";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Returns the engine-shaped JSON for a rule — what `rule.engine.json` would
 * look like if saved right now. Useful for "view compiled output" in the
 * dev tools panel and for the engine team to inspect what the editor emits.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  const rule = await readRule(root, id);
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [nodeDefs, refs, templates, assets] = await Promise.all([
    listNodeDefs(root),
    listReferences(root),
    listTemplatesFull(root),
    listAssetsFull(root),
  ]);

  try {
    const engineRule = compileRuleForEngine(rule, nodeDefs, { refs, templates, assets });
    return NextResponse.json({ rule: engineRule });
  } catch (err) {
    if (err instanceof CompileError) {
      return NextResponse.json(
        {
          error: "compile_error",
          instanceId: err.instanceId,
          portName: err.portName,
          detail: err.message,
        },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: "internal_error", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
