import { ingestEntity, type EntityPayload } from "../ingestion/ingest";
import type { Datom } from "../db/db.client";

export type { EntityPayload };

export interface DailyMultipleRule {
  type: "daily_multiple";
  count?: number;
  targets?: { id: string; time_hint?: string }[];
}

export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface WeeklyDaysRule {
  type: "weekly_days";
  days: DayOfWeek[];
}

export interface WeeklyFlexibleRule {
  type: "weekly_flexible";
  count: number;
}

export type ScheduleRule =
  | DailyMultipleRule
  | WeeklyDaysRule
  | WeeklyFlexibleRule;

export interface ExecutionRow {
  time: number;
  target?: string;
  status?: string;
  target_id?: string;
}

// ---------------------------------------------------------------------------
// Habit ingestion
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper: ingests a habit blueprint EntityPayload into datoms.
 * Delegates to the generic ingestEntity transformer.
 */
export function ingestHabit(
  payload: EntityPayload,
  now: number = Date.now()
): Datom[] {
  return ingestEntity(payload, now);
}

// ---------------------------------------------------------------------------
// Execution event logging
// ---------------------------------------------------------------------------

/**
 * Creates an immutable execution event record (ExerciseAction) referencing
 * a habit entity.
 */
export function logExecution(
  habitId: string,
  instrumentId: string,
  metadata?: {
    note?: string;
    difficulty?: "easy" | "medium" | "hard";
    duration?: number;
  },
  status: "completed" | "exempt" = "completed",
  target_id?: string,
  now: number = Date.now()
): Datom[] {
  const eventId = `event:execute_${now}_${Math.random().toString(36).slice(2, 9)}`;

  const datoms: Datom[] = [
    {
      entity: eventId,
      attribute: "event/type",
      value: "ExerciseAction",
      time: now,
    },
    { entity: eventId, attribute: "event/target", value: habitId, time: now },
    {
      entity: eventId,
      attribute: "event/status",
      value: status,
      time: now,
    },
  ];

  if (target_id) {
    datoms.push({
      entity: eventId,
      attribute: "event/target_id",
      value: target_id,
      time: now,
    });
  }

  if (instrumentId) {
    datoms.push({
      entity: eventId,
      attribute: "event/instrument_used",
      value: instrumentId,
      time: now,
    });
  }

  if (metadata) {
    datoms.push({
      entity: eventId,
      attribute: "event/metadata",
      value: metadata,
      time: now,
    });
  }

  return datoms;
}

// ---------------------------------------------------------------------------
// Streak and Score computation
// ---------------------------------------------------------------------------

/** Returns the UTC calendar date string "YYYY-MM-DD" for a Unix ms timestamp */
export function toUTCDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export interface DayState {
  status: "completed" | "exempt" | "off" | "failed";
  fraction: number;
  blueprintId: string;
}

export function getDailyLineageStates(
  lineageBlueprints: {
    entity: string;
    time: number;
    schedule_rules: string | object;
  }[],
  executions: {
    time: number;
    target: string;
    status?: string;
    target_id?: string;
  }[],
  asOfTimestamp: number = Date.now()
): Map<string, DayState> {
  const states = new Map<string, DayState>();
  if (lineageBlueprints.length === 0) return states;

  // Sort blueprints chronologically
  const sortedBlueprints = [...lineageBlueprints].sort(
    (a, b) => a.time - b.time
  );

  // Determine start boundary
  let startMs = sortedBlueprints[0].time;
  if (executions.length > 0) {
    const firstExecTime = Math.min(...executions.map((e) => e.time));
    if (firstExecTime < startMs) {
      startMs = firstExecTime;
    }
  }

  const startDayStr = toUTCDateStr(startMs);
  const endDayStr = toUTCDateStr(asOfTimestamp);

  const startDay = new Date(startDayStr + "T00:00:00Z");
  const endDay = new Date(endDayStr + "T00:00:00Z");

  // Map executions by date
  const execsByDate = new Map<string, typeof executions>();
  for (const exec of executions) {
    const dateStr = toUTCDateStr(exec.time);
    if (!execsByDate.has(dateStr)) {
      execsByDate.set(dateStr, []);
    }
    execsByDate.get(dateStr)!.push(exec);
  }

  const currentDay = new Date(startDay);
  while (currentDay <= endDay) {
    const currentMs = currentDay.getTime();
    const currentDayStr = toUTCDateStr(currentMs);

    // Find active blueprint on this day
    let activeBlueprint = sortedBlueprints[0];
    for (const bp of sortedBlueprints) {
      if (bp.time <= currentMs + 86400000 - 1) {
        activeBlueprint = bp;
      } else {
        break;
      }
    }

    // Parse schedule rules
    let rules: any = { type: "daily_multiple", count: 1 };
    if (activeBlueprint.schedule_rules) {
      rules =
        typeof activeBlueprint.schedule_rules === "string"
          ? JSON.parse(activeBlueprint.schedule_rules)
          : activeBlueprint.schedule_rules;
    }

    const dayExecs = dayExecsFiltered(dayExecsRaw(execsByDate, currentDayStr));
    const hasExempt = dayExecsRaw(execsByDate, currentDayStr).some(
      (e) => e.status === "exempt"
    );

    if (hasExempt) {
      states.set(currentDayStr, {
        status: "exempt",
        fraction: 1.0,
        blueprintId: activeBlueprint.entity,
      });
    } else {
      let status: DayState["status"] = "failed";
      let fraction = 0;

      if (rules.type === "daily_multiple") {
        if (
          rules.targets &&
          Array.isArray(rules.targets) &&
          rules.targets.length > 0
        ) {
          const completedTargets = new Set<string>();
          for (const e of dayExecs) {
            if (e.target_id) {
              completedTargets.add(e.target_id);
            }
          }
          let matched = 0;
          for (const target of rules.targets) {
            if (completedTargets.has(target.id)) {
              matched++;
            }
          }
          fraction = matched / rules.targets.length;
          status = matched === rules.targets.length ? "completed" : "failed";
        } else {
          const requiredCount = rules.count ?? 1;
          const completedCount = dayExecs.length;
          fraction =
            requiredCount > 0
              ? Math.min(1.0, completedCount / requiredCount)
              : 1.0;
          status = completedCount >= requiredCount ? "completed" : "failed";
        }
      } else if (rules.type === "weekly_days") {
        const daysOfWeek = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        const dayStr = daysOfWeek[currentDay.getUTCDay()];
        const scheduledDays = Array.isArray(rules.days)
          ? rules.days.map((d: string) => d.toLowerCase())
          : [];

        if (scheduledDays.includes(dayStr)) {
          const completedCount = dayExecs.length;
          fraction = completedCount >= 1 ? 1.0 : 0.0;
          status = completedCount >= 1 ? "completed" : "failed";
        } else {
          status = "off";
          fraction = 1.0;
        }
      } else if (rules.type === "weekly_flexible") {
        const requiredCount = rules.count ?? 1;
        let completedDays = 0;

        for (let offset = 0; offset < 7; offset++) {
          const checkDay = new Date(currentMs - offset * 24 * 60 * 60 * 1000);
          const checkDayStr = toUTCDateStr(checkDay.getTime());
          const checkExecs = execsByDate.get(checkDayStr) || [];

          const checkCompleted = checkExecs.some((e) => e.status !== "exempt");
          const checkExempt = checkExecs.some((e) => e.status === "exempt");
          if (checkCompleted || checkExempt) {
            completedDays++;
          }
        }
        fraction =
          requiredCount > 0
            ? Math.min(1.0, completedDays / requiredCount)
            : 1.0;
        status = completedDays >= requiredCount ? "completed" : "failed";
      }

      states.set(currentDayStr, {
        status,
        fraction,
        blueprintId: activeBlueprint.entity,
      });
    }

    currentDay.setUTCDate(currentDay.getUTCDate() + 1);
  }

  return states;
}

