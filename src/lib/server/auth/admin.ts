import crypto from "node:crypto";
import { getDb } from "../db";

// Admin CRUD over users + roles in workspace.db. Used only behind
// requirePermission(USERS_MANAGE). Passwords are scrypt-hashed (same scheme as
// the local provider). Unused when RULEFORGE_AUTH_MODE=external (the PSS owns identity).

export type AdminUser = { id: string; email: string; name: string | null; createdAt: string | null; roles: string[] };
export type AdminRole = { id: string; name: string; description: string | null; permissions: string[]; userCount: number };

function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function safeParse(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function listUsers(root: string): AdminUser[] {
  const db = getDb(root);
  const users = db.prepare("SELECT id, email, name, created_at FROM users ORDER BY email").all() as {
    id: string; email: string; name: string | null; created_at: string | null;
  }[];
  const urs = db.prepare("SELECT user_id, role_id FROM user_roles").all() as { user_id: string; role_id: string }[];
  const byUser = new Map<string, string[]>();
  for (const ur of urs) {
    const a = byUser.get(ur.user_id);
    if (a) a.push(ur.role_id);
    else byUser.set(ur.user_id, [ur.role_id]);
  }
  return users.map((u) => ({ id: u.id, email: u.email, name: u.name, createdAt: u.created_at, roles: byUser.get(u.id) ?? [] }));
}

export function emailExists(root: string, email: string): boolean {
  return !!getDb(root).prepare("SELECT 1 AS x FROM users WHERE email = ?").get(email.toLowerCase().trim());
}

export function createUser(root: string, input: { email: string; name?: string; password: string; roles?: string[] }): AdminUser {
  const db = getDb(root);
  const email = input.email.toLowerCase().trim();
  const id = "u-" + crypto.randomBytes(6).toString("hex");
  const createdAt = new Date().toISOString();
  db.prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, email, input.name?.trim() || null, hashPassword(input.password), createdAt);
  setUserRoles(root, id, input.roles ?? []);
  return { id, email, name: input.name?.trim() || null, createdAt, roles: input.roles ?? [] };
}

export function setUserRoles(root: string, userId: string, roles: string[]): void {
  const db = getDb(root);
  db.prepare("DELETE FROM user_roles WHERE user_id = ?").run(userId);
  const ins = db.prepare("INSERT OR REPLACE INTO user_roles (user_id, role_id) VALUES (?, ?)");
  for (const r of roles) ins.run(userId, r);
}

export function setPassword(root: string, userId: string, password: string): void {
  getDb(root).prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), userId);
}

export function deleteUser(root: string, userId: string): void {
  const db = getDb(root);
  db.prepare("DELETE FROM user_roles WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

export function listRoles(root: string): AdminRole[] {
  const db = getDb(root);
  const roles = db.prepare("SELECT id, name, description, permissions FROM roles ORDER BY name").all() as {
    id: string; name: string; description: string | null; permissions: string;
  }[];
  const counts = db.prepare("SELECT role_id, COUNT(*) AS c FROM user_roles GROUP BY role_id").all() as { role_id: string; c: number }[];
  const cmap = new Map(counts.map((c) => [c.role_id, c.c]));
  return roles.map((r) => ({ id: r.id, name: r.name, description: r.description, permissions: safeParse(r.permissions), userCount: cmap.get(r.id) ?? 0 }));
}

export function upsertRole(root: string, input: { id?: string; name: string; description?: string; permissions: string[] }): string {
  const db = getDb(root);
  const rid = input.id || slug(input.name) || "role-" + crypto.randomBytes(3).toString("hex");
  db.prepare("INSERT OR REPLACE INTO roles (id, name, description, permissions) VALUES (?, ?, ?, ?)")
    .run(rid, input.name.trim(), input.description?.trim() || null, JSON.stringify(input.permissions ?? []));
  return rid;
}

export function deleteRole(root: string, roleId: string): void {
  const db = getDb(root);
  db.prepare("DELETE FROM user_roles WHERE role_id = ?").run(roleId);
  db.prepare("DELETE FROM roles WHERE id = ?").run(roleId);
}
