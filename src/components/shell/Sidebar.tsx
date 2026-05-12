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
  Play,
  History,
  Plug,
  Users,
  Sun,
  Moon,
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
  { href: "/test",       label: "Test runner",   icon: Play,            group: "workspace" },
  { href: "/audit",      label: "Audit log",     icon: History,         group: "workspace", disabled: true },

  // Data — what rules consume
  { href: "/nodes",      label: "Nodes",         icon: Boxes,           group: "data" },
  { href: "/templates",  label: "Templates",     icon: LayoutTemplate,  group: "data" },
  { href: "/assets",     label: "Assets",        icon: Package,         group: "data" },
  { href: "/references", label: "References",    icon: Database,        group: "data" },
  { href: "/samples",    label: "Samples",       icon: FlaskConical,    group: "data" },

  // Configure — system surface
  { href: "/integrations", label: "Integrations", icon: Plug,           group: "configure", disabled: true },
  { href: "/team",         label: "Team & roles", icon: Users,          group: "configure", disabled: true },
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
                const active =
                  pathname === item.href ||
                  (item.href !== "/" && pathname?.startsWith(item.href + "/"));
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
  // The data-theme attribute is set on <html> at SSR. Drive a small client
  // toggle that flips it. Persist to localStorage so a reload keeps the choice.
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("rf.theme")) as
      | "dark"
      | "light"
      | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.dataset.theme = saved;
    }
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

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2.5"
      style={{ borderTop: "1px solid var(--border)", background: "var(--panel)" }}
    >
      <div
        className="w-7 h-7 rounded-full grid place-items-center text-white text-[11px] font-semibold flex-shrink-0"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.7 0.15 25), oklch(0.6 0.15 320))",
        }}
      >
        AE
      </div>
      <div className="flex-1 min-w-0 leading-tight">
        <div
          className="text-[12.5px] font-medium truncate"
          style={{ color: "var(--text)" }}
        >
          aerotoys.dev
        </div>
        <div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
          local
        </div>
      </div>
      <button
        onClick={flip}
        title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        className="w-8 h-8 rounded-md grid place-items-center transition-colors"
        style={{
          color: "var(--text-dim)",
          border: "1px solid transparent",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--panel-2)";
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.color = "var(--text)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.borderColor = "transparent";
          e.currentTarget.style.color = "var(--text-dim)";
        }}
      >
        {theme === "dark" ? (
          <Sun className="w-3.5 h-3.5" />
        ) : (
          <Moon className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}
