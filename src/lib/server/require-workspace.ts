import { redirect } from "next/navigation";
import { getActiveRoot } from "./workspace";

export async function requireWorkspace(): Promise<string> {
  const root = await getActiveRoot();
  if (!root) redirect("/settings");
  return root;
}
