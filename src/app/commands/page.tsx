import path from "node:path";
import { Terminal } from "lucide-react";
import { getActiveRoot, listRules, readSettings } from "@/lib/server/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { CommandsClient } from "./CommandsClient";

/**
 * Run commands — a connectionstrings.com-style cheat sheet.
 *
 * The editor's Test panel runs the engine for you internally, but for ad-hoc
 * shell work (running a rule from a terminal, scripting, CI), you want the
 * exact command string ready to copy. This page renders those commands with
 * the user's workspace path + engine CLI path already substituted, so there's
 * no guesswork about quoting or which `--fixtures` directory to point at.
 */
export default async function CommandsPage() {
  const root = await getActiveRoot();
  const settings = await readSettings();
  const rules = root ? await listRules(root) : [];

  return (
    <>
      <PageHeader
        title="Run commands"
        description="Copy-paste commands to invoke the engine from a terminal. Paths come from your current workspace + Settings, so everything's pre-substituted — pick a rule, click copy, paste, run."
      />
      {!root ? (
        <div className="flex-1 overflow-auto" style={{ padding: "8px 28px 80px", background: "var(--bg)" }}>
          <EmptyState
            icon={<Terminal className="w-8 h-8" />}
            title="No workspace selected"
            description="Pick a workspace in Settings, then come back here for ready-to-run commands."
          />
        </div>
      ) : (
        <CommandsClient
          root={root}
          cliProject={settings.engineCliPath ? path.join(settings.engineCliPath, "src", "RuleForge.Cli") : null}
          engineCliPath={settings.engineCliPath ?? null}
          engineUrl={settings.engineUrl ?? null}
          documentForgeUrl={settings.documentForgeUrl ?? null}
          rules={rules.map((r) => ({
            id: r.id,
            name: r.name,
            method: r.method,
            endpoint: r.endpoint,
            version: r.currentVersion,
          }))}
        />
      )}
    </>
  );
}
