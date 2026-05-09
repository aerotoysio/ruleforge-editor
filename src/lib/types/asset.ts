/**
 * Assets — concrete template instances.
 *
 * If a template is the *shape* of "a bag fee line", an asset is a *specific*
 * bag fee line with real values: code = "EXTRA_BAG_1", weightKg = 23,
 * amount = 65, etc. Authored once in the workspace, referenced from rules.
 *
 * The pattern: a rule receives a request, picks the matching asset (via the
 * upcoming `node-asset-pick`), then optionally mutates one or two fields per
 * iteration (e.g. scale price for premium customers via `node-mutator-set`).
 *
 * Workspace layout:
 *
 *   assets/<assetId>.json   — flat folder, one file per asset.
 *
 * Each file carries its own `templateId`, so the browse page can group by
 * template without scanning a separate index.
 */

export type Asset = {
  id: string;
  /** References OutputTemplate.id from the workspace's `templates/` folder. */
  templateId: string;
  /** Per-field values, keyed by template-field name. */
  values: Record<string, unknown>;
  /** Optional friendly name shown in pickers (defaults to `id`). */
  name?: string;
  /** Optional human description. */
  description?: string;
  /** Optional grouping tag — "extra-bag" / "sports-equipment" / etc. */
  category?: string;
  updatedAt: string;
};

/** Compact summary used by list pages. */
export type AssetSummary = Pick<
  Asset,
  "id" | "templateId" | "name" | "description" | "category" | "updatedAt"
>;
