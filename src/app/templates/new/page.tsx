import { requireWorkspace } from "@/lib/server/require-workspace";
import { NewTemplateClient } from "./NewTemplateClient";

export default async function NewTemplatePage() {
  await requireWorkspace();
  return <NewTemplateClient />;
}
