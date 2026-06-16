import { NextResponse } from "next/server";
import { getActiveRoot } from "@/lib/server/workspace";
import { migrateFoldersToSqlite } from "@/lib/server/migrate-to-sqlite";

// POST /api/migrate/to-sqlite — one-shot import of the folder workspace into
// workspace.db's authoring tables. Idempotent.
export async function POST() {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace configured" }, { status: 409 });
  const counts = await migrateFoldersToSqlite(root);
  return NextResponse.json({ ok: true, counts });
}