function dayExecsRaw(execsByDate: Map<string, any[]>, dateStr: string): any[] {
  return execsByDate.get(dateStr) || [];
}

function dayExecsFiltered(rawExecs: any[]): any[] {
  return rawExecs.filter((e) => e.status !== "exempt");
}

export function computeStreak(
  executions: { time: number; status?: string; target_id?: string }[],
  lineageBlueprints: {
    entity: string;
    time: number;
    schedule_rules: string | object;
  }[] = [],
  asOfTimestamp: number = Date.now()
): number {
  let blueprints = [...lineageBlueprints];
  if (blueprints.length === 0 && executions.length > 0) {
    const earliest = Math.min(...executions.map((e) => e.time));
    blueprints = [
      {
        entity: "legacy_habit",
        time: earliest - 1000,
        schedule_rules: { type: "daily_multiple", count: 1 },
      },
    ];
  }

  if (blueprints.length === 0) return 0;

  const states = getDailyLineageStates(
    blueprints,
    executions as any,
    asOfTimestamp
  );
  if (states.size === 0) return 0;

  const todayStr = toUTCDateStr(asOfTimestamp);
  const yesterdayStr = toUTCDateStr(asOfTimestamp - 86400000);

  const sortedDays = Array.from(states.entries()).sort((a, b) =>
    b[0].localeCompare(a[0])
  );

  let startIndex = -1;
  const todayState = states.get(todayStr);
  const yesterdayState = states.get(yesterdayStr);

  if (
    todayState &&
    (todayState.status === "completed" ||
      todayState.status === "exempt" ||
      todayState.status === "off")
  ) {
    startIndex = 0;
  } else if (
    yesterdayState &&
    (yesterdayState.status === "completed" ||
      yesterdayState.status === "exempt" ||
      yesterdayState.status === "off")
  ) {
    startIndex = sortedDays.findIndex((d) => d[0] === yesterdayStr);
  }

  if (startIndex === -1) return 0;

  let streak = 0;
  for (let i = startIndex; i < sortedDays.length; i++) {
    const dayState = sortedDays[i][1];
    if (dayState.status === "completed") {
      streak++;
    } else if (dayState.status === "exempt" || dayState.status === "off") {
      continue;
    } else {
      break;
    }
  }

  return streak;
}

export function computeHabitScore(
  lineageBlueprints: {
    entity: string;
    time: number;
    schedule_rules: string | object;
  }[],
  executions: {
    time: number;
    target: string;
    status?: string;
    target_id?: string;
  }[],
  asOfTimestamp: number = Date.now()
): number {
  if (lineageBlueprints.length === 0) return 0;
  const states = getDailyLineageStates(
    lineageBlueprints,
    executions,
    asOfTimestamp
  );
  if (states.size === 0) return 0;

  const sortedStates = Array.from(states.values());

  let score = 0;
  for (const dayState of sortedStates) {
    if (dayState.status === "completed") {
      score = score + (1 - score) * 0.15;
    } else if (dayState.status === "failed") {
      score = score * 0.85;
    }
  }

  return Math.round(score * 100) / 100;
}
