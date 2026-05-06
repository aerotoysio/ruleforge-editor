import { NextResponse, type NextRequest } from "next/server";
import {
  readRule,
  writeRule,
  deleteRule,
  getActiveRoot,
} from "@/lib/server/workspace";
import type { Rule } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  const rule = await readRule(root, id);
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ rule });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  const incoming = (await req.json()) as Rule;
  if (incoming.id !== id) {
    return NextResponse.json({ error: "Rule id mismatch" }, { status: 400 });
  }
  const fileName = await writeRule(root, incoming);
  return NextResponse.json({ rule: incoming, fileName });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const { id } = await ctx.params;
  await deleteRule(root, id);
  return NextResponse.json({ ok: true });
}
