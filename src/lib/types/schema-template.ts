import type { JsonSchema } from "./schema";

/**
 * Schema templates — reusable JSON Schema shapes shared between rules.
 *
 * Motivation: many rules share the same input shape (e.g. ten rules all
 * consume a "PriceQuoteRequest"), and sub-rules called via `ruleRef` must
 * speak the same input language as their parent. Without templates, each
 * rule embeds its own copy of the schema, and keeping them in sync is
 * manual / error-prone.
 *
 *   schemas/quote-request.json   — { pax: [...], itinerary: {...}, ... }
 *   schemas/booking-confirm.json — { paxId, segments, ancillaries, ... }
 *
 * The editor resolves `Rule.inputSchemaRef` at LOAD time and exposes a normal
 * `rule.inputSchema` to the rest of the pipeline (canvas, NodeConfigDialog,
 * validation). At ENGINE STAGING time (`stageEngineFixtures`) we inline the
 * resolved schema into the compiled rule before invoking `dotnet run` — the
 * engine never knows the template exists. This keeps the engine simple and
 * lets us edit one template to fan-out the shape change to every referencing
 * rule on next reload.
 *
 * `intent` is a soft hint — pickers can filter to "input-shaped templates"
 * vs "output-shaped templates" but the storage format is identical.
 */
export type SchemaTemplate = {
  id: string;
  name: string;
  description?: string;
  /**
   * Free-form grouping label — "passenger" / "booking" / "ancillary" — for
   * filtering in pickers. Empty / undefined = ungrouped.
   */
  category?: string;
  /**
   * Hint about what role this schema usually fills. Pickers filter on it.
   * - "input"   = a request shape rules consume
   * - "output"  = an envelope-level response shape
   * - "context" = a per-evaluation context shape
   * - undefined = any / unspecified
   */
  intent?: "input" | "output" | "context";
  /** The JSON Schema this template represents. */
  schema: JsonSchema;
  updatedAt: string;
};

/** Workspace summary used by the listing page (no heavy schema body). */
export type SchemaTemplateSummary = Pick<
  SchemaTemplate,
  "id" | "name" | "description" | "category" | "intent" | "updatedAt"
> & {
  /** How many top-level properties the schema declares — rough size hint. */
  fieldCount: number;
  /** How many rules currently reference this template (computed at list time). */
  refCount?: number;
};
