"use client";

import { useMemo, useState } from "react";
import {
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  Search,
  Terminal,
  Folder,
  Server,
  FileCode,
  Globe,
  AlertCircle,
  RefreshCw,
  Loader2,
  Upload,
  Download,
  Database,
} from "lucide-react";
import { toast } from "sonner";

type RuleSummary = {
  id: string;
  name: string;
  method: string;
  endpoint: string;
  version: number;
};

type Props = {
  root: string;
  cliProject: string | null;
  engineCliPath: string | null;
  engineUrl: string | null;
  documentForgeUrl: string | null;
  rules: RuleSummary[];
};

/**
 * The fixtures directory the editor stages compiled rules into — same path
 * `stageEngineFixtures` writes to. Keep this in lock-step with the staging
 * code in `src/app/api/test/route.ts`.
 */
function stagingDir(root: string): string {
  return joinPath(root, ".engine-staging");
}

function joinPath(...parts: string[]): string {
  // Windows-friendly path joiner. Mostly cosmetic — the .NET CLI accepts both
  // slash flavors; we prefer the OS-native form when rendering commands.
  return parts.join("\\").replace(/\\+/g, "\\");
}

/**
 * Wrap a string for safe inclusion as a shell arg. We default to bash-style
 * single-quote wrapping (works for POSIX shells + modern PowerShell). For
 * the Windows-specific CMD/escaped form we provide a separate `winCmd`
 * variant via the shell-toggle.
 */
