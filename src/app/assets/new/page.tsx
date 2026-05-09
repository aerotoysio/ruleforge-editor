import { requireWorkspace } from "@/lib/server/require-workspace";
import { listTemplatesFull } from "@/lib/server/workspace";
import { NewAssetClient } from "./NewAssetClient";

export default async function NewAssetPage() {
  const root = await requireWorkspace();
  const templates = await listTemplatesFull(root);
  return <NewAssetClient templates={templates} />;
}
