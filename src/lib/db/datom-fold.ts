import type { StoredDatom } from "./db.client";
import type { HlcKey } from "./hlc";

/**
 * Parses a stored datom value. Values are JSON-encoded in the ledger, but a few
 * attributes hold opaque strings that may not be valid JSON — or could parse
 * into the wrong type (e.g. a numeric-looking title coercing to a number). For
 * those `stringAttributes` we keep the raw string; non-JSON values fall back to
 * the raw string too.
 */
export function parseDatomValue(
  attribute: string,
  value: unknown,
  stringAttributes: string[] = []
): unknown {
  const raw = String(value);
  try {
    const parsed = JSON.parse(raw);
    if (stringAttributes.includes(attribute) && typeof parsed !== "string") {
      return raw;
    }
    return parsed;
  } catch {
    return raw;
  }
}

export interface EntityGroup {
  id: string;
  /** Domain time of the first datom seen for this entity. */
  firstTime: number;
  /** Domain time of the most recent datom seen for this entity. */
  lastTime: number;
  /**
   * HLC of the entity's earliest datom. Rows arrive in HLC order, so this is the
   * entity's minimum stamp — the key callers use to order events by `compareHlc`.
   */
  firstStamp: HlcKey;
  /** Attribute (prefix stripped) → parsed value. */
  fields: Record<string, unknown>;
}

/**
 * Folds a datom stream into per-entity field maps, split into "twins" (entities
 * whose attribute starts with any of `twinPrefix`) and "events" (attribute
 * starting with `event/`). The matching prefix is stripped from each field
 * name. `twinPrefix` accepts a single prefix or a list — the Consumption
 * projection passes `["food/", "recipe/"]` since a recipe twin carries both.
 * Shared by the media, acquisition and consumption projections, which then
 * enrich twins with their events.
 */
export function groupByEntity(
  datoms: StoredDatom[],
  twinPrefix: string | string[],
  stringAttributes: string[] = []
): { twins: Map<string, EntityGroup>; events: Map<string, EntityGroup> } {
  const twinPrefixes = Array.isArray(twinPrefix) ? twinPrefix : [twinPrefix];
  const twins = new Map<string, EntityGroup>();
  const events = new Map<string, EntityGroup>();

  for (const {
    entity,
    attribute,
    value,
    time,
    hlc_ms,
    hlc_ctr,
    device_id,
  } of datoms) {
    let target: Map<string, EntityGroup> | undefined;
    let field = "";
    const matchedPrefix = twinPrefixes.find((p) => attribute.startsWith(p));
    if (matchedPrefix) {
      target = twins;
      field = attribute.slice(matchedPrefix.length);
    } else if (attribute.startsWith("event/")) {
      target = events;
      field = attribute.slice("event/".length);
    }
    if (!target) continue;

    let group = target.get(entity);
    if (!group) {
      group = {
        id: entity,
        firstTime: time,
        lastTime: time,
        firstStamp: { hlc_ms, hlc_ctr, device_id },
        fields: {},
      };
      target.set(entity, group);
    }
    group.lastTime = Math.max(group.lastTime, time);
    group.fields[field] = parseDatomValue(attribute, value, stringAttributes);
  }

  return { twins, events };
}
