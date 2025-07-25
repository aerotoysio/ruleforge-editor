import { NextResponse, type NextRequest } from "next/server";
import {
  readAsset,
  writeAsset,
  deleteAsset,
  getActiveRoot,
} from "@/lib/server/workspace";
import type { Asset } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  const asset = await readAsset(root, id);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ asset });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  const incoming = (await req.json()) as Asset;
  if (incoming.id !== id) {
    return NextResponse.json({ error: "Asset id mismatch" }, { status: 400 });
  }
  if (!incoming.templateId) {
    return NextResponse.json({ error: "Asset must reference a templateId" }, { status: 400 });
  }
  await writeAsset(root, incoming);
  return NextResponse.json({ asset: incoming });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  await deleteAsset(root, id);
  return NextResponse.json({ ok: true });
}
