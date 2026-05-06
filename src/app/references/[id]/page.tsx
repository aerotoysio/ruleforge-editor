import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { readReference } from "@/lib/server/workspace";
import { EditReferenceClient } from "./EditReferenceClient";

type Ctx = { params: Promise<{ id: string }> };

export default async function EditReferencePage({ params }: Ctx) {
  const root = await requireWorkspace();
  const { id } = await params;
  const ref = await readReference(root, id);
  if (!ref) notFound();
  return <EditReferenceClient initial={ref} />;
}
