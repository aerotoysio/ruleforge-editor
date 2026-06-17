import { NextResponse } from "next/server";
import { getCurrentUser, authMode } from "@/lib/server/auth";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user, mode: authMode() });
}
