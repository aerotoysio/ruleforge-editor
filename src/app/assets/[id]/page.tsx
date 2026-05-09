import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { readAsset, listTemplatesFull } from "@/lib/server/workspace";
import { EditAssetClient } from "./EditAssetClient";

type Ctx = { params: Promise<{ id: string }> };

export default async function EditAssetPage({ params }: Ctx) {
  const root = await requireWorkspace();
  const { id } = await params;
  const asset = await readAsset(root, id);
  if (!asset) notFound();
  const templates = await listTemplatesFull(root);
  return <EditAssetClient initialAsset={asset} templates={templates} />;
}
