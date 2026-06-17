import { headers } from "next/headers";
import type { AuthProvider } from "./types";

// Placeholder for the future airline-PSS integration. When
// RULEFORGE_AUTH_MODE=external, identity is TRUSTED from an upstream gateway —
// RuleForge must sit behind a proxy that authenticates the user and injects
// these headers (or a verified JWT). There is no local user store and no login
// screen in this mode; the PSS owns all of that.
//
// Header contract (adjust to the real PSS when it's defined):
//   x-pss-user   — user email / id
//   x-pss-name   — display name
//   x-pss-roles  — comma-separated role ids
export const externalProvider: AuthProvider = {
  mode: "external",
  managesUsers: false,

  async getCurrentUser() {
    const h = await headers();
    const email = h.get("x-pss-user");
    if (!email) return null;
    const roles = (h.get("x-pss-roles") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    // TODO: map PSS roles → permissions (lookup or convention). Until then an
    // "admin" role grants all; other roles carry through with no extra perms.
    const permissions = roles.includes("admin") ? ["*"] : [];
    return { id: email, email, name: h.get("x-pss-name") ?? email, roles, permissions };
  },

  async login() {
    return null; // the PSS owns login
  },

  async logout() {
    /* the PSS owns logout */
  },
};
