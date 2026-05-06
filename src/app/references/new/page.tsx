import { requireWorkspace } from "@/lib/server/require-workspace";
import { NewReferenceClient } from "./NewReferenceClient";

export default async function NewReferencePage() {
  await requireWorkspace();
  return <NewReferenceClient />;
}
