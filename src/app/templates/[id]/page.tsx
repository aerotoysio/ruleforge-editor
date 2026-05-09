import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { readTemplate } from "@/lib/server/workspace";
import { EditTemplateClient } from "./EditTemplateClient";

type Ctx = { params: Promise<{ id: string }> };

export default async function EditTemplatePage({ params }: Ctx) {
  const root = await requireWorkspace();
  const { id } = await params;
  const tpl = await readTemplate(root, id);
  if (!tpl) notFound();
  return <EditTemplateClient initial={tpl} />;
}
