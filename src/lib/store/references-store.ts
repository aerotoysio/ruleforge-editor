"use client";

import { create } from "zustand";
import type { ReferenceSet } from "@/lib/types";

type ReferencesState = {
  references: ReferenceSet[];
  loaded: boolean;
  load: () => Promise<void>;
  byId: (id: string | undefined) => ReferenceSet | undefined;
};

export const useReferencesStore = create<ReferencesState>((set, get) => ({
  references: [],
  loaded: false,
  async load() {
    if (get().loaded) return;
    try {
      const res = await fetch("/api/refs");
      if (!res.ok) return;
      const data = (await res.json()) as { references: ReferenceSet[] };
      set({ references: data.references, loaded: true });
    } catch {
      // ignore
    }
  },
  byId(id) {
    if (!id) return undefined;
    return get().references.find((r) => r.id === id);
  },
}));
