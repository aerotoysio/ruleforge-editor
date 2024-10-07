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
        workspaceName: workspace?.name ?? null,
      }}
    />
  );
}
