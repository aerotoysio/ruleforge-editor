"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, ChevronRight } from "lucide-react";

/**
 * Global topbar — breadcrumbs left, search right, env pill.
 *
 * The breadcrumb trail is derived from the current URL pathname so we don't
 * need a per-page registry. The first segment maps to a friendly name
 * (e.g. `/rules` → "Rules") via the `SEGMENT_LABELS` table; subsequent
 * segments render as their raw value with bidirectional truncation when
 * they're long (rule ids can be slugged).
 */

const SEGMENT_LABELS: Record<string, string> = {
  rules: "Rules",
  nodes: "Nodes",
  templates: "Templates",
  assets: "Assets",
  references: "References",
  samples: "Samples",
  settings: "Settings",
  test: "Test runner",
  new: "New",
};

/**
 * Some screens (the rule editor canvas, the dedicated test runner) own their
 * full vertical space and render their own headers inline. They don't want
 * a global topbar stealing 52 px and a sidebar-aligned border. The page
 * route matching here keeps the topbar out of those views.
 */
const HIDE_TOPBAR_PREFIXES = ["/rules/", "/test/"];

export function Topbar() {
  const pathname = usePathname() ?? "/";

  if (HIDE_TOPBAR_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = SEGMENT_LABELS[seg] ?? decodeURIComponent(seg);
    return { href, label, isLast: i === segments.length - 1 };
  });

  if (crumbs.length === 0) {
    crumbs.push({ href: "/", label: "Home", isLast: true });
  }

  return (
    <header className="topbar">
      <nav className="crumb" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={c.href} className="crumb">
            {i > 0 ? (
              <ChevronRight className="sep" style={{ width: 12, height: 12 }} aria-hidden />
            ) : null}
            {c.isLast ? (
              <span
                className="here"
                title={c.label.length > 32 ? c.label : undefined}
                style={{
                  maxWidth: 280,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.label}
              </span>
            ) : (
              <Link href={c.href} className="hover:text-foreground transition-colors">
                {c.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="topbar-search">
        <Search />
        <input
          type="text"
          placeholder="Search rules, nodes, assets…"
          disabled
          aria-label="Search"
          title="Search is coming — not wired up yet"
        />
        <span className="kbd">⌘ K</span>
      </div>

      <span className="env-pill" title="Workspace runs locally — no engine API key set">
        <span className="dot" />
        local
      </span>
    </header>
  );
}
