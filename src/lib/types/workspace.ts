export type WorkspaceConfig = {
  name: string;
  createdAt: string;
  updatedAt: string;
  engineUrl?: string;
  documentForgeUrl?: string;
  defaultMethod?: "GET" | "POST";
  defaultStatus?: "draft" | "review" | "published";
};

export type WorkspaceState = {
  rootPath: string | null;
  config: WorkspaceConfig | null;
  loaded: boolean;
};

export type Sample = {
  id: string;
  ruleId: string | null;
  name: string;
  description?: string;
  payload: unknown;
  updatedAt: string;
};

export type ReferenceSet = {
  id: string;
  name: string;
  description?: string;
  currentVersion: number;
  columns: string[];
  rows: Record<string, unknown>[];
  updatedAt?: string;
};
