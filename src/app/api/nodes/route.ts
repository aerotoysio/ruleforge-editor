import { NextResponse, type NextRequest } from "next/server";
import { listNodeDefs, writeNodeDef, getActiveRoot } from "@/lib/server/workspace";
import type { NodeDef } from "@/lib/types";

export async function GET() {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const nodes = await listNodeDefs(root);
  return NextResponse.json({ nodes });
}

export async function POST(req: NextRequest) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const node = (await req.json()) as NodeDef;
  if (!node.id || !node.name || !node.category) {
    return NextResponse.json({ error: "Node must have id, name, and category" }, { status: 400 });
  }
  await writeNodeDef(root, node);
  return NextResponse.json({ node });
}
