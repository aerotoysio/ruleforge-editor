import { NextResponse, type NextRequest } from "next/server";
import { deleteSample, getActiveRoot } from "@/lib/server/workspace";

type Ctx = { params: Promise<{ ruleId: string; id: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { ruleId, id } = await ctx.params;
  const resolvedRuleId = ruleId === "_shared" ? null : ruleId;
  await deleteSample(root, resolvedRuleId, id);
  return NextResponse.json({ ok: true });
}
