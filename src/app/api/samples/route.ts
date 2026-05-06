import { NextResponse, type NextRequest } from "next/server";
import { listSamples, writeSample, getActiveRoot } from "@/lib/server/workspace";
import type { Sample } from "@/lib/types";

export async function GET(req: NextRequest) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const url = new URL(req.url);
  const ruleId = url.searchParams.get("ruleId");
  const samples = await listSamples(root, ruleId);
  return NextResponse.json({ samples });
}

export async function POST(req: NextRequest) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const sample = (await req.json()) as Sample;
  if (!sample.id || !sample.name) {
    return NextResponse.json({ error: "Sample must have id and name" }, { status: 400 });
  }
  await writeSample(root, sample);
  return NextResponse.json({ sample });
}
