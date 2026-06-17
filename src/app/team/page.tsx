import { getActiveRoot } from "@/lib/server/workspace";
import { getCurrentUser } from "@/lib/server/auth";
import { PERM, userHasPermission } from "@/lib/server/auth/types";
import { listUsers, listRoles } from "@/lib/server/auth/admin";
import { TeamClient } from "./TeamClient";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const root = await getActiveRoot();
  const user = await getCurrentUser();
  const isAdmin = user ? userHasPermission(user, PERM.USERS_MANAGE) : false;
  const users = root && isAdmin ? listUsers(root) : [];
  const roles = root && isAdmin ? listRoles(root) : [];
  return <TeamClient users={users} roles={roles} isAdmin={isAdmin} currentUserId={user?.id ?? null} />;
}
