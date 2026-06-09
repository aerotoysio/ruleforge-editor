"use client";

import { useEffect } from "react";
import { useAssetsStore } from "@/lib/store/assets-store";
import { useTemplatesStore } from "@/lib/store/templates-store";
import type { Asset, OutputTemplate, PortBinding } from "@/lib/types";

// A saved-product (Asset) dropdown that produces an `asset` PortBinding.
// Used by the asset-only Product node and the text-parse node. Non-technical:
// just pick a product; value tweaks happen in downstream nodes.
export function AssetPicker({
  binding,
  onChange,
  hint,
}: {
  binding: PortBinding | undefined;
  onChange: (b: PortBinding | null) => void;
  hint?: string;
}) {
  const assets = useAssetsStore((s) => s.assets);
  const assetsLoaded = useAssetsStore((s) => s.loaded);
  const loadAssets = useAssetsStore((s) => s.load);
  const templates = useTemplatesStore((s) => s.templates);
  const templatesLoaded = useTemplatesStore((s) => s.loaded);
  const loadTemplates = useTemplatesStore((s) => s.load);

  useEffect(() => { if (!assetsLoaded) void loadAssets(); }, [assetsLoaded, loadAssets]);
  useEffect(() => { if (!templatesLoaded) void loadTemplates(); }, [templatesLoaded, loadTemplates]);

  const current = binding?.kind === "asset" ? binding.assetId : "";
  const selected = assets.find((a) => a.id === current);

  return (
    <div className="flex flex-col gap-1.5">
      <select
        value={current}
        onChange={(e) => onChange(e.target.value ? { kind: "asset", assetId: e.target.value } : null)}
        className="input"
      >
        <option value="">— choose a saved product —</option>
        {groupByTemplate(assets, templates).map(([label, items]) => (
          <optgroup key={label} label={label}>
            {items.map((a) => (
              <option key={a.id} value={a.id}>{a.name ?? a.id}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <p className="field-hint" style={{ fontSize: 11 }}>
        {selected
          ? hint ?? "Emits this saved product. Adjust specific values (e.g. Price) in a Set or calc node downstream so the change is visible in the workflow."
          : assets.length === 0
          ? "No saved products yet — create one under Assets first."
          : "Pick a saved product to emit."}
      </p>
    </div>
  );
}

function groupByTemplate(assets: Asset[], templates: OutputTemplate[]): [string, Asset[]][] {
  const nameOf = (id: string) => templates.find((t) => t.id === id)?.name ?? id;
  const groups = new Map<string, Asset[]>();
  for (const a of assets) {
    const label = nameOf(a.templateId);
    const arr = groups.get(label) ?? [];
    arr.push(a);
    groups.set(label, arr);
  }
  return [...groups.entries()].sort((x, y) => x[0].localeCompare(y[0]));
}
