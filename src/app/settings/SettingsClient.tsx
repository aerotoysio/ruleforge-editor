"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Folder, FolderPlus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export function SettingsClient({ initial }: { initial: Initial }) {
  const router = useRouter();
  const { refresh } = useWorkspace();
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
        description="Pick the folder where rules, schemas, samples, and templates live. The folder will be initialized on first use."
      />
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="max-w-2xl flex flex-col gap-8">
          <Section title="Workspace folder" hint="Type or paste an absolute path. The editor will create the folder structure on init.">
            <label className="text-[12px] flex items-center gap-1.5" style={{ color: "var(--color-fg-muted)" }}>
              <Folder className="w-3.5 h-3.5" /> Folder path
            </label>
            <div className="flex gap-2">
              <Input
                value={rootPath}
                onChange={(e) => {
                  setRootPath(e.target.value);
                  setNeedsSeed(false);
                }}
                placeholder="C:\\Users\\you\\rules-workspace  or  /home/you/rules-workspace"
                className="mono"
              />
              <Button onClick={() => save(false)} disabled={busy} variant="default">
                <Save className="w-3.5 h-3.5" /> Save
              </Button>
            </div>
            {needsSeed ? (
              <div
                className="mt-3 px-3 py-2.5 rounded text-[12.5px] flex items-center justify-between gap-3"
                style={{ background: "var(--color-bg-muted)", color: "var(--color-fg-soft)" }}
              >
                <span>
                  No <code className="mono">workspace.json</code> at that path. Initialize it to create the folder structure.
                </span>
                <Button onClick={() => save(true)} disabled={busy} variant="default" size="sm">
                  <FolderPlus className="w-3.5 h-3.5" /> Initialize workspace
                </Button>
              </div>
            ) : null}
            {initial.recentRoots.length ? (
              <div className="mt-3 flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-dim)" }}>
                  Recent
                </span>
                {initial.recentRoots.map((p) => (
                  <button
                    key={p}
                    onClick={() => setRootPath(p)}
                    className="text-left mono text-[12px] truncate px-2 py-1 rounded hover:underline"
                    style={{ color: "var(--color-fg-soft)" }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            ) : null}
          </Section>

          <Section
            title="Engine CLI path"
            hint="Path to the cloned ruleforge repo. The test runner spawns RuleForge.Cli from there to evaluate rules against samples. Run `dotnet build` once in that folder before testing."
          >
            <Input
              value={engineCliPath}
              onChange={(e) => setEngineCliPath(e.target.value)}
              placeholder="C:\\DATA\\14. ruleForge\\ruleforge"
              className="mono"
            />
          </Section>

          <Section title="Engine HTTP URL" hint="(Optional, not yet used) RuleForge.Api base URL for HTTP-mode test runs.">
            <Input
              value={engineUrl}
              onChange={(e) => setEngineUrl(e.target.value)}
              placeholder="http://localhost:5000"
              className="mono"
              disabled
            />
          </Section>

          <Section
            title="Ollama (AI draft)"
            hint="Local Ollama server for the AI-draft sheet in the rule editor. Default URL: http://localhost:11434. Pull a JSON-savvy model first, e.g. `ollama pull qwen2.5-coder:14b`."
          >
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-dim)" }}>URL</span>
                <Input
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="mono"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider flex items-center justify-between" style={{ color: "var(--color-fg-dim)" }}>
                  Model
                  <button
                    type="button"
                    onClick={loadModels}
                    className="text-[10px] underline normal-case"
                    style={{ color: "var(--color-fg-muted)" }}
                  >
                    refresh
                  </button>
                </span>
                {models.length > 0 ? (
                  <select
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                    className="h-8 px-2 text-[13px] rounded mono"
                    style={{ background: "var(--color-bg)", color: "var(--color-fg)", border: "1px solid var(--color-border-strong)" }}
                  >
                    <option value="">— pick a pulled model —</option>
                    {models.map((m) => (
                      <option key={m.name} value={m.name}>{m.name}</option>
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
              </label>
            </div>
            {modelsError ? (
              <p className="text-[11px] mt-2" style={{ color: "var(--color-fail)" }}>
                {modelsError}
              </p>
            ) : models.length === 0 ? (
              <p className="text-[11px] mt-2" style={{ color: "var(--color-fg-muted)" }}>
                Click <span className="font-medium">refresh</span> to list pulled models.
              </p>
            ) : null}
          </Section>

          <Section title="DocumentForge URL" hint="(Phase 2) DocumentForge sync target. Not used yet.">
            <Input
              value={documentForgeUrl}
              onChange={(e) => setDocumentForgeUrl(e.target.value)}
              placeholder="https://documentforge.onrender.com"
              className="mono"
              disabled
            />
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded p-5 flex flex-col gap-2"
      style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[14px] font-medium tracking-tight">{title}</h2>
      </div>
      {hint ? (
        <p className="text-[12px] mb-1" style={{ color: "var(--color-fg-muted)" }}>
          {hint}
        </p>
      ) : null}
      {children}
    </section>
  );
}
