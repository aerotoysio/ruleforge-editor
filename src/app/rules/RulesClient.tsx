"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Zap,
  List,
  ChevronRight,
  MoreHorizontal,
} from "lucide-react";
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

type ActiveNode =
  | { kind: "all" }
  | { kind: "category"; name: string };

export function RulesClient({ rules }: { rules: EnrichedRule[] }) {
  const [activeNode, setActiveNode] = useState<ActiveNode>({ kind: "all" });
  const [activeStatus, setActiveStatus] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Build a {category: count} map for the tree.
  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rules) {
      const key = r.category || "Uncategorised";
      c[key] = (c[key] ?? 0) + 1;
    }
    return c;
  }, [rules]);

  const filtered = useMemo(() => {
    return rules.filter((r) => {
      const cat = r.category || "Uncategorised";
      if (activeNode.kind === "category" && cat !== activeNode.name) return false;
      if (activeStatus !== "All" && r.status !== activeStatus) return false;
      if (
        query &&
        !(
          r.id.toLowerCase().includes(query.toLowerCase()) ||
          r.name.toLowerCase().includes(query.toLowerCase())
        )
      )
        return false;
      return true;
    });
  }, [rules, activeNode, activeStatus, query]);

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

  const statusCounts = useMemo(() => {
    return {
      live: rules.filter((r) => r.status === "published").length,
      review: rules.filter((r) => r.status === "review").length,
      draft: rules.filter((r) => r.status === "draft").length,
    };
  }, [rules]);

  const isActive = (test: ActiveNode) => JSON.stringify(test) === JSON.stringify(activeNode);

  const breadcrumb =
    activeNode.kind === "all"
      ? activeStatus === "All"
        ? "All rules"
        : `Status · ${activeStatus}`
      : activeNode.name;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Rules</h1>
          <p>
            Author rule graphs that the RuleForge engine evaluates at request time. Filter
            by category, status, or search — open one to edit its DAG.
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

      <div className="rules-layout">
        {/* CATEGORY TREE */}
        <aside className="rules-tree">
          <div className="tree-head">
            <span
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-muted)",
                fontWeight: 500,
              }}
            >
              Browse
            </span>
          </div>
          <div className="tree-body">
            <div
              className={cn("tree-row top", isActive({ kind: "all" }) && activeStatus === "All" ? "active" : "")}
              onClick={() => {
                setActiveNode({ kind: "all" });
                setActiveStatus("All");
              }}
            >
              <List className="tree-icon" />
              <span>All rules</span>
              <span className="tree-count">{rules.length}</span>
            </div>

            <div
              className={cn("tree-row top", activeStatus === "published" ? "active" : "")}
              onClick={() => {
                setActiveNode({ kind: "all" });
                setActiveStatus("published");
              }}
            >
              <span
                className="dot"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--success)",
                  boxShadow: "0 0 0 3px var(--success-soft)",
                }}
              />
              <span>Live only</span>
              <span className="tree-count">{statusCounts.live}</span>
            </div>
            <div
              className={cn("tree-row top", activeStatus === "review" ? "active" : "")}
              onClick={() => {
                setActiveNode({ kind: "all" });
                setActiveStatus("review");
              }}
            >
              <span
                className="dot"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--warn)",
                }}
              />
              <span>Needs review</span>
              <span className="tree-count">{statusCounts.review}</span>
            </div>
            <div
              className={cn("tree-row top", activeStatus === "draft" ? "active" : "")}
              onClick={() => {
                setActiveNode({ kind: "all" });
                setActiveStatus("draft");
              }}
            >
              <span
                className="dot"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--text-faint)",
                }}
              />
              <span>Drafts</span>
              <span className="tree-count">{statusCounts.draft}</span>
            </div>

            <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />

            {Object.entries(categoryCounts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([cat, n]) => (
                <div
                  key={cat}
                  className={cn(
                    "tree-row top",
                    isActive({ kind: "category", name: cat }) ? "active" : "",
                  )}
                  onClick={() => {
                    setActiveNode({ kind: "category", name: cat });
                    setActiveStatus("All");
                  }}
                >
                  <ChevronRight className="tree-icon" style={{ opacity: 0.5 }} />
                  <span style={{ fontWeight: 500 }}>{cat}</span>
                  <span className="tree-count">{n}</span>
                </div>
              ))}

            <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />
            <div className="tree-row top" title="Coming soon">
              <Zap className="tree-icon" style={{ color: "var(--accent)" }} />
              <span style={{ color: "var(--text-dim)" }}>Smart group · High traffic</span>
              <span className="tree-count">—</span>
            </div>
          </div>
        </aside>

        {/* TABLE */}
        <div className="tbl-wrap" style={{ minWidth: 0 }}>
          <div className="tbl-toolbar">
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ fontWeight: 600, letterSpacing: "-0.01em", fontSize: 14 }}>
                {breadcrumb}
              </div>
              <div className="hint" style={{ fontSize: 11.5 }}>
                {filtered.length} {filtered.length === 1 ? "rule" : "rules"}
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
                >
                  {s === "published" ? "Live" : s}
                </button>
              ))}
            </div>

            {selected.size > 0 && (
              <div
                className="flex gap-2 items-center"
                style={{
                  borderLeft: "1px solid var(--border)",
                  paddingLeft: 8,
                  marginLeft: 4,
                }}
              >
                <span className="hint">{selected.size} selected</span>
                <button className="btn sm">Deploy</button>
                <button className="btn sm">Pause</button>
                <button className="btn sm danger">Archive</button>
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <div
              className="hint"
              style={{ padding: 32, textAlign: "center" }}
            >
              No rules match the current filter.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <div
                        className={cn(
                          "checkbox",
                          selected.size === filtered.length && filtered.length
                            ? "checked"
                            : "",
                        )}
                        onClick={toggleAll}
                      />
                    </th>
                    <th>Rule</th>
                    <th>Endpoint</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Health</th>
                    <th className="num">v</th>
                    <th className="num">Tests</th>
                    <th>Updated</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className={selected.has(r.id) ? "selected" : ""}>
                      <td>
                        <div
                          className={cn(
                            "checkbox",
                            selected.has(r.id) ? "checked" : "",
                          )}
                          onClick={() => toggleSel(r.id)}
                        />
                      </td>
                      <td>
                        <Link
                          href={`/rules/${encodeURIComponent(r.id)}`}
                          style={{ display: "flex", flexDirection: "column", gap: 1 }}
                        >
                          <span
                            className="mono"
                            style={{ fontSize: 11.5, color: "var(--text-muted)" }}
                          >
                            {r.id}
                          </span>
                          <span
                            style={{
                              fontWeight: 500,
                              letterSpacing: "-0.005em",
                              color: "var(--text)",
                            }}
                          >
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
                        <span style={{ color: "var(--text-dim)" }}>
                          {r.category || "—"}
                        </span>
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
                      <td className="muted">
                        {new Date(r.updatedAt).toLocaleDateString()}
                      </td>
                      <td>
                        <button
                          className="icon-btn"
                          style={{ width: 24, height: 24 }}
                        >
                          <MoreHorizontal width={14} height={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ValidityPill({ validity }: { validity: { errors: number; warnings: number } }) {
  if (validity.errors === 0 && validity.warnings === 0) {
    return (
      <span
        className="status-badge live"
        title="No validation issues."
        style={{ fontSize: 10.5 }}
      >
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
