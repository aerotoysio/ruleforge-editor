import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { readRule } from "@/lib/server/workspace";
import { TestRunnerClient } from "./TestRunnerClient";

type Ctx = { params: Promise<{ id: string }> };

export default async function TestRunnerPage({ params }: Ctx) {
  const root = await requireWorkspace();
  const { id } = await params;
  const rule = await readRule(root, id);
  if (!rule) notFound();
  return (
    <TestRunnerClient
      ruleId={rule.id}
      ruleName={rule.name}
      endpoint={rule.endpoint}
      method={rule.method}
      tests={rule.tests.map((t) => ({ id: t.id, name: t.name, payload: t.payload }))}
    />
  );
}
