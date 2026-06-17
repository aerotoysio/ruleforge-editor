"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FileCog,
  Boxes,
  FlaskConical,
  Database,
  LayoutTemplate,
  Package,
  Settings,
  Hammer,
  LayoutDashboard,
  History,
  Plug,
  Users,
  Sun,
  Moon,
  Braces,
  Filter,
  Terminal,
  LogOut,
  KeyRound,
} from "lucide-react";
import { useWorkspace } from "./WorkspaceProvider";
import { cn } from "@/lib/utils";

type Item = {
  href: string;
  label: string;
  icon: typeof FileCog;
  group: "workspace" | "data" | "configure";
  /** Pill text. Hardcoded "new" tags or counts; pass undefined to hide. */
  badge?: string;
  /** When true: rendered greyed-out + non-clickable. */
  disabled?: boolean;
};

const ITEMS: Item[] = [
  // Workspace — primary build flow
  { href: "/dashboard",  label: "Overview",      icon: LayoutDashboard, group: "workspace", disabled: true },
  { href: "/rules",      label: "Rules",         icon: FileCog,         group: "workspace" },
  { href: "/audit",      label: "Audit log",     icon: History,         group: "workspace", disabled: true },

  // Data — what rules consume
  { href: "/nodes",      label: "Nodes",         icon: Boxes,           group: "data" },
  { href: "/nodes?category=filter", label: "Filters", icon: Filter,     group: "data" },
  { href: "/schemas",    label: "Schemas",       icon: Braces,          group: "data" },
  { href: "/templates",  label: "Templates",     icon: LayoutTemplate,  group: "data" },
  { href: "/assets",     label: "Assets",        icon: Package,         group: "data" },
  { href: "/references", label: "References",    icon: Database,        group: "data" },
  { href: "/samples",    label: "Samples",       icon: FlaskConical,    group: "data" },

  // Configure — system surface
  { href: "/commands",     label: "Run commands", icon: Terminal,       group: "configure" },
  { href: "/keys",         label: "API keys",     icon: KeyRound,       group: "configure" },
  { href: "/integrations", label: "Integrations", icon: Plug,           group: "configure", disabled: true },
  { href: "/team",         label: "Team & roles", icon: Users,          group: "configure" },
  { href: "/settings",     label: "Settings",     icon: Settings,       group: "configure" },
];

const GROUP_LABELS: Record<Item["group"], string> = {
  workspace: "Workspace",
  data: "Data",
  configure: "Configure",
};

const GROUP_ORDER: Item["group"][] = ["workspace", "data", "configure"];

