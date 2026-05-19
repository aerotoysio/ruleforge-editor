import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getActiveRoot,
  readRule,
  writeRule,
} from "@/lib/server/workspace";

/**
 * POST /api/migrate/flatten-rules — convert any legacy directory-layout rules
 * in this workspace to the flat `rules/<id>.json` shape.
 *
 * For each `rules/<id>/` directory found:
 *   1. readRule(id) assembles the in-memory Rule (resolves schema refs,
 *      flattens bindings/, embeds tests).
 *   2. writeRule(rule) writes `rules/<id>.json` and removes the legacy
 *      directory atomically.
 *
 * Idempotent — running again is a no-op for already-flat rules.
 */
export async function POST() {
  const root = await getActiveRoot();
  if (!root) {
    return NextResponse.json({ error: "No workspace configured" }, { status: 409 });
  }

  const rulesDir = path.join(root, "rules");
  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    entries = await fs.readdir(rulesDir, { withFileTypes: true });
  } catch {
    return NextResponse.json({ flattened: [], errors: [], note: "No rules/ directory yet." });
  }

  const flattened: string[] = [];
  const errors: { id: string; detail: string }[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    const id = entry.name;
    try {
      const rule = await readRule(root, id);
      if (!rule) {
        errors.push({ id, detail: "readRule returned null (directory unreadable)" });
        continue;
      }
      await writeRule(root, rule); // writes flat + removes the legacy dir
      flattened.push(id);
    } catch (e) {
      errors.push({ id, detail: (e as Error).message });
    }
  }

  return NextResponse.json({ flattened, errors });
}
