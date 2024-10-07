import { NextResponse, type NextRequest } from "next/server";
import { listReferences, writeReference, getActiveRoot } from "@/lib/server/workspace";
import type { ReferenceSet } from "@/lib/types";

export async function GET() {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const references = await listReferences(root);
  return NextResponse.json({ references });
}

export async function POST(req: NextRequest) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace" }, { status: 409 });
  const ref = (await req.json()) as ReferenceSet;
  if (!ref.id || !ref.name) {
    return NextResponse.json({ error: "Reference must have id and name" }, { status: 400 });
  }
  await writeReference(root, ref);
  return NextResponse.json({ reference: ref });
}
