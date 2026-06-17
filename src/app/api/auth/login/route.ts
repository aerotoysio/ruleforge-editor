import { NextResponse, type NextRequest } from "next/server";
import { getAuthProvider } from "@/lib/server/auth";
import { getActiveRoot } from "@/lib/server/workspace";

export async function POST(req: NextRequest) {
  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace configured" }, { status: 409 });
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!email || !password) return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  const user = await getAuthProvider().login(root, email, password);
  if (!user) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  return NextResponse.json({ user });
}
