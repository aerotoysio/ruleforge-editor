/**
 * Output templates — reusable shapes for the objects a rule emits.
 *
 * The motivation: a rule that produces "tax lines" or "bag-fee lines" or
 * "discount lines" emits the same kind of object every time, with the same
 * field names and types. Authors today have to retype that shape inside a
 * `node-constant` literal for every rule. Templates centralise it:
 *
 *   templates/airline-bag.json    — { code, weightKg, amount, currency, ... }
 *   templates/tax-line.json       — { type, amount, currency, paxId, ... }
 *
 * A constant or mutator-set node can then reference a template by id and
 * fill its fields one at a time (literal value or path-binding) instead of
 * authoring the whole object from scratch. The engine resolves to a regular
 * object at evaluation time — templates are an authoring-time convenience,
 * not a runtime concept.
 */

export type OutputTemplateFieldType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "any"
  | "string-array"
  | "number-array"
  | "object"
  | "object-array";

export type OutputTemplateField = {
  name: string;
  type: OutputTemplateFieldType;
  required?: boolean;
  description?: string;
  /**
   * Optional baked-in default. Useful for fields that should be the same
   * across every instance of the template — e.g. `type: "BAG"` on a bag
   * line. The dialog renders these as locked-but-editable.
   */
  default?: unknown;
  /** Optional examples for documentation / palette previews. */
  examples?: unknown[];
};

export type OutputTemplate = {
  id: string;
  name: string;
  description?: string;
  /**
   * Optional grouping tag — "ancillary" / "tax" / "discount" / "fare" — for
   * filtering in the picker. Free-form; empty / undefined = ungrouped.
   */
  category?: string;
  fields: OutputTemplateField[];
  /**
   * Optional fully-shaped JSON example. Doubles as documentation and as a
   * source of "fill defaults from this example" if the dialog ever wants
   * to bootstrap a binding.
   */
  example?: Record<string, unknown>;
  updatedAt: string;
};

/** Workspace summary used by the templates list page. */
export type OutputTemplateSummary = Pick<
  OutputTemplate,
  "id" | "name" | "description" | "category" | "updatedAt"
> & { fieldCount: number };
