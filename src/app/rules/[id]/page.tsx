import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { readRule } from "@/lib/server/workspace";
import { RuleEditorClient } from "./RuleEditorClient";

type Ctx = { params: Promise<{ id: string }> };

export default async function RuleEditPage({ params }: Ctx) {
  const root = await requireWorkspace();
  const { id } = await params;
  const rule = await readRule(root, id);
  if (!rule) notFound();
  return <RuleEditorClient initial={rule} />;
}
