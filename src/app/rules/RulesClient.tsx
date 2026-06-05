"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import {
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Play,
  Copy,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";

export type EnrichedRule = {
  id: string;
  name: string;
  endpoint: string;
  method: string;
  status: "draft" | "review" | "published";
  category?: string;
  currentVersion: number;
  updatedAt: string;
  validity: { errors: number; warnings: number };
  testCount: number;
  tags?: string[];
};

const COLS = 9; // checkbox + rule + endpoint + status + health + v + tests + updated + menu

export function RulesClient({ rules }: { rules: EnrichedRule[] }) {
  const router = useRouter();
  const [activeStatus, setActiveStatus] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const statusCounts = useMemo(
    () => ({
      live: rules.filter((r) => r.status === "published").length,
      review: rules.filter((r) => r.status === "review").length,
      draft: rules.filter((r) => r.status === "draft").length,
    }),
    [rules],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rules.filter((r) => {
      if (activeStatus !== "All" && r.status !== activeStatus) return false;
      if (q && !(r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rules, activeStatus, query]);

  // Group the visible rules under their category — the tree replaces the old
  // browse sidebar. "Uncategorised" always sorts last.
  const grouped = useMemo(() => {
    const map = new Map<string, EnrichedRule[]>();
    for (const r of filtered) {
      const cat = r.category || "Uncategorised";
      const arr = map.get(cat);
      if (arr) arr.push(r);
      else map.set(cat, [r]);
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === "Uncategorised") return 1;
      if (b[0] === "Uncategorised") return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [filtered]);

  const toggleSel = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  };
  const toggleAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  };
  const toggleCat = (cat: string) => {
    const n = new Set(collapsed);
    if (n.has(cat)) n.delete(cat);
    else n.add(cat);
    setCollapsed(n);
  };

  async function del(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This permanently removes the rule from the workspace.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rules/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "Delete failed");
        return;
      }
      toast.success(`Deleted "${name}"`);
      setMenuFor(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(id: string) {
    setBusy(true);
    setMenuFor(null);
    try {
      const res = await fetch(`/api/rules/${encodeURIComponent(id)}`);
      if (!res.ok) {
        toast.error("Couldn't read the rule to duplicate");
        return;
      }
      const { rule } = await res.json();
      let newId = "";
      for (let n = 2; n <= 30; n++) {
        const cand = `${id}-copy${n === 2 ? "" : `-${n}`}`;
        const probe = await fetch(`/api/rules/${encodeURIComponent(cand)}`);
        if (probe.status === 404) { newId = cand; break; }
      }
      if (!newId) {
        toast.error("Couldn't find an available id");
        return;
      }
      const copy = {
        ...rule,
        id: newId,
        name: `${rule.name} (copy)`,
        status: "draft",
        currentVersion: 1,
        updatedAt: new Date().toISOString(),
      };
      const w = await fetch(`/api/rules/${encodeURIComponent(newId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(copy),
      });
      if (!w.ok) {
        toast.error("Duplicate failed");
        return;
      }
      toast.success(`Duplicated as "${copy.name}"`);
      router.push(`/rules/${encodeURIComponent(newId)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Rules</h1>
          <p>
            Author rule graphs that the RuleForge engine evaluates at request time. Grouped by
            category — search or filter by status, then open one to edit, test, or manage it.
          </p>
        </div>
        <div className="actions">
          <Link href="/rules/new">
            <button className="btn primary">
              <Plus /> New rule
            </button>
          </Link>
        </div>
      </div>

      <div className="tbl-wrap" style={{ minWidth: 0 }}>
        <div className="tbl-toolbar">
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ fontWeight: 600, letterSpacing: "-0.01em", fontSize: 14 }}>
              {activeStatus === "All" ? "All rules" : `Status · ${activeStatus === "published" ? "Live" : activeStatus}`}
            </div>
            <div className="hint" style={{ fontSize: 11.5 }}>
              {filtered.length} {filtered.length === 1 ? "rule" : "rules"} · {grouped.length}{" "}
              {grouped.length === 1 ? "category" : "categories"}
            </div>
          </div>

          <div className="input-wrap" style={{ marginLeft: "auto", flex: "0 1 240px" }}>
            <Search />
            <input
              className="input with-icon"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="seg">
            {["All", "published", "review", "draft"].map((s) => (
              <button
                key={s}
                className={activeStatus === s ? "on" : ""}
                onClick={() => setActiveStatus(s)}
                style={{ textTransform: s === "All" ? "none" : "capitalize" }}
                title={
                  s === "published"
                    ? `${statusCounts.live} live`
                    : s === "review"
                    ? `${statusCounts.review} in review`
                    : s === "draft"
                    ? `${statusCounts.draft} drafts`
                    : `${rules.length} total`
                }
              >
                {s === "published" ? "Live" : s}
              </button>
            ))}
          </div>

          {selected.size > 0 && (
            <div
              className="flex gap-2 items-center"
              style={{ borderLeft: "1px solid var(--border)", paddingLeft: 8, marginLeft: 4 }}
            >
              <span className="hint">{selected.size} selected</span>
              <button className="btn sm">Deploy</button>
              <button className="btn sm">Pause</button>
              <button className="btn sm danger">Archive</button>
            </div>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="hint" style={{ padding: 32, textAlign: "center" }}>
            No rules match the current filter.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <div
                      className={cn("checkbox", selected.size === filtered.length && filtered.length ? "checked" : "")}
                      onClick={toggleAll}
                    />
                  </th>
                  <th>Rule</th>
                  <th>Endpoint</th>
                  <th>Status</th>
                  <th>Health</th>
                  <th className="num">v</th>
                  <th className="num">Tests</th>
                  <th>Updated</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {grouped.map(([cat, rs]) => {
                  const isCollapsed = collapsed.has(cat);
                  return (
                    <Fragment key={cat}>
                      <tr
                        className="cat-row"
                        onClick={() => toggleCat(cat)}
                        style={{ cursor: "pointer", background: "var(--panel-2)" }}
                      >
                        <td colSpan={COLS} style={{ padding: "6px 12px" }}>
                          <span className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                            {isCollapsed ? (
                              <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
                            )}
                            {cat}
                            <span
                              className="tree-count"
                              style={{
                                fontSize: 10.5,
                                fontWeight: 500,
                                color: "var(--text-muted)",
                                background: "var(--panel)",
                                borderRadius: 999,
                                padding: "0 7px",
                                marginLeft: 2,
                              }}
                            >
                              {rs.length}
                            </span>
                          </span>
                        </td>
                      </tr>

                      {!isCollapsed &&
                        rs.map((r) => (
                          <tr key={r.id} className={selected.has(r.id) ? "selected" : ""}>
                            <td>
                              <div
                                className={cn("checkbox", selected.has(r.id) ? "checked" : "")}
                                onClick={() => toggleSel(r.id)}
                              />
                            </td>
                            <td>
                              <Link
                                href={`/rules/${encodeURIComponent(r.id)}`}
                                style={{ display: "flex", flexDirection: "column", gap: 1 }}
                              >
                                <span className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                                  {r.id}
                                </span>
                                <span style={{ fontWeight: 500, letterSpacing: "-0.005em", color: "var(--text)" }}>
                                  {r.name}
                                </span>
                              </Link>
                            </td>
                            <td className="mono" style={{ fontSize: 12 }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: "var(--panel-2)",
                                  color: "var(--text-muted)",
                                  marginRight: 6,
                                }}
                              >
                                {r.method}
                              </span>
                              <span style={{ color: "var(--text-dim)" }}>{r.endpoint}</span>
                            </td>
                            <td>
                              <StatusBadge status={r.status} />
                            </td>
                            <td>
                              <ValidityPill validity={r.validity} />
                            </td>
                            <td className="num mono">
                              <span style={{ color: "var(--text-muted)" }}>v</span>
                              {r.currentVersion}
                            </td>
                            <td className="num mono">
                              {r.testCount === 0 ? (
                                <span style={{ color: "var(--text-faint)" }}>—</span>
                              ) : (
                                r.testCount
                              )}
                            </td>
                            <td className="muted">{new Date(r.updatedAt).toLocaleDateString()}</td>
                            <td style={{ position: "relative", width: 40 }}>
                              <button
                                className="icon-btn"
                                style={{ width: 24, height: 24 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuFor(menuFor === r.id ? null : r.id);
                                }}
                                title="Actions"
                                aria-label="Row actions"
                              >
                                <MoreHorizontal width={14} height={14} />
                              </button>
                              {menuFor === r.id ? (
                                <>
                                  <div className="fixed inset-0" style={{ zIndex: 30 }} onClick={() => setMenuFor(null)} />
                                  <div
                                    style={{
                                      position: "absolute",
                                      right: 8,
                                      top: 30,
                                      zIndex: 31,
                                      minWidth: 156,
                                      background: "var(--popover)",
                                      border: "1px solid var(--border)",
                                      borderRadius: 8,
                                      boxShadow: "var(--shadow-md)",
                                      overflow: "hidden",
                                      padding: 4,
                                    }}
                                  >
                                    <MenuItem icon={Pencil} label="Edit" onClick={() => router.push(`/rules/${encodeURIComponent(r.id)}`)} />
                                    <MenuItem icon={Play} label="Test" onClick={() => router.push(`/rules/${encodeURIComponent(r.id)}?test=1`)} />
                                    <MenuItem icon={Copy} label="Duplicate" disabled={busy} onClick={() => duplicate(r.id)} />
                                    <MenuItem icon={Trash2} label="Delete" danger disabled={busy} onClick={() => del(r.id, r.name)} />
                                  </div>
                                </>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 text-left transition-colors"
      style={{
        fontSize: 12.5,
        padding: "6px 8px",
        borderRadius: 6,
        color: danger ? "var(--danger)" : "var(--text)",
        background: "transparent",
        border: 0,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = danger ? "var(--danger-soft)" : "var(--panel-2)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function ValidityPill({ validity }: { validity: { errors: number; warnings: number } }) {
  if (validity.errors === 0 && validity.warnings === 0) {
    return (
      <span className="status-badge live" title="No validation issues." style={{ fontSize: 10.5 }}>
        <CheckCircle2 className="w-2.5 h-2.5" />
        Valid
      </span>
    );
  }
  const tone = validity.errors > 0 ? "fail" : "review";
  const label =
    validity.errors > 0
      ? `${validity.errors} ${validity.errors === 1 ? "error" : "errors"}`
      : `${validity.warnings} ${validity.warnings === 1 ? "warning" : "warnings"}`;
  return (
    <span
      className={`status-badge ${tone}`}
      title={`${validity.errors} error${validity.errors === 1 ? "" : "s"}, ${validity.warnings} warning${validity.warnings === 1 ? "" : "s"}`}
      style={{ fontSize: 10.5 }}
    >
      <AlertTriangle className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}
