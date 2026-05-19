import { NextResponse, type NextRequest } from "next/server";
import { listSchemaTemplatesFull, writeSchemaTemplate, getActiveRoot } from "@/lib/server/workspace";
import type { SchemaTemplate } from "@/lib/types";

export async function GET() {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const templates = await listSchemaTemplatesFull(root);
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const tpl = (await req.json()) as SchemaTemplate;
  if (!tpl.id || !tpl.name) {
    return NextResponse.json({ error: "Schema template must have id and name" }, { status: 400 });
  }
  if (!tpl.schema || typeof tpl.schema !== "object") {
    return NextResponse.json({ error: "Schema template must have a `schema` object" }, { status: 400 });
  }
  await writeSchemaTemplate(root, tpl);
  return NextResponse.json({ template: tpl });
}
