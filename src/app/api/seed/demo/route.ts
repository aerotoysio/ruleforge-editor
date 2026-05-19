import { NextResponse } from "next/server";
import { getActiveRoot } from "@/lib/server/workspace";
import { seedDemo } from "@/lib/server/seed-demo";

/**
 * POST /api/seed/demo — write the curated demo set (offer + order schemas,
 * tax + product templates, and a handful of rules wiring them together) into
 * the active workspace. Idempotent.
 */
export async function POST() {
  const root = await getActiveRoot();
  if (!root) {
    return NextResponse.json({ error: "No workspace configured" }, { status: 409 });
  }
  try {
    const result = await seedDemo(root);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
