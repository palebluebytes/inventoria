import { derived, type Readable } from "svelte/store";
import { dbClient } from "../db/db.client";
import {
  ingestCalEvent,
  logOccurrence as rawLogOccurrence,
  type CalEventBlueprint,
  type OccurrenceRecord,
} from "../cal_events/cal_events";
import type { CalEventsState } from "../cal_events/state";
import { createProjectionStore } from "./datoms.store";

export type { CalEventBlueprint, OccurrenceRecord };

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
//
// One worker-side CAL_EVENTS projection folds blueprints + occurrences together
// (one invalidation → one refresh). It is split into two derived readables:
// calEventsStore (blueprints, plus the append-only actions) and
// calOccurrencesStore (occurrences, cross-referenced by the Agenda via the pure
// findOccurrence/occurrencesForDate lookups in cal_events.ts).

const projection = createProjectionStore<CalEventsState>(
  "CAL_EVENTS",
  {},
  {
    blueprints: [],
    occurrences: [],
  }
);

const blueprints = derived(projection, (s) => s.blueprints);

/** Live confirmed Occurrence Events across the whole ledger. */
export const calOccurrencesStore: Readable<OccurrenceRecord[]> = derived(
  projection,
  (s) => s.occurrences
);

function createCalEventsStore() {
  return {
    subscribe: blueprints.subscribe,

    async createCalEvent(
      blueprint: Omit<CalEventBlueprint, "entity" | "time">
    ): Promise<string> {
      const now = Date.now();
      const slug = blueprint.title
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
      const entityId = `cal_event:${slug}_${now}`;
      const full: CalEventBlueprint = {
        ...blueprint,
        entity: entityId,
        time: now,
      };
      const datoms = ingestCalEvent(full, now);
      await dbClient.append(datoms);
      return entityId;
    },

    async logOccurrence(calEventId: string, slotId?: string): Promise<void> {
      const now = Date.now();
      const datoms = rawLogOccurrence(calEventId, slotId, now);
      await dbClient.append(datoms);
    },
  };
}

export const calEventsStore = createCalEventsStore();
