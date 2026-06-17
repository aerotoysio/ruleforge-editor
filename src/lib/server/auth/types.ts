// Auth model + the provider abstraction. The rest of the app depends ONLY on
// this interface — the local (now) and external/PSS (later) implementations both
// satisfy it, selected by RULEFORGE_AUTH_MODE. Swapping to the PSS is a config
// flip, not an app rewrite.

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  roles: string[]; // role ids
  permissions: string[]; // flattened capabilities ("*" = all)
};

export interface AuthProvider {
  readonly mode: "local" | "external";
  /** True if this app owns the user records (local); false if it defers to an upstream IdP (external). */
  readonly managesUsers: boolean;
  /** Resolve the current request's user — cookie session locally, trusted gateway identity externally. */
  getCurrentUser(rootPath: string): Promise<AuthUser | null>;
  /** Email + password login (local only). External returns null — the PSS owns login. */
  login(rootPath: string, email: string, password: string): Promise<AuthUser | null>;
  /** End the current session (local only; no-op externally). */
  logout(rootPath: string): Promise<void>;
}

// Capability strings. The Admin role carries "*".
export const PERM = {
  ALL: "*",
  RULES_EDIT: "rules.edit",
  RULES_PUBLISH: "rules.publish",
  RULES_DELETE: "rules.delete",
  REFERENCES_MANAGE: "references.manage",
  NODES_MANAGE: "nodes.manage",
  TEMPLATES_MANAGE: "templates.manage",
  ASSETS_MANAGE: "assets.manage",
  USERS_MANAGE: "users.manage",
} as const;

export function userHasPermission(user: AuthUser, perm: string): boolean {
  return user.permissions.includes("*") || user.permissions.includes(perm);
}

/**
 * Rule-scoping: admins ("*") see/act on everything; a rule with no ownerRole is
 * visible to all signed-in users; otherwise the user must belong to the owning
 * role. This is the "Tax Team → Tax rules" boundary.
 */
export function canAccessRule(user: AuthUser, ownerRole: string | null | undefined): boolean {
  if (user.permissions.includes("*")) return true;
  if (!ownerRole) return true;
  return user.roles.includes(ownerRole);
}
