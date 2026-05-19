import type { JsonSchema } from "@/lib/types";

/**
 * Merge an "inferred-from-sample" schema into an existing schema so the
 * author's structural edits (added/removed/retyped properties) take effect
 * while the field-level metadata they care about (description, format,
 * enum, min/max, examples, $schema) is preserved.
 *
 * Without this, every keystroke in the sample pane would wipe the
 * descriptions and formats the author painstakingly set in the visual editor.
 *
 *  - existing: the current schema (source of metadata)
 *  - inferred: a fresh schema computed from the sample JSON (source of shape)
 *  - returns: a merged schema with `inferred`'s shape and `existing`'s metadata
 *
 * Walk strategy: at each level, take inferred's `type` as authoritative. If
 * types match, copy metadata from existing onto the result. Recurse into
 * `properties` / `items` by name / position. If types diverge, use inferred
 * wholesale (the metadata wouldn't make sense for the new type anyway).
 */
export function mergeInferredIntoSchema(existing: JsonSchema, inferred: JsonSchema): JsonSchema {
  // Different types → user changed the shape fundamentally; keep inferred.
  if (typeOf(existing) !== typeOf(inferred)) return inferred;

  const merged: JsonSchema = { ...inferred };

  // Carry over field-level metadata. Only fields that survive a type-match
  // are eligible — re-typed nodes lose their old min/max etc. by design.
  if (existing.$schema) merged.$schema = existing.$schema;
  if (existing.description) merged.description = existing.description;
  if (existing.title) merged.title = existing.title;
  if (existing.format) merged.format = existing.format;
  if (existing.enum) merged.enum = existing.enum;
  if (existing.const !== undefined) merged.const = existing.const;
  if (existing.default !== undefined) merged.default = existing.default;
  if (existing.examples) merged.examples = existing.examples;
  if (existing.minimum !== undefined) merged.minimum = existing.minimum;
  if (existing.maximum !== undefined) merged.maximum = existing.maximum;
  if (existing.minLength !== undefined) merged.minLength = existing.minLength;
  if (existing.maxLength !== undefined) merged.maxLength = existing.maxLength;
  if (existing.pattern) merged.pattern = existing.pattern;

  // Required: keep existing required list, but drop entries that no longer
  // exist in the inferred properties.
  if (typeOf(merged) === "object" && existing.required) {
    const inferredProps = merged.properties ?? {};
    merged.required = existing.required.filter((r) => Object.prototype.hasOwnProperty.call(inferredProps, r));
  }

  // Recurse into properties: for every property in `inferred`, if the same
  // name exists in `existing`, merge them; otherwise take inferred as-is.
  if (typeOf(merged) === "object" && merged.properties) {
    const mergedProps: Record<string, JsonSchema> = {};
    for (const [key, inferredVal] of Object.entries(merged.properties)) {
      const existingVal = existing.properties?.[key];
      mergedProps[key] = existingVal
        ? mergeInferredIntoSchema(existingVal, inferredVal)
        : inferredVal;
    }
    merged.properties = mergedProps;
  }

  // Recurse into array items.
  if (typeOf(merged) === "array" && merged.items && existing.items) {
    merged.items = mergeInferredIntoSchema(existing.items, merged.items);
  }

  return merged;
}

function typeOf(schema: JsonSchema): string | undefined {
  if (Array.isArray(schema.type)) return schema.type.find((t) => t !== "null") ?? schema.type[0];
  return schema.type;
}
