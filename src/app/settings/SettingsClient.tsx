"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Folder, FolderPlus, Save, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";

type Initial = {
  rootPath: string | null;
  recentRoots: string[];
  engineUrl: string;
  engineCliPath: string;
  documentForgeUrl: string;
  ollamaUrl: string;
  ollamaModel: string;
  workspaceName: string | null;
};

type Group = "workspace" | "engine" | "ai" | "future";

const GROUPS: { id: Group; label: string; desc: string }[] = [
  { id: "workspace", label: "Workspace",     desc: "Identity, rules location, recent paths." },
  { id: "engine",    label: "Engine runtime", desc: "Local CLI and HTTP endpoints." },
  { id: "ai",        label: "AI assistant",   desc: "Local Ollama for AI-draft rule authoring." },
  { id: "future",    label: "Coming soon",    desc: "Hooks for shadow mode, audit, integrations." },
];

export function SettingsClient({ initial }: { initial: Initial }) {
  const router = useRouter();
  const { refresh } = useWorkspace();
  const [activeGroup, setActiveGroup] = useState<Group>("workspace");

  const [rootPath, setRootPath] = useState(initial.rootPath ?? "");
  const [engineUrl, setEngineUrl] = useState(initial.engineUrl);
  const [engineCliPath, setEngineCliPath] = useState(initial.engineCliPath);
  const [documentForgeUrl, setDocumentForgeUrl] = useState(initial.documentForgeUrl);
  const [ollamaUrl, setOllamaUrl] = useState(initial.ollamaUrl || "http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState(initial.ollamaModel);
  const [models, setModels] = useState<{ name: string; size?: number }[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [needsSeed, setNeedsSeed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Single dirty flag — covers every setting on the page. Save commits all at
  // once; per-row save/discard isn't worth the UI weight at this scale.
  const dirty = useMemo(() => {
    return (
      rootPath !== (initial.rootPath ?? "") ||
      engineUrl !== initial.engineUrl ||
      engineCliPath !== initial.engineCliPath ||
      documentForgeUrl !== initial.documentForgeUrl ||
      ollamaUrl !== (initial.ollamaUrl || "http://localhost:11434") ||
      ollamaModel !== initial.ollamaModel
    );
  }, [rootPath, engineUrl, engineCliPath, documentForgeUrl, ollamaUrl, ollamaModel, initial]);

  async function loadModels() {
    setModelsError(null);
    try {
      const res = await fetch("/api/ai/models");
      const data = await res.json();
      if (!res.ok) {
        setModelsError(data.error ?? `Status ${res.status}`);
        setModels([]);
        return;
      }
      setModels(data.models ?? []);
    } catch (e) {
      setModelsError((e as Error).message);
    }
  }

  async function save(seed = false) {
    if (!rootPath.trim()) {
      toast.error("Pick a folder first");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rootPath: rootPath.trim(),
          engineUrl: engineUrl.trim() || null,
          engineCliPath: engineCliPath.trim() || null,
          documentForgeUrl: documentForgeUrl.trim() || null,
          ollamaUrl: ollamaUrl.trim() || null,
          ollamaModel: ollamaModel.trim() || null,
          seed,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsSeed) {
          setNeedsSeed(true);
          toast(`Folder is empty — click "Initialize workspace" to seed it.`);
          return;
        }
        toast.error(data.error ?? "Could not save settings");
        return;
      }
      setNeedsSeed(false);
      toast.success(seed ? "Workspace initialized" : "Settings saved");
      await refresh();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Where rules live, which engine CLI evaluates them, and which local AI helps you draft new ones."
        actions={
          dirty ? (
            <button className="btn primary" onClick={() => save(false)} disabled={busy}>
              <Save className="w-3.5 h-3.5" /> {busy ? "Saving…" : "Save changes"}
            </button>
          ) : null
        }
      />
      <div
        className="flex-1 overflow-auto"
        style={{ padding: "8px 28px 80px", background: "var(--bg)" }}
      >
        <div className="settings-layout">
          {/* LEFT NAV — group rail */}
          <aside className="settings-nav">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                onClick={() => setActiveGroup(g.id)}
                className={`settings-nav-item ${activeGroup === g.id ? "on" : ""}`}
              >
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{g.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.3 }}>
                  {g.desc}
                </div>
              </button>
            ))}
          </aside>

          {/* RIGHT PANE — grouped settings tables */}
          <div className="settings-main">
            {activeGroup === "workspace" ? (
              <SettingsGroup
                title="Workspace"
                desc="Folder where rules, schemas, templates, and assets live. The editor creates the layout on first init."
              >
                <Row
                  name="Workspace folder"
                  desc="Absolute path. Editor will offer to seed the structure if empty."
                >
                  <div className="flex gap-2 items-center" style={{ minWidth: 0 }}>
                    <div style={{ flex: 1 }}>
                      <Input
                        value={rootPath}
                        onChange={(e) => {
                          setRootPath(e.target.value);
                          setNeedsSeed(false);
                        }}
                        placeholder="C:\\Users\\you\\rules-workspace"
                        className="mono"
                      />
                    </div>
                    <button
                      className="btn sm"
                      onClick={() => save(false)}
                      disabled={busy}
                      title="Save & reload"
                    >
                      <Folder className="w-3.5 h-3.5" /> Use
                    </button>
                  </div>
                  {needsSeed ? (
                    <div
                      className="flex items-center gap-2"
                      style={{
                        marginTop: 8,
                        padding: "8px 10px",
                        background: "var(--warn-soft)",
                        color: "var(--warn)",
                        borderRadius: 6,
                        fontSize: 11.5,
                      }}
                    >
                      <span style={{ flex: 1 }}>
                        No <code className="mono">workspace.json</code> at that path.
                      </span>
                      <button
                        className="btn primary sm"
                        onClick={() => save(true)}
                        disabled={busy}
                      >
                        <FolderPlus className="w-3.5 h-3.5" /> Initialize
                      </button>
                    </div>
                  ) : null}
                </Row>

                {initial.recentRoots.length ? (
                  <Row name="Recent" desc="Workspaces you've opened on this machine.">
                    <div className="flex flex-col" style={{ gap: 4 }}>
                      {initial.recentRoots.map((p) => (
                        <button
                          key={p}
                          onClick={() => setRootPath(p)}
                          className="mono"
                          style={{
                            textAlign: "left",
                            fontSize: 11.5,
                            color: rootPath === p ? "var(--accent)" : "var(--text-dim)",
                            padding: "4px 8px",
                            borderRadius: 4,
                            background: "transparent",
                            border: 0,
                            cursor: "pointer",
                          }}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </Row>
                ) : null}
              </SettingsGroup>
            ) : null}

            {activeGroup === "engine" ? (
              <SettingsGroup
                title="Engine runtime"
                desc="Tells the editor where to find the engine. The test runner spawns the CLI; the HTTP endpoint is reserved for future deploys."
              >
                <Row
                  name="CLI path"
                  desc="Path to the cloned ruleforge repo. Test runner spawns RuleForge.Cli from there. Run `dotnet build` once first."
                >
                  <Input
                    value={engineCliPath}
                    onChange={(e) => setEngineCliPath(e.target.value)}
                    placeholder="C:\\DATA\\14. ruleForge\\ruleforge"
                    className="mono"
                  />
                </Row>
                <Row
                  name="HTTP endpoint"
                  desc="(Not yet used) RuleForge.Api base URL for HTTP-mode evaluation."
                >
                  <Input
                    value={engineUrl}
                    onChange={(e) => setEngineUrl(e.target.value)}
                    placeholder="http://localhost:5000"
                    className="mono"
                    disabled
                  />
                </Row>
                <Row
                  name="DocumentForge URL"
                  desc="(Phase 2) Sync target for storing rules in DF rather than the local workspace."
                >
                  <Input
                    value={documentForgeUrl}
                    onChange={(e) => setDocumentForgeUrl(e.target.value)}
                    placeholder="https://documentforge.onrender.com"
                    className="mono"
                    disabled
                  />
                </Row>
              </SettingsGroup>
            ) : null}

            {activeGroup === "ai" ? (
              <SettingsGroup
                title="AI assistant"
                desc="Local Ollama server for the AI-draft sheet in the rule editor. Pull a JSON-savvy model first."
              >
                <Row name="Ollama URL" desc="Default is http://localhost:11434.">
                  <Input
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="mono"
                  />
                </Row>
                <Row
                  name="Model"
                  desc="The model used to generate rule drafts. Refresh to list pulled models."
                >
                  <div className="flex gap-2 items-center" style={{ minWidth: 0 }}>
                    {models.length > 0 ? (
                      <select
                        value={ollamaModel}
                        onChange={(e) => setOllamaModel(e.target.value)}
                        className="input mono"
                        style={{ flex: 1 }}
                      >
                        <option value="">— pick a pulled model —</option>
                        {models.map((m) => (
                          <option key={m.name} value={m.name}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        value={ollamaModel}
                        onChange={(e) => setOllamaModel(e.target.value)}
                        placeholder="qwen2.5-coder:14b"
                        className="mono"
                      />
                    )}
                    <button className="btn sm" onClick={loadModels} title="List Ollama models">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {modelsError ? (
                    <div
                      className="mono"
                      style={{ marginTop: 6, fontSize: 11, color: "var(--danger)" }}
                    >
                      {modelsError}
                    </div>
                  ) : null}
                </Row>
              </SettingsGroup>
            ) : null}

            {activeGroup === "future" ? (
              <SettingsGroup
                title="Coming soon"
                desc="Surfaces wired in the engine handoff but without editor UI yet."
              >
                <Row
                  name="Audit log"
                  desc="Engine #22 — change history with diff and rollback. Editor UI follows once the engine ships the shape."
                />
                <Row
                  name="Approval workflow"
                  desc="Status promotion gates (draft → review → published) with second-pair-of-eyes approver."
                />
                <Row
                  name="Shadow mode"
                  desc="Run a draft alongside the published rule and diff their outputs before promotion."
                />
                <Row
                  name="Trace enrichment"
                  desc="Engine #22 — per-filter evaluatedSource / evaluatedLiteral / operator in the trace. Unlocks the explainability UI on Test runner."
                />
              </SettingsGroup>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function SettingsGroup({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-group">
      <header className="settings-group-head">
        <h2>{title}</h2>
        <p>{desc}</p>
      </header>
      <div className="settings-row-head">
        <span>Setting</span>
        <span>Value</span>
      </div>
      <div className="settings-table">{children}</div>
    </section>
  );
}

function Row({
  name,
  desc,
  children,
}: {
  name: string;
  desc?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <div>
        <div className="settings-name">{name}</div>
        {desc ? <div className="settings-desc">{desc}</div> : null}
      </div>
      <div className="settings-ctl">{children ?? <span className="hint">—</span>}</div>
    </div>
  );
}