function shQuote(s: string, kind: "bash" | "pwsh" | "cmd" = "bash"): string {
  if (s === "") return kind === "cmd" ? '""' : "''";
  // No special chars → no quoting needed
  if (/^[\w./\-:\\]+$/.test(s)) return s;
  if (kind === "cmd") {
    // CMD: wrap in double quotes; escape internal double quotes by doubling them
    return `"${s.replace(/"/g, '""')}"`;
  }
  if (kind === "pwsh") {
    // PowerShell single-quoted strings: escape internal single quotes by doubling
    return `'${s.replace(/'/g, "''")}'`;
  }
  // bash: single-quote, close-quote-escape-open-quote pattern for embedded '
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

type Shell = "bash" | "pwsh" | "cmd";

const SHELL_LABEL: Record<Shell, string> = {
  bash: "bash / zsh",
  pwsh: "PowerShell",
  cmd: "Windows cmd",
};

export function CommandsClient({ root, cliProject, engineCliPath, engineUrl, documentForgeUrl, rules }: Props) {
  const [shell, setShell] = useState<Shell>("bash");
  const [query, setQuery] = useState("");
  const [reloading, setReloading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [pushingDf, setPushingDf] = useState(false);
  const [pullingDf, setPullingDf] = useState(false);

  async function pushToDocumentForge() {
    setPushingDf(true);
    try {
      const res = await fetch("/api/sync/push-to-documentforge", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Push failed");
        return;
      }
      const n = data.totalInserted ?? 0;
      const errs = (data.errors ?? []).length;
      const cols = Object.entries(data.collections ?? {})
        .map(([k, v]) => `${k}=${(v as { inserted: number }).inserted}`)
        .join(" · ");
      if (errs > 0) {
        toast.warning(`Pushed ${n} docs to db '${data.database}' with ${errs} errors. ${cols}`);
      } else {
        toast.success(`Pushed ${n} docs to db '${data.database}'. ${cols}`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPushingDf(false);
    }
  }

  async function pullFromDocumentForge() {
    if (!confirm(
      "Pull all entities from DocumentForge into this workspace's filesystem? Local files for the same ids will be OVERWRITTEN; local files not in DocumentForge are left alone.",
    )) return;
    setPullingDf(true);
    try {
      const res = await fetch("/api/sync/pull-from-documentforge", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Pull failed");
        return;
      }
      const n = data.totalPulled ?? 0;
      const errs = (data.errors ?? []).length;
      const cols = Object.entries(data.collections ?? {})
        .map(([k, v]) => `${k}=${(v as { written: number }).written}`)
        .filter((s) => !s.endsWith("=0"))
        .join(" · ");
      if (errs > 0) {
        toast.warning(`Pulled ${n} docs from '${data.database}' with ${errs} errors. ${cols}`);
      } else {
        toast.success(`Pulled ${n} docs from '${data.database}'. ${cols}`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPullingDf(false);
    }
  }

  async function flattenRules() {
    if (!confirm(
      "Convert any legacy directory-layout rules in this workspace to the flat `rules/<id>.json` shape? "
      + "Existing flat rules are left alone. Directory rules are read, written as flat files, then the directories are removed.",
    )) return;
    setMigrating(true);
    try {
      const res = await fetch("/api/migrate/flatten-rules", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Migration failed");
        return;
      }
      const n = (data.flattened ?? []).length;
      const errs = (data.errors ?? []).length;
      if (n === 0 && errs === 0) {
        toast.info("Already flat — nothing to migrate.");
      } else if (errs > 0) {
        toast.warning(`Flattened ${n} rules; ${errs} errors.`);
      } else {
        toast.success(`Flattened ${n} rules to single-document form.`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setMigrating(false);
    }
  }

  async function reloadEngine() {
    setReloading(true);
    try {
      const res = await fetch("/api/engine/reload", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Reload failed");
        return;
      }
      toast.success(`Engine reloaded via ${data.url ?? "admin endpoint"}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setReloading(false);
    }
  }

  const filteredRules = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter((r) =>
      r.id.toLowerCase().includes(q)
      || r.name.toLowerCase().includes(q)
      || r.endpoint.toLowerCase().includes(q),
    );
  }, [rules, query]);

  const fixtures = stagingDir(root);

  // ── Top-level engine commands (don't need a specific rule) ────────────
  // `run` is the only subcommand we know FOR SURE works (the editor's Test
  // panel uses it). Others we list with caution — the engine CLI's subcommand
  // surface may or may not include them. Comments in the command call out
  // what's confirmed vs experimental.
  const runRuleTemplate = (r: RuleSummary, payload: string): string[] => {
    const projectArg = cliProject ?? "<engineCliPath>/src/RuleForge.Cli";
    const args = [
      "dotnet", "run", "--no-build", "--project", projectArg,
      "--",
      "run",
      "--endpoint", r.endpoint,
      "--request", payload,
      "--fixtures", fixtures,
      "--debug",
    ];
    return args;
  };

  function renderCmd(args: string[]): string {
    return args.map((a) => shQuote(a, shell)).join(" ");
  }

  return (
    <div
      className="flex-1 overflow-auto"
      style={{ padding: "8px 28px 80px", background: "var(--bg)" }}
    >
      {/* Setup status — green/red ticks at a glance so the user knows what's
          ready vs needs configuring before any command will work. */}
      <section
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          padding: 18,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 12,
          }}
        >
          <div className="field-label">Setup</div>
          <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Shell:</span>
            <div className="pill-toggle">
              {(["bash", "pwsh", "cmd"] as Shell[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setShell(k)}
                  className={shell === k ? "on" : ""}
                >
                  {SHELL_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <StatusRow
            icon={<Folder className="w-3.5 h-3.5" />}
            label="Workspace"
            value={root}
            ok={true}
          />
          <StatusRow
            icon={<FileCode className="w-3.5 h-3.5" />}
            label="Engine CLI"
            value={engineCliPath ?? "(not configured — set in Settings → Engine runtime)"}
            ok={!!engineCliPath}
          />
          <StatusRow
            icon={<Server className="w-3.5 h-3.5" />}
            label="Engine URL"
            value={engineUrl ?? "(not configured — only needed if you'll hit a running engine over HTTP)"}
            ok={!!engineUrl}
            optional={!engineUrl}
          />
          <StatusRow
            icon={<Globe className="w-3.5 h-3.5" />}
            label="DocumentForge URL"
            value={documentForgeUrl ?? "(not configured — only needed for DocumentForge handoff)"}
            ok={!!documentForgeUrl}
            optional={!documentForgeUrl}
          />
          <StatusRow
            icon={<Folder className="w-3.5 h-3.5" />}
            label="Fixtures staging"
            value={fixtures}
            ok={true}
            hint="The editor writes engine-shaped rule JSON here whenever you Test a rule. Engine commands point at this directory."
          />
        </div>
      </section>

      {/* Storage migration — one-click flattener for legacy rule directories. */}
      <section style={{ marginBottom: 18 }}>
        <SectionHeader
          icon={<FileCode className="w-3.5 h-3.5" />}
          title="Storage layout"
          subtitle="Rules are stored as one document per file — `rules/<id>.json`. Older workspaces used a directory per rule (rule.json + sibling sub-files); this button upgrades them in place."
        />
        <div
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          <header
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              background: "var(--panel-2)",
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: "var(--text)" }}>
                Flatten rule directories → single-document files
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.45 }}>
                Idempotent. Each directory rule is read fully (schemas, bindings, tests), rewritten as `rules/&lt;id&gt;.json`, and the old directory removed. Already-flat rules are skipped.
              </div>
            </div>
            <button
              type="button"
              className="btn primary sm"
              style={{ height: 24, padding: "0 10px", fontSize: 11 }}
              onClick={flattenRules}
              disabled={migrating}
            >
              {migrating ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileCode className="w-3 h-3" />}
              {migrating ? "Flattening…" : "Flatten now"}
            </button>
          </header>
          <pre
            style={{
              margin: 0,
              padding: "12px 14px",
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
              lineHeight: 1.55,
              color: "var(--text-muted)",
              background: "var(--bg)",
              whiteSpace: "pre-wrap",
            }}
          >
{`Before:                            After:
rules/markets-discount/            rules/markets-discount.json
  rule.json
  rule.engine.json
  schema/input.json
  schema/output.json
  bindings/n2.json
  bindings/n3.json
  tests/match.json`}
          </pre>
        </div>
      </section>

      {/* DocumentForge sync — push/pull the workspace between filesystem and
          a DocumentForge instance. Filesystem stays the authoring surface;
          DocumentForge is the durable store + (future) engine source. */}
      {documentForgeUrl ? (
        <section style={{ marginBottom: 18 }}>
          <SectionHeader
            icon={<Database className="w-3.5 h-3.5" />}
            title="DocumentForge sync"
            subtitle="Push every rule / schema / template / asset / ref / node from this workspace into a DocumentForge database, or pull them back. Idempotent — collections are cleared then bulk-inserted on push; pulls write through the editor's normal save path."
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <ActionCard
              title="Push workspace → DocumentForge"
              description="Read every entity locally, clear the matching DocumentForge collection, bulk-insert. Database name comes from Settings → DocumentForge database (falls back to workspace name)."
              actionLabel="Push now"
              actionIcon={<Upload className="w-3 h-3" />}
              loading={pushingDf}
              onAction={pushToDocumentForge}
            />
            <ActionCard
              title="Pull DocumentForge → workspace"
              description="Read every collection from DocumentForge and write through the editor's writers. Existing local files for the same ids are overwritten; local-only files are kept."
              actionLabel="Pull now"
              actionIcon={<Download className="w-3 h-3" />}
              actionVariant="ghost"
              loading={pullingDf}
              onAction={pullFromDocumentForge}
            />
          </div>
          <pre
            style={{
              margin: "12px 0 0",
              padding: "12px 14px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              lineHeight: 1.55,
              color: "var(--text-muted)",
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 7,
              whiteSpace: "pre-wrap",
            }}
          >
{`# Equivalent shell calls:
${renderCmd(["curl", "-sS", "-X", "POST", `${documentForgeUrl.replace(/\/$/, "")}/databases`, "-H", "content-type: application/json", "-d", '{"name":"ruleforge","createIfMissing":true}'])}

# Push from the editor's API (handles all collections at once):
${renderCmd(["curl", "-sS", "-X", "POST", "http://localhost:3001/api/sync/push-to-documentforge"])}

# Pull back:
${renderCmd(["curl", "-sS", "-X", "POST", "http://localhost:3001/api/sync/pull-from-documentforge"])}`}
          </pre>
        </section>
      ) : null}

      {/* HTTP server (fast-path) callout — explains the ~25x speedup. */}
      <section style={{ marginBottom: 18 }}>
        <SectionHeader
          icon={<Server className="w-3.5 h-3.5" />}
          title="Fast path — engine as HTTP server"
          subtitle="Spawning dotnet per request pays ~100ms of cold-start every time. Start the engine ONCE as an HTTP server, set Engine URL in Settings, and tests drop to ~5ms."
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <CommandCard
            title="Start the engine as a long-running HTTP server"
            description="Run this once in a terminal and leave it running. The editor's Test panel will auto-detect the running engine via the Engine URL setting and use HTTP instead of spawning dotnet per request."
            note="Subcommand name is engine-specific — confirm `serve` exists in your RuleForge.Cli or substitute the actual name. If your engine doesn't yet ship an HTTP mode, file a CLI feature request; the editor will continue to use CLI fallback in the meantime."
            command={
              cliProject
                ? renderCmd([
                    "dotnet", "run", "--no-build", "--project", cliProject,
                    "--", "serve",
                    "--fixtures", fixtures,
                    "--port", "5050",
                  ])
                : "# Engine CLI path not configured — set it in Settings → Engine runtime."
            }
            disabled={!cliProject}
          />
          <CommandCard
            title="Verify HTTP engine is reachable"
            description="Two probe endpoints — pick the right one for your check. `/health` is always 200 (k8s liveness — never fails on dependency issues). `/ready` is the meaningful one — 2s budget, hits the rule source, returns rule count + dependency status."
            command={
              engineUrl
                ? renderCmd(["curl", "-sS", `${engineUrl.replace(/\/$/, "")}/ready`])
                : `# Engine URL not configured. After starting the server above,\n# set Engine URL to http://localhost:5050 in Settings.`
            }
            note="`/ready` returns { ok, ruleSource, bindingCount, referenceSource } or 503 on failure. Both endpoints bypass auth so no API key needed from the probe."
            disabled={!engineUrl}
          />
          {engineUrl ? (
            <div
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
              }}
            >
              <header
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--panel-2)",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: "var(--text)" }}>
                    Reload the engine&apos;s in-memory rule cache
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.45 }}>
                    After editing a rule, the editor re-stages fixtures to disk — but a running engine may have older versions cached. Click to ping the engine&apos;s reload endpoint so it re-reads {fixtures}.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn primary sm"
                  style={{ height: 24, padding: "0 10px", fontSize: 11 }}
                  onClick={reloadEngine}
                  disabled={reloading}
                >
                  {reloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {reloading ? "Reloading…" : "Reload now"}
                </button>
              </header>
              <pre
                style={{
                  margin: 0,
                  padding: "12px 14px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  lineHeight: 1.55,
                  color: "var(--text-muted)",
                  background: "var(--bg)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
{`# The button above tries POST <engineUrl>/admin/reload then
# /admin/reload-fixtures then /__reload until one returns 2xx.
# Equivalent shell:
${renderCmd(["curl", "-sS", "-X", "POST", `${engineUrl.replace(/\/$/, "")}/admin/reload`])}`}
              </pre>
              <div
                style={{
                  padding: "8px 14px",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  background: "var(--panel-2)",
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <AlertCircle className="w-3 h-3 shrink-0" style={{ marginTop: 2, color: "var(--accent)" }} />
                <span>Engine-specific feature. If your engine doesn&apos;t support hot-reload yet, restart it manually (Ctrl+C the running process, re-run the start command above).</span>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Engine commands — workspace-level, not rule-specific. */}
      <section style={{ marginBottom: 18 }}>
        <SectionHeader
          icon={<Terminal className="w-3.5 h-3.5" />}
          title="CLI commands (spawn-per-test)"
          subtitle="Workspace-level dotnet invocations. Use these when no HTTP engine is running."
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <CommandCard
            title="Run a rule against staged fixtures"
            description="Confirmed working — this is what the editor's Test panel uses as a fallback when no HTTP engine is available. Substitute the request JSON with your own payload."
            note="~100–150ms per call; ~99% of that is dotnet startup, not rule eval."
            command={
              cliProject
                ? renderCmd([
                    "dotnet", "run", "--no-build", "--project", cliProject,
                    "--", "run",
                    "--endpoint", "/v1/your/endpoint",
                    "--request", '{"...":"..."}',
                    "--fixtures", fixtures,
                    "--debug",
                  ])
                : "# Engine CLI path not configured — set it in Settings → Engine runtime."
            }
            disabled={!cliProject}
          />
          <CommandCard
            title="Re-stage fixtures (rebuild engine-shaped JSON)"
            description="Manually re-compile every rule.json into the flat <id>.v<N>.json fixtures the engine consumes. The editor does this automatically before each Test run, so you only need this for ad-hoc shell scripting."
            note="The editor's Test API does this for you — use only when running the engine directly from a terminal."
            command={`# Editor regenerates ${fixtures} automatically when you click Test.\n# To trigger a fresh stage from the CLI, call the editor's POST /api/test\n# endpoint, or write a tiny script that walks /rules and calls compileRuleForEngine.`}
            isInfo
          />
        </div>
      </section>

      {/* Per-rule commands — one ready-to-paste line per rule. */}
      <section>
        <SectionHeader
          icon={<FileCode className="w-3.5 h-3.5" />}
          title={`Per-rule commands · ${rules.length}`}
          subtitle="One command per endpoint, with --endpoint and --fixtures already substituted. Replace the placeholder --request JSON with a real payload."
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 7,
            padding: "8px 12px",
          }}
        >
          <Search className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            className="input"
            style={{ flex: 1, height: 26, border: 0, background: "transparent", padding: 0 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by rule id, name, or endpoint…"
          />
          {query ? (
            <button
              type="button"
              className="btn ghost sm"
              style={{ height: 22, padding: "0 8px" }}
              onClick={() => setQuery("")}
            >
              clear
            </button>
          ) : null}
        </div>
        {filteredRules.length === 0 ? (
          <div className="struct-rows-empty">
            {rules.length === 0
              ? "No rules in this workspace yet."
              : `No rules match "${query}".`}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filteredRules.map((r) => (
              <CommandCard
                key={r.id}
                title={
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--text-muted)",
                      }}
                    >
                      {r.method} {r.endpoint}
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontSize: 10,
                        padding: "1px 5px",
                        borderRadius: 4,
                        background: "var(--panel-2)",
                        color: "var(--text-muted)",
                      }}
                    >
                      v{r.version}
                    </span>
                  </span>
                }
                description={`Runs ${r.id}@${r.version} against fixtures in ${fixtures}.`}
                command={
                  cliProject
                    ? renderCmd(runRuleTemplate(r, '{"...":"..."}'))
                    : "# Engine CLI path not configured — set it in Settings."
                }
                disabled={!cliProject}
              />
            ))}
          </div>
        )}
      </section>

      {/* HTTP — when an engine URL is configured, show a curl that hits the
          live engine over HTTP. Useful when you've got the engine running as
          a server (not invoked per-request via dotnet run). */}
      {engineUrl ? (
        <section style={{ marginTop: 22 }}>
          <SectionHeader
            icon={<Server className="w-3.5 h-3.5" />}
            title="HTTP (against running engine)"
            subtitle="Hit a live engine HTTP server with curl. Replace the JSON payload with a real request body."
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filteredRules.slice(0, 5).map((r) => {
              const url = `${engineUrl.replace(/\/$/, "")}${r.endpoint}`;
              const curlArgs = [
                "curl", "-sS",
                "-X", r.method,
                url,
                "-H", "content-type: application/json",
                "-d", '{"...":"..."}',
              ];
              return (
                <CommandCard
                  key={r.id}
                  title={
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontWeight: 600 }}>{r.name}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                        {r.method} {r.endpoint}
                      </span>
                    </span>
                  }
                  description={`Curl ${url} on the live engine. The engine must be running and have ${r.id} loaded.`}
                  command={curlArgs.map((a) => shQuote(a, shell)).join(" ")}
                />
              );
            })}
            {filteredRules.length > 5 ? (
              <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>
                Showing first 5 rules. Use the filter above to narrow to a specific endpoint.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* DocumentForge — only when configured */}
      {documentForgeUrl ? (
        <section style={{ marginTop: 22 }}>
          <SectionHeader
            icon={<Globe className="w-3.5 h-3.5" />}
            title="DocumentForge"
            subtitle="The DocumentForge URL configured in Settings."
          />
          <CommandCard
            title="DocumentForge endpoint"
            description="Use this URL for handoff bundles or remote DocumentForge calls."
            command={documentForgeUrl}
          />
        </section>
      ) : null}
    </div>
  );
}

// ── Reusable bits ───────────────────────────────────────────────────────

function ActionCard({
  title,
  description,
  actionLabel,
  actionIcon,
  actionVariant = "primary",
  loading,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  actionIcon: React.ReactNode;
  actionVariant?: "primary" | "ghost";
  loading: boolean;
  onAction: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.45 }}>
          {description}
        </div>
      </div>
      <button
        type="button"
        className={`btn ${actionVariant === "primary" ? "primary" : "ghost"} sm`}
        style={{ alignSelf: "flex-start" }}
        onClick={onAction}
        disabled={loading}
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : actionIcon}
        {loading ? "Working…" : actionLabel}
      </button>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: React.ReactNode; subtitle?: string }) {
  return (
    <header style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "-0.005em",
          color: "var(--text)",
        }}
      >
        <span style={{ color: "var(--accent)" }}>{icon}</span>
        {title}
      </div>
      {subtitle ? (
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.45 }}>
          {subtitle}
        </div>
      ) : null}
    </header>
  );
}

