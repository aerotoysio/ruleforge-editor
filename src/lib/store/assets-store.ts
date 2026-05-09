"use client";

import { create } from "zustand";
import type { Asset } from "@/lib/types";

type AssetsState = {
  assets: Asset[];
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  byId: (id: string | undefined) => Asset | undefined;
  byTemplate: (templateId: string | undefined) => Asset[];
};

async function fetchAssets(): Promise<Asset[]> {
  try {
    const res = await fetch("/api/assets");
    if (!res.ok) return [];
    const data = (await res.json()) as { assets: Asset[] };
    return data.assets ?? [];
  } catch {
    return [];
  }
}

export const useAssetsStore = create<AssetsState>((set, get) => ({
  assets: [],
  loaded: false,
  async load() {
    if (get().loaded) return;
    const assets = await fetchAssets();
    set({ assets, loaded: true });
  },
  async reload() {
    const assets = await fetchAssets();
    set({ assets, loaded: true });
  },
  byId(id) {
    if (!id) return undefined;
    return get().assets.find((a) => a.id === id);
  },
  byTemplate(templateId) {
    if (!templateId) return [];
    return get().assets.filter((a) => a.templateId === templateId);
  },
}));
