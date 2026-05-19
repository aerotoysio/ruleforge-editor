import type { JsonSchema, JsonSchemaType } from "@/lib/types";

/**
 * Build a fully-populated sample JSON value from a JSON Schema — every field,
 * required or not, gets a placeholder value. Unlike `emptyPayload` (which is
 * used as a request-shape seed for tests and only fills required keys), this
 * is intended as a visual "shape preview" so authors can SEE the schema as
 * concrete JSON while they edit.
 *
 *   schema { type: "object", properties: { pnr: string, pax: array of object }, required: [] }
 *     → { "pnr": "", "pax": [{ ... }] }
 *
 * Placeholder choices are biased toward "looks like real data" so the preview
 * is scannable: dates → a fixed reference date, strings → "" or the field
 * name as a hint, numbers → 0, booleans → false. The first enum value wins
 * when present.
 *
 * IMPORTANT: every placeholder is DETERMINISTIC. We do NOT use `new Date()`
 * here because samplePayload runs during render (in SchemaEditor's
 * `useState` initializer) on both the server (SSR) and the client
 * (hydration) — a `Date.now()` call would produce a different
 * milliseconds-suffix on each side and trip a hydration mismatch warning.
 */
// Fixed reference date used for `date` / `date-time` placeholders. Picked as
// a near-future ISO date so the preview looks realistic without leaking the
// build timestamp into rendered HTML.
const PLACEHOLDER_DATE = "2026-01-01";
const PLACEHOLDER_DATE_TIME = "2026-01-01T00:00:00.000Z";

export function samplePayload(schema: JsonSchema, fieldName?: string): unknown {
  if (schema.examples && schema.examples.length > 0) return schema.examples[0];
  if (schema.default !== undefined) return schema.default;
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];

  const t = pickType(schema);
  switch (t) {
    case "string":
      if (schema.format === "date") return PLACEHOLDER_DATE;
      if (schema.format === "date-time") return PLACEHOLDER_DATE_TIME;
      if (schema.format === "email") return "user@example.com";
      if (schema.format === "uuid") return "00000000-0000-0000-0000-000000000000";
      if (schema.format === "uri") return "https://example.com";
      // No format hint → leave empty so users see the shape, not noise.
      return "";
    case "integer":
      return schema.minimum ?? 0;
    case "number":
      return schema.minimum ?? 0;
    case "boolean":
      return false;
    case "null":
      return null;
    case "object": {
      const obj: Record<string, unknown> = {};
      const props = schema.properties ?? {};
      for (const [k, v] of Object.entries(props)) {
        obj[k] = samplePayload(v, k);
      }
      return obj;
    }
    case "array": {
      // Show ONE sample item so the structure is visible. Empty arrays
      // give zero shape info; multi-item arrays add noise.
      const itemSchema = schema.items ?? { type: "string" };
      return [samplePayload(itemSchema)];
    }
    default:
      // Suppress unused-variable warning while keeping fieldName in the
      // signature for future "name-aware" placeholder choices.
      void fieldName;
      return null;
  }
}

function pickType(schema: JsonSchema): JsonSchemaType | undefined {
  if (Array.isArray(schema.type)) return schema.type.find((t) => t !== "null") ?? schema.type[0];
  return schema.type;
}
