import Ajv, { type ErrorObject } from "ajv";
import type { JsonSchema } from "@/lib/types";

const ajv = new Ajv({ strict: false, allErrors: true });

export function validateSchemaShape(value: unknown): { ok: true } | { ok: false; error: string } {
  try {
    ajv.compile(value as JsonSchema);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function validatePayload(schema: JsonSchema, value: unknown):
  | { ok: true }
  | { ok: false; errors: ErrorObject[] } {
  const validate = ajv.compile(schema);
  const ok = validate(value);
  if (ok) return { ok: true };
  return { ok: false, errors: validate.errors ?? [] };
}
