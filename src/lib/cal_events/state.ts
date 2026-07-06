import type { StoredDatom } from "../db/db.client";
import { groupByEntity } from "../db/datom-fold";
import type {
  CalEventBlueprint,
  OccurrenceRecord,
  ScheduleRule,
} from "./cal_events";

export interface CalEventsState {
  blueprints: CalEventBlueprint[];
  occurrences: OccurrenceRecord[];
}

/**
 * Folds the calendar datom stream (Calendar Event Blueprints + Occurrence
 * Events) into blueprints and occurrences. The pure worker-side projection
 * behind `CAL_EVENTS`.
 *
 * Occurrences stay a distinct array rather than folding into a blueprint: one
 * recurring blueprint owns many (slot, date) occurrences, so there is no single
 * status to collapse onto it. The Agenda cross-references the two via the pure
 * lookups in `cal_events.ts`.
 */
export function computeCalEvents(datoms: StoredDatom[]): CalEventsState {
  const { twins: bpGroups, events: occGroups } = groupByEntity(
    datoms,
    "cal_event/"
  );

  const blueprints: CalEventBlueprint[] = Array.from(bpGroups.values())
    .map((g) => {
      const f = g.fields as Record<string, any>;
      return {
        entity: g.id,
        title: f.title as string,
        dtstart: f.dtstart as string,
        dtend: (f.dtend as string | undefined) ?? undefined,
        description: (f.description as string | undefined) ?? undefined,
        tracking: (f.tracking as boolean) ?? true,
        timed: (f.timed as boolean) ?? true,
        schedule_rules: f.schedule_rules
          ? typeof f.schedule_rules === "string"
            ? (JSON.parse(f.schedule_rules) as ScheduleRule)
            : (f.schedule_rules as ScheduleRule)
          : undefined,
        time: g.firstTime,
      };
    })
    .filter((bp) => bp.title && bp.dtstart);

  const occurrences: OccurrenceRecord[] = Array.from(occGroups.values())
    .map((g) => {
      const f = g.fields as Record<string, any>;
      return {
        entity: g.id,
        target: f.target as string,
        slot_id: (f.slot_id as string | undefined) ?? undefined,
        status: "completed" as const,
        time: g.firstTime,
      };
    })
    .filter((o) => o.target);

  return { blueprints, occurrences };
}
