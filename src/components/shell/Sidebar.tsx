"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileCog,
  Boxes,
  FlaskConical,
  Database,
  Settings,
  Hammer,
  FolderOpen,
} from "lucide-react";
import { useWorkspace } from "./WorkspaceProvider";
import { cn } from "@/lib/utils";

type Item = {
  href: string;
  label: string;
  icon: typeof FileCog;
  group: "build" | "data" | "system";
};

const ITEMS: Item[] = [
  { href: "/rules", label: "Rules", icon: FileCog, group: "build" },
  { href: "/nodes", label: "Nodes", icon: Boxes, group: "build" },
  { href: "/references", label: "References", icon: Database, group: "data" },
  { href: "/samples", label: "Samples", icon: FlaskConical, group: "data" },
  { href: "/settings", label: "Settings", icon: Settings, group: "system" },
];

const GROUP_LABELS: Record<Item["group"], string> = {
  build: "Build",
  data: "Data",
  system: "",
};

export function Sidebar() {
  const pathname = usePathname();
  const { rootPath } = useWorkspace();
  const workspaceName = rootPath ? rootPath.split(/[\\/]/).filter(Boolean).pop() : null;

  const groups: Item["group"][] = ["build", "data", "system"];

  return (
    <aside className="w-56 shrink-0 flex flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="h-14 px-4 flex items-center gap-2 border-b border-sidebar-border">
        <div className="w-7 h-7 rounded-md bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center">
          <Hammer className="w-3.5 h-3.5" strokeWidth={2.25} />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] font-semibold tracking-tight">RuleForge</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Editor</span>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 flex flex-col gap-3 overflow-y-auto">
        {groups.map((group) => {
          const items = ITEMS.filter((i) => i.group === group);
          if (items.length === 0) return null;
          const label = GROUP_LABELS[group];
          return (
            <div key={group} className="flex flex-col gap-0.5">
              {label && (
                <div className="px-2.5 mb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                  {label}
                </div>
              )}
              {items.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", active ? "" : "opacity-80")} strokeWidth={active ? 2.1 : 1.8} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-sidebar-border">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 font-medium">
          Workspace
        </div>
        {workspaceName ? (
          <Link
            href="/settings"
            className="flex items-center gap-2 text-[12px] truncate hover:text-sidebar-accent-foreground transition-colors"
            title={rootPath ?? undefined}
          >
            <FolderOpen className="w-3.5 h-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
            <span className="truncate font-medium">{workspaceName}</span>
          </Link>
        ) : (
          <Link
            href="/settings"
            className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-sidebar-accent-foreground transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
            <span>Pick a folder</span>
          </Link>
        )}
      </div>
    </aside>
  );
}
