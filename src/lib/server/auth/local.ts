import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "../db";
import type { AuthProvider, AuthUser } from "./types";

// Local email/password auth backed by workspace.db. Sessions are cookie tokens;
// passwords are scrypt-hashed via node:crypto (no external dependency).

const COOKIE = "rf_session";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const seeded = new Set<string>();

function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const computed = crypto.scryptSync(pw, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return computed.length === expected.length && crypto.timingSafeEqual(computed, expected);
}

// Seed default roles + the demo admin the first time we touch an empty db.
function ensureSeed(rootPath: string): void {
  if (seeded.has(rootPath)) return;
  const db = getDb(rootPath);
  const row = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number } | undefined;
  if (!row || row.c === 0) {
    const roles = [
      { id: "admin", name: "Admin", description: "Full access to everything.", permissions: ["*"] },
      { id: "tax-team", name: "Tax Team", description: "Owns tax rules + references.", permissions: ["rules.edit", "rules.publish", "references.manage", "assets.manage"] },
      { id: "offer-team", name: "Offer Team", description: "Owns offer rules + references.", permissions: ["rules.edit", "rules.publish", "references.manage", "assets.manage"] },
    ];
    const insRole = db.prepare("INSERT OR REPLACE INTO roles (id, name, description, permissions) VALUES (?, ?, ?, ?)");
    for (const r of roles) insRole.run(r.id, r.name, r.description, JSON.stringify(r.permissions));
    const uid = "u-demo";
    db.prepare("INSERT OR REPLACE INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(uid, "demo@aerotoys.io", "Demo Admin", hashPassword("demo"), new Date().toISOString());
    db.prepare("INSERT OR REPLACE INTO user_roles (user_id, role_id) VALUES (?, ?)").run(uid, "admin");
  }
  seeded.add(rootPath);
}

function loadUser(rootPath: string, id: string, email: string, name: string | null): AuthUser {
  const db = getDb(rootPath);
  const roleRows = db
    .prepare("SELECT r.id AS id, r.permissions AS permissions FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?")
    .all(id) as { id: string; permissions: string }[];
  const perms = new Set<string>();
  for (const r of roleRows) {
    try {
      for (const p of JSON.parse(r.permissions) as string[]) perms.add(p);
    } catch {
      /* ignore malformed permissions */
    }
  }
  return { id, email, name: name ?? email, roles: roleRows.map((r) => r.id), permissions: [...perms] };
}

export const localProvider: AuthProvider = {
  mode: "local",
  managesUsers: true,

  async getCurrentUser(rootPath) {
    ensureSeed(rootPath);
    const token = (await cookies()).get(COOKIE)?.value;
    if (!token) return null;
    const db = getDb(rootPath);
    const sess = db.prepare("SELECT user_id AS userId, expires_at AS exp FROM sessions WHERE token = ?").get(token) as
      | { userId: string; exp: string }
      | undefined;
    if (!sess || new Date(sess.exp).getTime() < Date.now()) return null;
    const u = db.prepare("SELECT id, email, name FROM users WHERE id = ?").get(sess.userId) as
      | { id: string; email: string; name: string | null }
      | undefined;
    return u ? loadUser(rootPath, u.id, u.email, u.name) : null;
  },

  async login(rootPath, email, password) {
    ensureSeed(rootPath);
    const db = getDb(rootPath);
    const u = db.prepare("SELECT id, email, name, password_hash AS hash FROM users WHERE email = ?").get(email.toLowerCase().trim()) as
      | { id: string; email: string; name: string | null; hash: string | null }
      | undefined;
    if (!u || !verifyPassword(password, u.hash)) return null;
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + SESSION_MS);
    db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(token, u.id, new Date().toISOString(), expires.toISOString());
    (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", expires });
    return loadUser(rootPath, u.id, u.email, u.name);
  },

  async logout(rootPath) {
    const store = await cookies();
    const token = store.get(COOKIE)?.value;
    if (token) {
      try {
        getDb(rootPath).prepare("DELETE FROM sessions WHERE token = ?").run(token);
      } catch {
        /* ignore */
      }
      store.delete(COOKIE);
    }
  },
};
