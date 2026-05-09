import { NextResponse, type NextRequest } from "next/server";
import {
  readTemplate,
  writeTemplate,
  deleteTemplate,
  getActiveRoot,
} from "@/lib/server/workspace";
import type { OutputTemplate } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  const tpl = await readTemplate(root, id);
  if (!tpl) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template: tpl });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  const incoming = (await req.json()) as OutputTemplate;
  if (incoming.id !== id) {
    return NextResponse.json({ error: "Template id mismatch" }, { status: 400 });
  }
  if (!Array.isArray(incoming.fields)) {
    return NextResponse.json({ error: "Template must have a fields array" }, { status: 400 });
  }
  await writeTemplate(root, incoming);
  return NextResponse.json({ template: incoming });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  await deleteTemplate(root, id);
  return NextResponse.json({ ok: true });
}
