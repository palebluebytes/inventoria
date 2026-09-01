import { computeMediaLibraryState } from "../media/state";
import { computeAcquisitionState } from "../acquisition/state";
import { computeHabitLineages } from "../habits/state";
import { computeCalEvents } from "../cal_events/state";
import { computeConsumption } from "../food/consumption-state";
import { HLC_ORDER_ASC } from "./hlc";

// Every projection reads the same columns in the same HLC order; only the WHERE
// scope differs. `time` stays selected as domain metadata; the HLC columns let
// the compute folds order events by `compareHlc`.
const COLS = "entity, attribute, value, time, hlc_ms, hlc_ctr, device_id";
const inHlcOrder = (where: string) =>
  `SELECT ${COLS} FROM datoms WHERE ${where} ORDER BY ${HLC_ORDER_ASC}`;

/**
 * A named projection: the SELECT that pulls its input datoms, paired with the
 * pure function that folds those rows into derived state. Colocating the two
 * keeps a projection's inputs next to its compute step, so the worker stays a
 * thin dispatcher rather than carrying per-projection SQL.
 */
export interface Projection {
  sql: string;
  compute: (rows: any[]) => unknown;
}

export const projections: Record<string, Projection> = {
  // Media twins are heterogeneously named (tmdb:movie:, tmdb:tv:, isbn:, olid:)
  // so the twin arm is attribute-scoped, which is safe because `media/` has one
  // writer. The event arm is entity-scoped: it used to take the whole of
  // `event/%` and fold away everything that was not a WatchAction, which read
  // every consume, execute, occur and acquire row to do it.
  MEDIA_LIBRARY: {
    sql: inHlcOrder("attribute LIKE 'media/%' OR entity LIKE 'event:engage_%'"),
    compute: computeMediaLibraryState,
  },
  // Entity-scoped on both arms (ADR-0086 §5). This selected `attribute LIKE
  // 'twin/%'`, and `twin/` is the shell every ingested entity gets — so every
  // food twin was promoted to an acquisition and shown in the Items tab as a
  // nameless "wanted" item (#280). Renaming the attributes alone would have
  // fixed that by accident and left the structure armed for the next domain to
  // write a descriptor, so the predicate names the entities instead. ADR-0076 §4
  // forbids scoping a Facet-scoped operation by an attribute namespace, and
  // ADR-0079 §1 made this projection a prerequisite of the scoped wipe.
  ACQUISITION_LIBRARY: {
    sql: inHlcOrder("entity LIKE 'twin:%' OR entity LIKE 'event:acquire_%'"),
    compute: computeAcquisitionState,
  },
  HABITS_LINEAGES: {
    sql: inHlcOrder("entity LIKE 'habit:%' OR entity LIKE 'event:execute_%'"),
    compute: computeHabitLineages,
  },
  CAL_EVENTS: {
    sql: inHlcOrder("entity LIKE 'cal_event:%' OR entity LIKE 'event:occur_%'"),
    compute: computeCalEvents,
  },
  // Consume events are entity-scoped; food/recipe twins are heterogeneously
  // named (fdc:, gtin:, food:custom_, recipe:) so they're attribute-scoped, as
  // with media.
  CONSUMPTION: {
    sql: inHlcOrder(
      "entity LIKE 'event:consume_%' OR attribute LIKE 'food/%' OR attribute LIKE 'recipe/%'"
    ),
    compute: computeConsumption,
  },
};
