import { readable } from "svelte/store";
import { dbClient } from "../db/db.client";
import {
  ingestCalEvent,
  logOccurrence as rawLogOccurrence,
  type CalEventBlueprint,
  type OccurrenceRecord,
} from "../cal_events/cal_events";
import type { ScheduleRule } from "../habits/habits";

export type { CalEventBlueprint, OccurrenceRecord };

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

function createCalEventsStore() {
  // Mutable cache for occurrence lookup without subscribing to the store
  let _occurrences: OccurrenceRecord[] = [];

  const store = readable<CalEventBlueprint[]>([], (set) => {
    let live = true;

    async function refresh() {
      try {
        const calEventRows = await dbClient.query<{
          entity: string;
          attribute: string;
          value: string;
          time: number;
        }>(
          "SELECT entity, attribute, value, time FROM datoms WHERE entity LIKE 'cal_event:%' ORDER BY time ASC"
        );

        const occurrenceRows = await dbClient.query<{
          entity: string;
          attribute: string;
          value: string;
          time: number;
        }>(
          "SELECT entity, attribute, value, time FROM datoms WHERE entity LIKE 'event:occur_%' ORDER BY time ASC"
        );

        if (!live) return;

        // Build blueprints
        const bpMap = new Map<string, Record<string, any>>();
        for (const row of calEventRows) {
          if (!bpMap.has(row.entity)) {
            bpMap.set(row.entity, { entity: row.entity, _time: row.time });
          }
          const bp = bpMap.get(row.entity)!;
          const key = row.attribute.replace("cal_event/", "");
          try {
            bp[key] = JSON.parse(row.value);
          } catch {
            bp[key] = row.value;
          }
        }

        const blueprints: CalEventBlueprint[] = Array.from(bpMap.values())
          .filter((bp) => bp.title && bp.dtstart)
          .map((bp) => ({
            entity: bp.entity,
            title: bp.title as string,
            dtstart: bp.dtstart as string,
            dtend: (bp.dtend as string | undefined) ?? undefined,
            description: (bp.description as string | undefined) ?? undefined,
            tracking: (bp.tracking as boolean) ?? true,
            timed: (bp.timed as boolean) ?? true,
            schedule_rules: bp.schedule_rules
              ? typeof bp.schedule_rules === "string"
                ? (JSON.parse(bp.schedule_rules) as ScheduleRule)
                : (bp.schedule_rules as ScheduleRule)
              : undefined,
            time: bp._time as number,
          }));

        // Build occurrences
        const occMap = new Map<string, Record<string, any>>();
        for (const row of occurrenceRows) {
          if (!occMap.has(row.entity)) {
            occMap.set(row.entity, { entity: row.entity, _time: row.time });
          }
          const occ = occMap.get(row.entity)!;
          const key = row.attribute.replace("event/", "");
          try {
            occ[key] = JSON.parse(row.value);
          } catch {
            occ[key] = row.value;
          }
        }

        _occurrences = Array.from(occMap.values())
          .filter((o) => o.target)
          .map((o) => ({
            entity: o.entity as string,
            target: o.target as string,
            slot_id: (o.slot_id as string | undefined) ?? undefined,
            status: "completed" as const,
            time: o._time as number,
          }));

        set(blueprints);
      } catch (e) {
        console.error("calEventsStore: refresh error", e);
      }
    }

    refresh();
    const unsub = dbClient.onInvalidate(() => {
      if (live) refresh();
    });
    return () => {
      live = false;
      unsub();
    };
  });

  return {
    subscribe: store.subscribe,

    /** All confirmed occurrences for a given date (by tap timestamp). */
    getOccurrencesForDate(dateStr: string): OccurrenceRecord[] {
      return _occurrences.filter((o) => {
        const d = new Date(o.time);
        const occDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        return occDate === dateStr;
      });
    },

    /** Lookup a single occurrence for a slot (by calEventId + optional slotId + date). */
    getOccurrence(
      calEventId: string,
      slotId: string | undefined,
      dateStr: string
    ): OccurrenceRecord | undefined {
      return _occurrences.find((o) => {
        if (o.target !== calEventId) return false;
        if (slotId !== undefined && o.slot_id !== slotId) return false;
        const d = new Date(o.time);
        const occDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        return occDate === dateStr;
      });
    },

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
