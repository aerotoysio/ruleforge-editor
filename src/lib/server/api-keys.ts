import crypto from "node:crypto";
import { getDb } from "./db";

// API keys that secure the engine's runtime endpoints. We store only a SHA-256
// hash + a display prefix — the full key (rfk_…) is returned ONCE at creation
// and never again. The engine validates incoming X-AERO-Key against the same
// hash in the shared workspace.db.

export type ApiKeyInfo = {
  id: string;
  name: string;
  prefix: string;
  createdBy: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  revoked: boolean;
};

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function createApiKey(rootPath: string, name: string, createdBy: string | null): { key: string; info: ApiKeyInfo } {
  const raw = "rfk_" + crypto.randomBytes(24).toString("hex"); // rfk_ + 48 hex chars
  const prefix = raw.slice(0, 12); // rfk_xxxxxx — safe to display
  const id = crypto.randomBytes(8).toString("hex");
  const createdAt = new Date().toISOString();
  getDb(rootPath)
    .prepare("INSERT INTO api_keys (id, name, prefix, key_hash, created_by, created_at, revoked) VALUES (?, ?, ?, ?, ?, ?, 0)")
    .run(id, name, prefix, sha256(raw), createdBy, createdAt);
  return { key: raw, info: { id, name, prefix, createdBy, createdAt, lastUsedAt: null, revoked: false } };
}

export function listApiKeys(rootPath: string): ApiKeyInfo[] {
  const rows = getDb(rootPath)
    .prepare("SELECT id, name, prefix, created_by, created_at, last_used_at, revoked FROM api_keys ORDER BY created_at DESC")
    .all() as { id: string; name: string | null; prefix: string | null; created_by: string | null; created_at: string | null; last_used_at: string | null; revoked: number }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? "",
    prefix: r.prefix ?? "",
    createdBy: r.created_by,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    revoked: !!r.revoked,
  }));
}

export function revokeApiKey(rootPath: string, id: string): void {
  getDb(rootPath).prepare("UPDATE api_keys SET revoked = 1 WHERE id = ?").run(id);
}