function StatusRow({
  icon,
  label,
  value,
  ok,
  optional,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ok: boolean;
  optional?: boolean;
  hint?: string;
}) {
  const color = ok ? "var(--success)" : optional ? "var(--text-muted)" : "var(--warn)";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "20px 130px 1fr",
        gap: 10,
        alignItems: "center",
      }}
    >
      <span style={{ color }}>
        {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : optional ? <AlertCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
      </span>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "var(--text-muted)" }}>{icon}</span>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          className="mono"
          style={{
            fontSize: 11.5,
            color: ok ? "var(--text)" : "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            wordBreak: "break-all",
          }}
        >
          {value}
        </div>
        {hint ? (
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.4 }}>
            {hint}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CommandCard({
  title,
  description,
  command,
  note,
  disabled,
  isInfo,
}: {
  title: React.ReactNode;
  description?: string;
  command: string;
  note?: string;
  disabled?: boolean;
  isInfo?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      toast.success("Command copied to clipboard");
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("Couldn't access clipboard — copy manually.");
    }
  }

  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <header
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--panel-2)",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: "var(--text)" }}>{title}</div>
          {description ? (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.45 }}>
              {description}
            </div>
          ) : null}
        </div>
        {!isInfo ? (
          <button
            type="button"
            className="btn ghost sm"
            style={{ height: 24, padding: "0 8px", fontSize: 11 }}
            onClick={copy}
            disabled={disabled}
            title="Copy command to clipboard"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        ) : null}
      </header>
      <pre
        style={{
          margin: 0,
          padding: "12px 14px",
          fontFamily: "var(--font-mono)",
          fontSize: 11.5,
          lineHeight: 1.55,
          color: isInfo ? "var(--text-muted)" : "var(--text)",
          background: "var(--bg)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {command}
      </pre>
      {note ? (
        <div
          style={{
            padding: "8px 14px",
            fontSize: 11,
            color: "var(--text-muted)",
            background: "var(--panel-2)",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <AlertCircle className="w-3 h-3 shrink-0" style={{ marginTop: 2, color: "var(--accent)" }} />
          <span>{note}</span>
        </div>
      ) : null}
    </div>
  );
}
