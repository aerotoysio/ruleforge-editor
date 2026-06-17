import { getActiveRoot } from "@/lib/server/workspace";
import { getCurrentUser, authMode } from "@/lib/server/auth";
import { PERM, userHasPermission } from "@/lib/server/auth/types";
import { listApiKeys } from "@/lib/server/api-keys";
import { KeysClient } from "./KeysClient";

// Reads cookies + the workspace db — always render per-request.
export const dynamic = "force-dynamic";

export default async function KeysPage() {
  const root = await getActiveRoot();
  const user = await getCurrentUser();
  const isAdmin = user ? userHasPermission(user, PERM.USERS_MANAGE) : false;
  const keys = root && isAdmin ? listApiKeys(root) : [];
  return <KeysClient initialKeys={keys} isAdmin={isAdmin} mode={authMode()} />;
}
