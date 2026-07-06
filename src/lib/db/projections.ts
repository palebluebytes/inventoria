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
  MEDIA_LIBRARY: {
    sql: inHlcOrder("attribute LIKE 'media/%' OR attribute LIKE 'event/%'"),
    compute: computeMediaLibraryState,
  },
  ACQUISITION_LIBRARY: {
    sql: inHlcOrder("attribute LIKE 'twin/%' OR attribute LIKE 'event/%'"),
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
