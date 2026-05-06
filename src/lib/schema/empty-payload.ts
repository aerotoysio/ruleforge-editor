import type { JsonSchema, JsonSchemaType } from "@/lib/types";

export function emptyPayload(schema: JsonSchema): unknown {
  if (schema.examples && schema.examples.length > 0) return schema.examples[0];
  if (schema.default !== undefined) return schema.default;
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];

  const t = pickType(schema);
  switch (t) {
    case "string":
      return schema.format === "date-time"
        ? new Date().toISOString()
        : schema.format === "date"
          ? new Date().toISOString().slice(0, 10)
          : "";
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
      const required = new Set(schema.required ?? []);
      for (const [k, v] of Object.entries(props)) {
        if (required.has(k)) obj[k] = emptyPayload(v);
      }
      return obj;
    }
    case "array":
      return [];
    default:
      return null;
  }
}

function pickType(schema: JsonSchema): JsonSchemaType | undefined {
  if (Array.isArray(schema.type)) return schema.type.find((t) => t !== "null") ?? schema.type[0];
  return schema.type;
}
