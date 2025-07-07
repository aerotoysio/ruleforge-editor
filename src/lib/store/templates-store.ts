"use client";

import { create } from "zustand";
import type { OutputTemplate } from "@/lib/types";

type TemplatesState = {
  templates: OutputTemplate[];
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  byId: (id: string | undefined) => OutputTemplate | undefined;
};

async function fetchTemplates(): Promise<OutputTemplate[]> {
  try {
    const res = await fetch("/api/templates");
    if (!res.ok) return [];
    const data = (await res.json()) as { templates: OutputTemplate[] };
    return data.templates ?? [];
  } catch {
    return [];
  }
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
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
}));
