import { NextResponse, type NextRequest } from "next/server";
import { listAssetsFull, writeAsset, getActiveRoot } from "@/lib/server/workspace";
import type { Asset } from "@/lib/types";

export async function GET(req: NextRequest) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const templateId = req.nextUrl.searchParams.get("templateId") ?? undefined;
  const assets = await listAssetsFull(root, templateId);
  return NextResponse.json({ assets });
}

export async function POST(req: NextRequest) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const asset = (await req.json()) as Asset;
  if (!asset.id || !asset.templateId) {
    return NextResponse.json({ error: "Asset must have id and templateId" }, { status: 400 });
  }
  if (!asset.values || typeof asset.values !== "object") {
    return NextResponse.json({ error: "Asset must have a values object" }, { status: 400 });
  }
  await writeAsset(root, asset);
  return NextResponse.json({ asset });
}
