import { NextResponse } from "next/server";
import { getAuthProvider } from "@/lib/server/auth";
import { getActiveRoot } from "@/lib/server/workspace";

export async function POST() {
  const root = await getActiveRoot();
  if (root) await getAuthProvider().logout(root);
  return NextResponse.json({ ok: true });
}
