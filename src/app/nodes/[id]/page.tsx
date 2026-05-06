import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { readNodeDef } from "@/lib/server/workspace";
import { NodeDefEditor } from "@/components/nodes/NodeDefEditor";

export default async function EditNodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const root = await requireWorkspace();
  const node = await readNodeDef(root, id);
  if (!node) notFound();
  // For now treat any node loaded from disk as editable (no isSeed flag yet —
  // would require comparing against a seed manifest, deferred until we ship
  // workspace seeding from a separate package).
  return <NodeDefEditor mode={{ kind: "edit", isSeed: false }} initial={node} />;
}
