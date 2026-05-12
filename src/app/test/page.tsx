import { requireWorkspace } from "@/lib/server/require-workspace";
import { listRules } from "@/lib/server/workspace";
import { TestRunnerPicker } from "./TestRunnerPicker";

export default async function TestIndexPage() {
  const root = await requireWorkspace();
  const rules = await listRules(root);
  return <TestRunnerPicker rules={rules.map((r) => ({ id: r.id, name: r.name, endpoint: r.endpoint }))} />;
}
