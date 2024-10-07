import { NextResponse, type NextRequest } from "next/server";
import { listRules, writeRule, getActiveRoot } from "@/lib/server/workspace";
import type { Rule } from "@/lib/types";

export async function GET() {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const rules = await listRules(root);
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const rule = (await req.json()) as Rule;
  if (!rule.id || !rule.name) {
    return NextResponse.json({ error: "Rule must have id and name" }, { status: 400 });
  }
  const fileName = await writeRule(root, rule);
  return NextResponse.json({ rule, fileName });
}
