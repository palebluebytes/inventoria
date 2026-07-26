import type { Datom } from "../db/db.client";

export interface EntityPayload {
  entity: string;
  attributes: Record<string, any>;
}

/**
 * Deep-clones an object value into a plain, structured-cloneable form. Object
 * values often arrive as Svelte 5 `$state` proxies (a searched food twin staged
 * in component state, a recipe's ingredient list), and a proxy cannot cross the
 * Web Worker `postMessage` boundary — it throws "could not be cloned". A JSON
 * round-trip strips the proxy and matches the ledger's storage contract, since
 * every value is JSON-encoded on write (`db.core.ts`) anyway. Primitives (the
 * common case — names, unit strings, base64 photos) pass straight through.
 */
function toPlainValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Transforms a structured EntityPayload into an array of immutable EAVT datoms
 * ready to be appended to the ledger.
 *
 * @param payload - The entity + attribute map to flatten.
 * @param now     - Unix ms timestamp; defaults to Date.now().
 */
export function ingestEntity(
  payload: EntityPayload,
  now: number = Date.now()
): Datom[] {
  if (!payload.entity) {
    throw new Error("entity field is required and must be non-empty");
  }

  const entries = Object.entries(payload.attributes);
  if (entries.length === 0) {
    throw new Error(
      "attributes map must contain at least one entry; got empty object"
    );
  }

  return entries.map(([attribute, value]) => ({
    entity: payload.entity,
    attribute,
    value: toPlainValue(value),
    time: now,
  }));
}
