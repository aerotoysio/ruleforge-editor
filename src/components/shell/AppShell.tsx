import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { WorkspaceProvider } from "./WorkspaceProvider";
import { getActiveRoot, readSettings } from "@/lib/server/workspace";

export async function AppShell({ children }: { children: ReactNode }) {
  const settings = await readSettings();
  const activeRoot = await getActiveRoot();
  return (
    <WorkspaceProvider
      initial={{
        rootPath: activeRoot,
        recentRoots: settings.recentRoots,
        engineUrl: settings.engineUrl ?? null,
        documentForgeUrl: settings.documentForgeUrl ?? null,
      }}
    >
      <div className="flex h-screen w-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
      </div>
    </WorkspaceProvider>
  );
}
