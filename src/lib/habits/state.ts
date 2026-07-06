import type { StoredDatom } from "../db/db.client";
import { groupByEntity } from "../db/datom-fold";
import { computeHabitScore, computeStreak } from "./habits";
import type { ScheduleRule } from "../recurrence/rules";

export interface HabitBlueprint {
  entity: string;
  name: string;
  category: string;
  schedule_rules: ScheduleRule;
  status: "active" | "archived";
  replaces?: string;
  time: number;
  instrument?: string;
}

export interface ExecutionEvent {
  entity: string;
  type: string;
  target: string;
  status: "completed" | "exempt" | "uncompleted";
  target_id?: string;
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

/**
 * Folds the habit datom stream (blueprints + Execution Events) into Habit
 * Lineages with their derived score and streak. The pure worker-side projection
 * behind `HABITS_LINEAGES` — the same shape as `computeMediaLibraryState` /
 * `computeAcquisitionState`, testable datoms-in/lineages-out.
 *
 * Assumes the canonical `habit/schedule_rules` shape; the pre-blueprint
 * `schedule_type` schema is no longer supported.
 */
export function computeHabitLineages(datoms: StoredDatom[]): HabitLineage[] {
  const { twins: blueprintGroups, events: execGroups } = groupByEntity(
    datoms,
    "habit/"
  );

  const allBlueprints: HabitBlueprint[] = Array.from(
    blueprintGroups.values()
  ).map((g) => {
    const f = g.fields as Record<string, any>;
    let rules: ScheduleRule = { type: "daily_multiple", count: 1 };
    if (f.schedule_rules) {
      rules =
        typeof f.schedule_rules === "string"
          ? JSON.parse(f.schedule_rules)
          : f.schedule_rules;
    }
    return {
      entity: g.id,
      name: f.name || "",
      category: f.category || "Fitness",
      schedule_rules: rules,
      status: f.status || "active",
      replaces: f.replaces || undefined,
      time: g.firstTime,
      instrument: f.instrument || undefined,
    };
  });

  const allExecs: ExecutionEvent[] = Array.from(execGroups.values())
    .map((g) => {
      const f = g.fields as Record<string, any>;
      return {
        entity: g.id,
        type: f.type || "ExerciseAction",
        target: f.target || "",
        status: f.status,
        target_id: f.target_id || undefined,
        time: g.firstTime,
        instrument_used: f.instrument_used || undefined,
        metadata: f.metadata || undefined,
      };
    })
    .filter((e) => e.target);

  const lineages: HabitLineage[] = [];
  const activeBlueprints = allBlueprints.filter((bp) => bp.status === "active");
  const replacedSet = new Set(
    allBlueprints.map((bp) => bp.replaces).filter(Boolean)
  );

  // Head blueprints are active ones that aren't replaced by another blueprint.
  const heads = activeBlueprints.filter((bp) => !replacedSet.has(bp.entity));

  for (const head of heads) {
    const chain: HabitBlueprint[] = [head];
    let current = head;
    while (current.replaces) {
      const prev = allBlueprints.find((bp) => bp.entity === current.replaces);
      if (prev) {
        chain.push(prev);
        current = prev;
      } else {
        break;
      }
    }
    // Oldest first
    chain.reverse();

    const chainEntityIds = new Set(chain.map((bp) => bp.entity));
    const chainExecs = allExecs.filter((e) => chainEntityIds.has(e.target));

    const score = computeHabitScore(chain, chainExecs);
    const streak = computeStreak(chainExecs, chain);

    lineages.push({
      head,
      blueprints: chain,
      executions: chainExecs,
      score,
      streak,
    });
  }

  return lineages;
}
