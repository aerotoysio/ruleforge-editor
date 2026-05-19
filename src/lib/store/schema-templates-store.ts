"use client";

import { create } from "zustand";
import type { SchemaTemplate } from "@/lib/types";

type SchemaTemplatesState = {
  templates: SchemaTemplate[];
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  byId: (id: string | undefined) => SchemaTemplate | undefined;
  /** Convenience filter by intent — input/output/context pickers use this. */
  byIntent: (intent: SchemaTemplate["intent"]) => SchemaTemplate[];
};

async function fetchTemplates(): Promise<SchemaTemplate[]> {
  try {
    const res = await fetch("/api/schema-templates");
    if (!res.ok) return [];
    const data = (await res.json()) as { templates: SchemaTemplate[] };
    return data.templates ?? [];
  } catch {
    return [];
  }
}

export const useSchemaTemplatesStore = create<SchemaTemplatesState>((set, get) => ({
  templates: [],
  loaded: false,
  async load() {
    if (get().loaded) return;
    const templates = await fetchTemplates();
    set({ templates, loaded: true });
  },
  async reload() {
    const templates = await fetchTemplates();
    set({ templates, loaded: true });
  },
  byId(id) {
    if (!id) return undefined;
    return get().templates.find((t) => t.id === id);
  },
  byIntent(intent) {
    if (!intent) return get().templates;
    return get().templates.filter((t) => !t.intent || t.intent === intent);
  },
}));
