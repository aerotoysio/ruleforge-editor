import { NextResponse, type NextRequest } from "next/server";
import { listTemplatesFull, writeTemplate, getActiveRoot } from "@/lib/server/workspace";
import type { OutputTemplate } from "@/lib/types";

export async function GET() {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const templates = await listTemplatesFull(root);
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const tpl = (await req.json()) as OutputTemplate;
  if (!tpl.id || !tpl.name) {
    return NextResponse.json({ error: "Template must have id and name" }, { status: 400 });
  }
  if (!Array.isArray(tpl.fields)) {
    return NextResponse.json({ error: "Template must have a fields array" }, { status: 400 });
  }
  await writeTemplate(root, tpl);
  return NextResponse.json({ template: tpl });
}