export function Sidebar() {
  const pathname = usePathname();
  const { rootPath } = useWorkspace();
  const workspaceName = rootPath
    ? rootPath.split(/[\\/]/).filter(Boolean).pop() ?? "Workspace"
    : "Workspace";

  // We read the live query string via window.location (refreshed when the URL
  // changes via the popstate event + the pathname effect below). Using
  // useSearchParams() here would force every page that renders this Sidebar
  // through a Suspense boundary — too invasive when only this small "is
  // active" check needs the query.
  const [search, setSearch] = useState<string>("");
  useEffect(() => {
    setSearch(typeof window !== "undefined" ? window.location.search : "");
    function onChange() {
      setSearch(window.location.search);
    }
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, [pathname]);
  const searchParams = search ? new URLSearchParams(search.replace(/^\?/, "")) : null;

  // Helper — does the current URL match a sidebar item's href?
  // We compare pathname for normal links; for query-bearing hrefs (e.g.
  // "/nodes?category=filter") we also have to match the query string. And
  // when a query-bearing link is the "Filters" shortcut, the plain "/nodes"
  // link should NOT light up — without that carve-out both would show
  // active simultaneously when on /nodes?category=filter.
  function isItemActive(item: Item): boolean {
    const [itemPath, itemQuery] = item.href.split("?");
    const pathMatches =
      pathname === itemPath ||
      (itemPath !== "/" && pathname?.startsWith(itemPath + "/"));
    if (!pathMatches) return false;
    if (itemQuery) {
      // Query-bearing link: every key in the item's query must match the
      // current URL's value.
      const itemParams = new URLSearchParams(itemQuery);
      for (const [k, v] of itemParams.entries()) {
        if (searchParams?.get(k) !== v) return false;
      }
      return true;
    }
    // Plain link: only active when NO sibling query-bearing link wins. When
    // a more-specific sibling claims the current URL, suppress this one so
    // we don't get two active links at once.
    if (searchParams && searchParams.toString().length > 0) {
      for (const other of ITEMS) {
        if (other === item || !other.href.startsWith(itemPath + "?")) continue;
        const otherQuery = other.href.split("?")[1];
        if (!otherQuery) continue;
        const otherParams = new URLSearchParams(otherQuery);
        let allMatch = true;
        for (const [k, v] of otherParams.entries()) {
          if (searchParams.get(k) !== v) { allMatch = false; break; }
        }
        if (allMatch) return false;
      }
    }
    return true;
  }

  return (
    <aside
      className="flex flex-col overflow-hidden min-h-0"
      style={{
        background: "var(--panel)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Brand mark */}
      <div
        className="flex items-center gap-2.5 px-3.5 py-3 min-h-[52px]"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div
          className="w-7 h-7 rounded-md grid place-items-center text-white flex-shrink-0 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, var(--accent), var(--accent-strong))",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <Hammer className="w-3.5 h-3.5 relative z-10" strokeWidth={2.25} />
          <span
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.18), transparent 40%)",
            }}
          />
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <span
            className="text-[14px] font-semibold tracking-tight truncate"
            style={{ letterSpacing: "-0.02em" }}
          >
            RuleForge
          </span>
          <span
            className="text-[10.5px] uppercase tracking-wider truncate"
            style={{ color: "var(--text-muted)", letterSpacing: "0.04em" }}
          >
            Admin
          </span>
        </div>
      </div>

      {/* Workspace switch */}
      <Link
        href="/settings"
        className="mx-2.5 mt-2 mb-1.5 px-3 py-2 rounded-md flex items-center gap-2.5 cursor-pointer transition-colors hover:opacity-90"
        style={{
          background: "var(--panel-2)",
          border: "1px solid var(--border)",
        }}
      >
        <div
          className="w-6 h-6 rounded-md grid place-items-center text-[11px] font-semibold flex-shrink-0"
          style={{
            background: "var(--elev)",
            color: "var(--text-dim)",
            border: "1px solid var(--border)",
          }}
        >
          {workspaceName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 leading-tight">
          <div
            className="text-[12.5px] font-medium truncate"
            style={{ color: "var(--text)" }}
            title={workspaceName}
          >
            {workspaceName}
          </div>
          <div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
            workspace
          </div>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {GROUP_ORDER.map((group) => {
          const items = ITEMS.filter((i) => i.group === group);
          return (
            <div key={group} className="flex flex-col">
              <div
                className="px-2.5 pt-3 pb-1.5 text-[10.5px] uppercase tracking-wider font-medium"
                style={{ color: "var(--text-faint)", letterSpacing: "0.07em" }}
              >
                {GROUP_LABELS[group]}
              </div>
              {items.map((item) => {
                const active = isItemActive(item);
                const Icon = item.icon;

                const content = (
                  <>
                    <Icon
                      className="w-4 h-4 flex-shrink-0"
                      strokeWidth={active ? 2.1 : 1.8}
                      style={{
                        color: active
                          ? "var(--accent)"
                          : item.disabled
                          ? "var(--text-faint)"
                          : "var(--text-muted)",
                      }}
                    />
                    <span
                      className="flex-1 whitespace-nowrap text-[13px]"
                      style={{
                        color: active
                          ? "var(--text)"
                          : item.disabled
                          ? "var(--text-faint)"
                          : "var(--text-dim)",
                      }}
                    >
                      {item.label}
                    </span>
                    {item.badge ? (
                      <span
                        className="text-[10.5px] rounded-[4px] px-1.5 py-px tabular-nums"
                        style={{
                          background: active ? "var(--panel)" : "var(--elev)",
                          color: active ? "var(--text)" : "var(--text-muted)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {item.badge}
                      </span>
                    ) : item.disabled ? (
                      <span
                        className="text-[9.5px] uppercase tracking-wider rounded-[4px] px-1.5 py-px"
                        style={{
                          color: "var(--text-faint)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        soon
                      </span>
                    ) : null}
                  </>
                );

                const baseClass =
                  "flex items-center gap-2.5 px-2.5 py-1.5 mt-0.5 rounded-md select-none transition-colors";

                if (item.disabled) {
                  return (
                    <div
                      key={item.href}
                      className={cn(baseClass, "cursor-not-allowed opacity-70")}
                      title="Not built yet"
                    >
                      {content}
                    </div>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(baseClass, "hover:bg-[var(--panel-2)]")}
                    style={
                      active
                        ? { background: "var(--accent-soft)" }
                        : undefined
                    }
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Footer — theme toggle + workspace dot */}
      <SidebarFooter />
    </aside>
  );
}

function SidebarFooter() {
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [user, setUser] = useState<{ name?: string; email?: string; roles?: string[] } | null>(null);
  const [mode, setMode] = useState<"local" | "external">("local");

  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("rf.theme")) as "dark" | "light" | null;
    if (saved && saved !== theme) {
      setTheme(saved);
      document.documentElement.dataset.theme = saved;
    } else {
      const onHtml = document.documentElement.dataset.theme as "dark" | "light" | undefined;
      if (onHtml && onHtml !== theme) setTheme(onHtml);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setUser(d.user ?? null);
        setMode(d.mode === "external" ? "external" : "local");
      })
      .catch(() => {});
  }, []);

  function flip() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("rf.theme", next);
    } catch {
      /* ignore quota / disabled storage */
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    window.location.href = "/login";
  }

  const iconBtn = "w-8 h-8 rounded-md grid place-items-center transition-colors flex-shrink-0";
  const hoverIn = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = "var(--panel-2)";
    e.currentTarget.style.borderColor = "var(--border)";
    e.currentTarget.style.color = "var(--text)";
  };
  const hoverOut = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = "transparent";
    e.currentTarget.style.borderColor = "transparent";
    e.currentTarget.style.color = "var(--text-dim)";
  };

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2.5"
      style={{ borderTop: "1px solid var(--border)", background: "var(--panel)" }}
    >
      <div
        className="w-7 h-7 rounded-full grid place-items-center text-white text-[11px] font-semibold flex-shrink-0"
        style={{ background: "linear-gradient(135deg, oklch(0.7 0.15 25), oklch(0.6 0.15 320))" }}
      >
        {initialsOf(user?.name, user?.email)}
      </div>
      <div className="flex-1 min-w-0 leading-tight">
        <div className="text-[12.5px] font-medium truncate" style={{ color: "var(--text)" }} title={user?.email}>
          {user?.name || user?.email || "aerotoys.dev"}
        </div>
        <div className="text-[10.5px] truncate" style={{ color: "var(--text-muted)" }}>
          {user ? (user.roles && user.roles.length ? user.roles.map(titleCaseRole).join(", ") : "no role") : "local"}
        </div>
      </div>
      {user && mode === "local" ? (
        <button onClick={logout} title="Sign out" className={iconBtn} style={{ color: "var(--text-dim)", border: "1px solid transparent" }} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
          <LogOut className="w-3.5 h-3.5" />
        </button>
      ) : null}
      <button
        onClick={flip}
        title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        className={iconBtn}
        style={{ color: "var(--text-dim)", border: "1px solid transparent" }}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
      >
        {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function initialsOf(name?: string, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "AE";
}

function titleCaseRole(id: string): string {
  return id
    .split(/[-_]/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
    .join(" ");
}
