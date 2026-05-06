"use client";

import { create } from "zustand";
import type { NodeDef } from "@/lib/types";

type State = {
  nodes: NodeDef[];
  byId: (id: string) => NodeDef | undefined;
  loaded: boolean;
  load: () => Promise<void>;
};

export const useNodesStore = create<State>((set, get) => ({
  nodes: [],
  loaded: false,
  byId: (id: string) => get().nodes.find((n) => n.id === id),
  load: async () => {
    try {
      const res = await fetch("/api/nodes");
      if (!res.ok) return;
      const data = (await res.json()) as { nodes: NodeDef[] };
      set({ nodes: data.nodes, loaded: true });
    } catch {
      // ignore
    }
  },
}));
