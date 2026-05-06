import { NextResponse, type NextRequest } from "next/server";
import { readNodeDef, writeNodeDef, deleteNodeDef, getActiveRoot } from "@/lib/server/workspace";
import type { NodeDef } from "@/lib/types";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const node = await readNodeDef(root, id);
  if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });
  return NextResponse.json({ node });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const node = (await req.json()) as NodeDef;
  if (node.id !== id) return NextResponse.json({ error: "id mismatch" }, { status: 400 });
  await writeNodeDef(root, node);
  return NextResponse.json({ node });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  await deleteNodeDef(root, id);
  return NextResponse.json({ ok: true });
}
