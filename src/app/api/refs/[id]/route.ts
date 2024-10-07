import { NextResponse, type NextRequest } from "next/server";
import {
  readReference,
  writeReference,
  deleteReference,
  getActiveRoot,
} from "@/lib/server/workspace";
import type { ReferenceSet } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  const ref = await readReference(root, id);
  if (!ref) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ reference: ref });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  const incoming = (await req.json()) as ReferenceSet;
  if (incoming.id !== id) {
    return NextResponse.json({ error: "Reference id mismatch" }, { status: 400 });
  }
  await writeReference(root, incoming);
  return NextResponse.json({ reference: incoming });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  await deleteReference(root, id);
  return NextResponse.json({ ok: true });
}
