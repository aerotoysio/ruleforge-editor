import type { JsonSchema, JsonSchemaType } from "@/lib/types";

export type SchemaPathNode = {
  path: string;
  label: string;
  schema: JsonSchema;
  type: JsonSchemaType | "unknown";
  isArray: boolean;
  depth: number;
  children?: SchemaPathNode[];
};

export function walkSchema(root: JsonSchema, basePath = "$"): SchemaPathNode {
  return walk(root, basePath, "$", 0);
}

function walk(schema: JsonSchema, path: string, label: string, depth: number): SchemaPathNode {
  const type = pickType(schema);
  const isArray = type === "array";
  const node: SchemaPathNode = {
    path,
    label,
    schema,
    type: type ?? "unknown",
    isArray,
    depth,
  };
  if (type === "object" && schema.properties) {
    node.children = Object.entries(schema.properties).map(([k, v]) =>
      walk(v, `${path}.${k}`, k, depth + 1),
    );
  } else if (type === "array" && schema.items) {
    node.children = [walk(schema.items, `${path}[*]`, "[*]", depth + 1)];
  }
  return node;
}

export function flattenPaths(root: SchemaPathNode): SchemaPathNode[] {
  const out: SchemaPathNode[] = [];
  const visit = (n: SchemaPathNode) => {
    out.push(n);
    n.children?.forEach(visit);
  };
  visit(root);
  return out;
}

function pickType(schema: JsonSchema): JsonSchemaType | undefined {
  if (Array.isArray(schema.type)) return schema.type.find((t) => t !== "null") ?? schema.type[0];
  return schema.type;
}
