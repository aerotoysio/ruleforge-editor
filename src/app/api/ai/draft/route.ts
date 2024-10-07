import { NextResponse } from "next/server";

// AI draft is being rewired for the new node/bindings shape. Returning 503
// keeps the UI from accidentally calling the old codepath.
export async function POST() {
  return NextResponse.json(
    { error: "AI draft is being rewired for the new rule shape — coming soon." },
    { status: 503 },
  );
}
