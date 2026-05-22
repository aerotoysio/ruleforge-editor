/**
 * DocumentForge HTTP client — used by the sync routes to push/pull a
 * workspace between the local filesystem and a DocumentForge instance.
 *
 * DocumentForge (https://github.com/aerotoysio/documentforge) is an embedded
 * JSON document DB with a thin HTTP serve mode. One database per workspace,
 * one collection per entity type:
 *
 *   database = <workspace-name>     # editor → DocumentForge handle
 *     ├─ collection "rules"
 *     ├─ collection "schemas"
 *     ├─ collection "templates"
 *     ├─ collection "assets"
 *     ├─ collection "refs"
 *     ├─ collection "nodes"
 *     └─ collection "samples"
 *
 * Cross-entity references stay as string ids in each document (Rule.inputSchemaRef
 * → schemas.id) so a partial sync still leaves the rest valid.
 *
 * No auth assumed for local dev. Production: add a header passthrough here.
 */

const FETCH_TIMEOUT_MS = 5000;

export type DfCollection = "rules" | "schemas" | "templates" | "assets" | "refs" | "nodes" | "samples";

export class DocumentForgeError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "DocumentForgeError";
  }
}

/**
 * Ensure the named database exists on the server. Idempotent — DocumentForge's
 * `POST /databases` accepts `createIfMissing: true` by default. The server
 * returns 201 on first call and 200 / conflict on subsequent calls; we accept
 * any 2xx and any "already exists" conflict as success.
 */
export async function ensureDatabase(baseUrl: string, name: string): Promise<void> {
  const url = trim(baseUrl) + "/databases";
  const res = await timeoutFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, createIfMissing: true }),
  });
  if (res.status === 409) return; // already attached — fine
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new DocumentForgeError(
      `Failed to ensure database '${name}': ${res.status} ${res.statusText}`,
      res.status,
      url,
      detail,
    );
  }
}

/**
 * Insert a single document into a collection. DocumentForge generates its own
 * surrogate _id; we keep the entity's natural `id` field inside the document
 * for cross-references.
 *
 * NB: this is INSERT-only. For upsert semantics (re-pushing the same workspace),
 * use `replaceCollection()` which clears first.
 */
export async function insertDocument(
  baseUrl: string,
  database: string,
  collection: DfCollection,
  document: unknown,
): Promise<string> {
  const url = `${trim(baseUrl)}/db/${encodeURIComponent(database)}/collections/${encodeURIComponent(collection)}`;
  const res = await timeoutFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(document),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new DocumentForgeError(
      `Insert into ${collection} failed: ${res.status} ${res.statusText}`,
      res.status,
      url,
      detail,
    );
  }
  const body = (await res.json()) as { id?: string };
  return body.id ?? "";
}

/**
 * Replace the entire contents of a collection — `DELETE FROM <collection>`
 * followed by bulk inserts. Used by the push flow to make every push
 * idempotent: the workspace's filesystem state ends up mirrored exactly.
 *
 * If your DocumentForge build doesn't support `DELETE FROM` via the query
 * endpoint, this falls back to inserting without clearing (and the receiver
 * gets duplicates — fix by re-creating the database).
 */
export async function replaceCollection(
  baseUrl: string,
  database: string,
  collection: DfCollection,
  documents: unknown[],
): Promise<{ inserted: number; cleared: boolean }> {
  // Clear the collection first
  let cleared = false;
  try {
    await runQuery(baseUrl, database, `DELETE FROM ${collection}`);
    cleared = true;
  } catch {
    // Older DocumentForge builds may not support DELETE — proceed without
    // clearing. The caller is expected to recreate the database for a clean
    // state in that case.
  }

  // Bulk insert. Serial because the HTTP API doesn't expose a bulk endpoint;
  // workspaces are small (typically <100 docs per collection) so this is fine.
  let inserted = 0;
  for (const doc of documents) {
    await insertDocument(baseUrl, database, collection, doc);
    inserted++;
  }
  return { inserted, cleared };
}

/**
 * Pull every document from a collection. Returns an array of the original
 * JSON values (DocumentForge's surrogate `_id` is stripped — the editor cares
 * about the entity's natural `id` field).
 */
export async function listCollection(
  baseUrl: string,
  database: string,
  collection: DfCollection,
): Promise<unknown[]> {
  const result = await runQuery(baseUrl, database, `SELECT * FROM ${collection}`);
  // DocumentForge wraps results in `documents: [...]`. Each document may have
  // a `_id` (or whatever DocumentForge's internal id field is); strip it so
  // the editor sees the same shape it would on the filesystem.
  return (result.documents ?? []).map((d) => stripDocumentForgeId(d));
}

/**
 * List collection names that exist in the database (so the editor can show
 * sync stats without forcing every collection to exist).
 */
export async function listCollectionNames(baseUrl: string, database: string): Promise<string[]> {
  const url = `${trim(baseUrl)}/db/${encodeURIComponent(database)}/collections`;
  const res = await timeoutFetch(url, { method: "GET" });
  if (!res.ok) {
    if (res.status === 404) return []; // database doesn't exist yet
    throw new DocumentForgeError(
      `List collections failed: ${res.status} ${res.statusText}`,
      res.status,
      url,
    );
  }
  const body = (await res.json()) as { collections?: string[] };
  return body.collections ?? [];
}

type QueryResult = {
  documents?: unknown[];
  affected?: number;
  executionTimeMs?: number;
  count?: number;
};

async function runQuery(baseUrl: string, database: string, sql: string): Promise<QueryResult> {
  const url = `${trim(baseUrl)}/db/${encodeURIComponent(database)}/query`;
  const res = await timeoutFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new DocumentForgeError(
      `Query failed: ${res.status} ${res.statusText}`,
      res.status,
      url,
      detail,
    );
  }
  return (await res.json()) as QueryResult;
}

/**
 * DocumentForge stamps each stored document with an internal id (typically `_id`
 * or `__id`). The editor's natural `id` field lives inside the document body
 * and is what cross-references use. Strip the DocumentForge surrogate so a
 * round-tripped document matches the original filesystem JSON exactly.
 */
function stripDocumentForgeId(doc: unknown): unknown {
  if (!doc || typeof doc !== "object") return doc;
  const clone = { ...(doc as Record<string, unknown>) };
  delete clone._id;
  delete clone.__id;
  return clone;
}

function trim(url: string): string {
  return url.replace(/\/+$/, "");
}

async function timeoutFetch(url: string, init: RequestInit): Promise<Response> {
  // AbortSignal.timeout(N) is the idiomatic per-request timeout in modern
  // Node — gives us "DocumentForge is unreachable" detection in 5s instead
  // of letting the default 60s+ timeout block the API route's response.
  return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}
