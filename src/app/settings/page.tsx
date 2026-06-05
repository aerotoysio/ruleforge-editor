import { readSettings, getActiveRoot, readWorkspaceConfig } from "@/lib/server/workspace";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const settings = await readSettings();
  const activeRoot = await getActiveRoot();
  const workspace = activeRoot ? await readWorkspaceConfig(activeRoot).catch(() => null) : null;
  return (
    <SettingsClient
      initial={{
        rootPath: activeRoot ?? settings.rootPath ?? null,
        recentRoots: settings.recentRoots,
        engineUrl: settings.engineUrl ?? "",
        engineCliPath: settings.engineCliPath ?? "",
        documentForgeUrl: settings.documentForgeUrl ?? "",
        ollamaUrl: settings.ollamaUrl ?? "",
        ollamaModel: settings.ollamaModel ?? "",
        aiProvider: settings.aiProvider ?? "anthropic",
        anthropicApiKey: settings.anthropicApiKey ?? "",
        anthropicModel: settings.anthropicModel ?? "",
        workspaceName: workspace?.name ?? null,
      }}
    />
  );
}
