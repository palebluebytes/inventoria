import type { Datom } from "../db/db.client";

export interface EntityPayload {
  entity: string;
  attributes: Record<string, string>;
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
    value,
    time: now,
  }));
}
