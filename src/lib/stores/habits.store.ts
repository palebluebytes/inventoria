import { dbClient, type Datom } from "../db/db.client";
import { ingestEntity } from "../ingestion/ingest";
import {
  logExecution as rawLogExecution,
  type ScheduleRule,
} from "../habits/habits";
import type { HabitBlueprint, HabitLineage } from "../habits/state";
import { createProjectionStore } from "./datoms.store";

export type {
  HabitBlueprint,
  ExecutionEvent,
  HabitLineage,
} from "../habits/state";

// Global habits store: worker-side HABITS_LINEAGES projection folded by
// computeHabitLineages, plus the append-only action methods.
export const habitsStore = createHabitsStore();

function createHabitsStore() {
  const store = createProjectionStore<HabitLineage[]>(
    "HABITS_LINEAGES",
    {},
    []
  );

  return {
    subscribe: store.subscribe,

    async createHabit(
      name: string,
      category: string,
      schedule_rules: ScheduleRule,
      instrument: string
    ) {
      const now = Date.now();
      const slug = name.trim().toLowerCase().replace(/\s+/g, "_");
      const entityId = `habit:${slug}_${now}`;

      const payload = {
        entity: entityId,
        attributes: {
          "habit/name": name.trim(),
          "habit/category": category,
          "habit/schedule_rules": JSON.stringify(schedule_rules),
          "habit/status": "active",
          ...(instrument.trim()
            ? { "habit/instrument": instrument.trim() }
            : {}),
        },
      };

      const datoms = ingestEntity(payload, now);
      await dbClient.append(datoms);
      return entityId;
    },

    async updateHabit(
      oldEntity: HabitBlueprint,
      name: string,
      category: string,
      schedule_rules: ScheduleRule,
      instrument: string
    ) {
      const now = Date.now();

      // 1. Archive the old blueprint
      const archiveDatoms: Datom[] = [
        {
          entity: oldEntity.entity,
          attribute: "habit/status",
          value: "archived",
          time: now,
        },
      ];

      // 2. Create the new blueprint
      const slug = name.trim().toLowerCase().replace(/\s+/g, "_");
      const newEntityId = `habit:${slug}_${now}`;

      const payload = {
        entity: newEntityId,
        attributes: {
          "habit/name": name.trim(),
          "habit/category": category,
          "habit/schedule_rules": JSON.stringify(schedule_rules),
          "habit/status": "active",
          "habit/replaces": oldEntity.entity,
          ...(instrument.trim()
            ? { "habit/instrument": instrument.trim() }
            : {}),
        },
      };

      const newBlueprintDatoms = ingestEntity(payload, now);
      await dbClient.append([...archiveDatoms, ...newBlueprintDatoms]);
      return newEntityId;
    },

    async archiveHabit(entityId: string) {
      const now = Date.now();
      const datoms: Datom[] = [
        {
          entity: entityId,
          attribute: "habit/status",
          value: "archived",
          time: now,
        },
      ];
      await dbClient.append(datoms);
    },

    async logExecution(
      habitId: string,
      instrumentId: string,
      metadata?: {
        note?: string;
        difficulty?: "easy" | "medium" | "hard";
        duration?: number;
      },
      status: "completed" | "exempt" | "uncompleted" = "completed",
      target_id?: string,
      custom_time?: number
    ) {
      const datoms = rawLogExecution(
        habitId,
        instrumentId,
        metadata,
        status,
        target_id,
        custom_time
      );
      await dbClient.append(datoms);
    },
  };
}
