import type { JsonSchema } from "@/lib/types";

export function inferSchema(value: unknown): JsonSchema {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: "array" };
    const itemSchemas = value.map(inferSchema);
    return { type: "array", items: mergeSchemas(itemSchemas) };
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      properties[k] = inferSchema(v);
      if (v !== undefined && v !== null) required.push(k);
    }
    return { type: "object", properties, required: required.length ? required : undefined };
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return { type: "string", format: "date-time" };
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { type: "string", format: "date" };
    return { type: "string" };
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? { type: "integer" } : { type: "number" };
  }
  if (typeof value === "boolean") return { type: "boolean" };
  return {};
}

export function mergeSchemas(schemas: JsonSchema[]): JsonSchema {
  if (schemas.length === 0) return {};
  if (schemas.length === 1) return schemas[0];
  const first = schemas[0];
  if (first.type !== "object" || schemas.some((s) => s.type !== "object")) {
    return first;
  }
  const merged: JsonSchema = { type: "object", properties: {}, required: [] };
  const propMap = new Map<string, JsonSchema[]>();
  const requiredCount = new Map<string, number>();
  for (const s of schemas) {
    for (const [k, v] of Object.entries(s.properties ?? {})) {
      if (!propMap.has(k)) propMap.set(k, []);
      propMap.get(k)!.push(v);
    }
    for (const k of s.required ?? []) {
      requiredCount.set(k, (requiredCount.get(k) ?? 0) + 1);
    }
  }
  for (const [k, vs] of propMap.entries()) {
    merged.properties![k] = mergeSchemas(vs);
  }
  const required: string[] = [];
  for (const [k, count] of requiredCount.entries()) {
    if (count === schemas.length) required.push(k);
  }
  if (required.length) merged.required = required;
  return merged;
}
