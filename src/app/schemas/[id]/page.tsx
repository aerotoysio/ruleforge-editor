import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { readSchemaTemplate } from "@/lib/server/workspace";
import { EditSchemaClient } from "./EditSchemaClient";

type Params = { id: string };

export default async function EditSchemaPage({ params }: { params: Promise<Params> }) {
  const root = await requireWorkspace();
  const { id } = await params;
  const tpl = await readSchemaTemplate(root, id);
  if (!tpl) notFound();
  return <EditSchemaClient initial={tpl} />;
}
