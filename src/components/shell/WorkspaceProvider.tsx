"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type WorkspaceContextValue = {
  rootPath: string | null;
  recentRoots: string[];
  engineUrl: string | null;
  documentForgeUrl: string | null;
  setRootPath: (path: string | null) => void;
  setEngineUrl: (url: string | null) => void;
  setDocumentForgeUrl: (url: string | null) => void;
  refresh: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

type Initial = {
  rootPath: string | null;
  recentRoots: string[];
  engineUrl: string | null;
  documentForgeUrl: string | null;
};

export function WorkspaceProvider({
  initial,
  children,
}: {
  initial: Initial;
  children: ReactNode;
}) {
  const [rootPath, setRootPath] = useState<string | null>(initial.rootPath);
  const [recentRoots, setRecentRoots] = useState<string[]>(initial.recentRoots);
  const [engineUrl, setEngineUrl] = useState<string | null>(initial.engineUrl);
  const [documentForgeUrl, setDocumentForgeUrl] = useState<string | null>(initial.documentForgeUrl);

  const refresh = async () => {
    const res = await fetch("/api/workspace");
    if (!res.ok) return;
    const data = await res.json();
    setRootPath(data.rootPath ?? null);
    setRecentRoots(data.recentRoots ?? []);
    setEngineUrl(data.engineUrl ?? null);
    setDocumentForgeUrl(data.documentForgeUrl ?? null);
  };

  useEffect(() => {
    setRootPath(initial.rootPath);
    setRecentRoots(initial.recentRoots);
    setEngineUrl(initial.engineUrl);
    setDocumentForgeUrl(initial.documentForgeUrl);
  }, [initial.rootPath, initial.recentRoots, initial.engineUrl, initial.documentForgeUrl]);

  const value: WorkspaceContextValue = {
    rootPath,
    recentRoots,
    engineUrl,
    documentForgeUrl,
    setRootPath,
    setEngineUrl,
    setDocumentForgeUrl,
    refresh,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
