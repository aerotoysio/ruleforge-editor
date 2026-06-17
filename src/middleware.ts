import { NextResponse, type NextRequest } from "next/server";

// Cheap edge gate: page routes need a session cookie, else redirect to /login.
// Full validation happens server-side (getCurrentUser). Skipped entirely when
// RULEFORGE_AUTH_MODE=external — there the upstream PSS gateway authenticates,
// so RuleForge must not run its own login screen.
export function middleware(req: NextRequest) {
  if (process.env.RULEFORGE_AUTH_MODE === "external") return NextResponse.next();
  if (req.cookies.has("rf_session")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Gate everything except the login page, the API routes (guarded separately),
  // Next internals, and the favicon.
  matcher: ["/((?!api|_next|favicon.ico|login).*)"],
};
