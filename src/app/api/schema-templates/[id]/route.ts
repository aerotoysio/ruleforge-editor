import { NextResponse, type NextRequest } from "next/server";
import {
  readSchemaTemplate,
  writeSchemaTemplate,
  deleteSchemaTemplate,
  getActiveRoot,
} from "@/lib/server/workspace";
import type { SchemaTemplate } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  const tpl = await readSchemaTemplate(root, id);
  if (!tpl) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template: tpl });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  const incoming = (await req.json()) as SchemaTemplate;
  if (incoming.id !== id) {
    return NextResponse.json({ error: "Schema template id mismatch" }, { status: 400 });
  }
  if (!incoming.schema || typeof incoming.schema !== "object") {
    return NextResponse.json({ error: "Schema template must have a `schema` object" }, { status: 400 });
  }
  await writeSchemaTemplate(root, incoming);
  return NextResponse.json({ template: incoming });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  await deleteSchemaTemplate(root, id);
  return NextResponse.json({ ok: true });
}
