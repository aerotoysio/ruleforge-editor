import { getActiveRoot } from "../workspace";
import { localProvider } from "./local";
import { externalProvider } from "./external";
import { userHasPermission, type AuthProvider, type AuthUser } from "./types";

export type { AuthUser, AuthProvider } from "./types";
export { PERM, userHasPermission } from "./types";

export class AuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "AuthError";
  }
}

/** "local" (default) owns users in workspace.db; "external" trusts the PSS gateway. */
export function authMode(): "local" | "external" {
  return process.env.RULEFORGE_AUTH_MODE === "external" ? "external" : "local";
}

export function getAuthProvider(): AuthProvider {
  return authMode() === "external" ? externalProvider : localProvider;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const root = await getActiveRoot();
  if (!root) return null;
  return getAuthProvider().getCurrentUser(root);
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Not authenticated", 401);
  return user;
}

export async function requirePermission(perm: string): Promise<AuthUser> {
  const user = await requireUser();
  if (!userHasPermission(user, perm)) throw new AuthError(`Missing permission: ${perm}`, 403);
  return user;
}
