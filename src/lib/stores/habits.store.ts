import { readable, type Readable } from "svelte/store";
import { dbClient, type Datom } from "../db/db.client";
import { ingestEntity } from "../ingestion/ingest";
import {
  logExecution,
  computeHabitScore,
  computeStreak,
} from "../habits/habits";

export interface HabitBlueprint {
  entity: string;
  name: string;
  category: string;
  schedule_type: "daily" | "weekly";
  schedule_value: number;
  status: "active" | "archived";
  replaces?: string;
  time: number;
  instrument?: string;
}

export interface ExecutionEvent {
  entity: string;
  type: string;
  target: string;
  status: string;
  time: number;
  instrument_used?: string;
  metadata?: {
    note?: string;
    difficulty?: "easy" | "medium" | "hard";
    duration?: number;
  };
}

export interface HabitLineage {
  head: HabitBlueprint;
  blueprints: HabitBlueprint[]; // oldest first
  executions: ExecutionEvent[]; // all executions targeting any version in lineage
  score: number; // Habit strength (0.0 to 1.0)
  streak: number; // Current streak
}

// Global habits store
export const habitsStore = createHabitsStore();

function createHabitsStore() {
  const store = readable<HabitLineage[]>([], (set) => {
    let live = true;

    async function refresh() {
      try {
        // Fetch all habit datoms
        const habitRows = await dbClient.query<{
          entity: string;
          attribute: string;
          value: string;
          time: number;
        }>(
          "SELECT entity, attribute, value, time FROM datoms WHERE entity LIKE 'habit:%' ORDER BY time ASC"
        );

        // Fetch all execution event datoms
        const execRows = await dbClient.query<{
          entity: string;
          attribute: string;
          value: string;
          time: number;
        }>(
          "SELECT entity, attribute, value, time FROM datoms WHERE entity LIKE 'event:execute_%' ORDER BY time ASC"
        );

        if (!live) return;

        // Group habit datoms by blueprint entity
        const blueprintsMap = new Map<string, any>();
        for (const row of habitRows) {
          if (!blueprintsMap.has(row.entity)) {
            blueprintsMap.set(row.entity, {
              entity: row.entity,
              time: row.time,
            });
          }
          const bp = blueprintsMap.get(row.entity);
          const key = row.attribute.replace("habit/", ""); // e.g. "name", "category"
          let val;
          try {
            val = JSON.parse(row.value);
          } catch {
            val = row.value;
          }
          bp[key] = val;
        }

        const allBlueprints: HabitBlueprint[] = Array.from(
          blueprintsMap.values()
        ).map((bp) => ({
          entity: bp.entity,
          name: bp.name || "",
          category: bp.category || "Fitness",
          schedule_type: bp.schedule_type || "daily",
          schedule_value: bp.schedule_value ? Number(bp.schedule_value) : 1,
          status: bp.status || "active",
          replaces: bp.replaces || undefined,
          time: bp.time,
          instrument: bp.instrument || undefined,
        }));

        // Group execution datoms by event entity
        const execsMap = new Map<string, any>();
        for (const row of execRows) {
          if (!execsMap.has(row.entity)) {
            execsMap.set(row.entity, {
              entity: row.entity,
              time: row.time,
            });
          }
          const event = execsMap.get(row.entity);
          const key = row.attribute.replace("event/", "");
          let val;
          try {
            val = JSON.parse(row.value);
          } catch {
            val = row.value;
          }
          event[key] = val;
        }

        const allExecs: ExecutionEvent[] = Array.from(execsMap.values())
          .map((ev) => ({
            entity: ev.entity,
            type: ev.type || "ExerciseAction",
            target: ev.target || "",
            status: ev.status || "completed",
            time: ev.time,
            instrument_used: ev.instrument_used || undefined,
            metadata: ev.metadata || undefined,
          }))
          .filter((e) => e.target);

        // Build lineages
        const lineages: HabitLineage[] = [];
        const activeBlueprints = allBlueprints.filter(
          (bp) => bp.status === "active"
        );
        const replacedSet = new Set(
          allBlueprints.map((bp) => bp.replaces).filter(Boolean)
        );

        // Head blueprints are active ones that aren't replaced by another blueprint
        const heads = activeBlueprints.filter(
          (bp) => !replacedSet.has(bp.entity)
        );

        for (const head of heads) {
          const chain: HabitBlueprint[] = [head];
          let current = head;
          while (current.replaces) {
            const prev = allBlueprints.find(
              (bp) => bp.entity === current.replaces
            );
            if (prev) {
              chain.push(prev);
              current = prev;
            } else {
              break;
            }
          }
          // Sort oldest first
          chain.reverse();

          // Get executions targeting any version in this lineage
          const chainEntityIds = new Set(chain.map((bp) => bp.entity));
          const chainExecs = allExecs.filter((e) =>
            chainEntityIds.has(e.target)
          );

          const score = computeHabitScore(chain, chainExecs);
          const streak = computeStreak(chainExecs);

          lineages.push({
            head,
            blueprints: chain,
            executions: chainExecs,
            score,
            streak,
          });
        }

        set(lineages);
      } catch (e) {
        console.error("Error refreshing habits store:", e);
      }
    }

    refresh();

    const unsubscribe = dbClient.onInvalidate(() => {
      if (live) refresh();
    });

    return () => {
      live = false;
      unsubscribe();
    };
  });

  return {
    subscribe: store.subscribe,

    async createHabit(
      name: string,
      category: string,
      schedule_type: "daily" | "weekly",
      schedule_value: number,
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
          "habit/schedule_type": schedule_type,
          "habit/schedule_value": schedule_value,
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
      schedule_type: "daily" | "weekly",
      schedule_value: number,
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
          "habit/schedule_type": schedule_type,
          "habit/schedule_value": schedule_value,
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
      }
    ) {
      const datoms = logExecution(habitId, instrumentId, metadata);
      await dbClient.append(datoms);
    },
  };
}
