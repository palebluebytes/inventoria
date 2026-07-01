import { computeMediaLibraryState } from "../media/state";
import { computeAcquisitionState } from "../acquisition/state";
import { computeHabitLineages } from "../habits/state";
import { computeCalEvents } from "../cal_events/state";

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
    sql: "SELECT entity, attribute, value, time FROM datoms WHERE attribute LIKE 'media/%' OR attribute LIKE 'event/%' ORDER BY time ASC",
    compute: computeMediaLibraryState,
  },
  ACQUISITION_LIBRARY: {
    sql: "SELECT entity, attribute, value, time FROM datoms WHERE attribute LIKE 'twin/%' OR attribute LIKE 'event/%' ORDER BY time ASC",
    compute: computeAcquisitionState,
  },
  HABITS_LINEAGES: {
    sql: "SELECT entity, attribute, value, time FROM datoms WHERE entity LIKE 'habit:%' OR entity LIKE 'event:execute_%' ORDER BY time ASC",
    compute: computeHabitLineages,
  },
  CAL_EVENTS: {
    sql: "SELECT entity, attribute, value, time FROM datoms WHERE entity LIKE 'cal_event:%' OR entity LIKE 'event:occur_%' ORDER BY time ASC",
    compute: computeCalEvents,
  },
};
