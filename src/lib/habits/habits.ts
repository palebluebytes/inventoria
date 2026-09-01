import { ingestEntity, type EntityPayload } from "../ingestion/ingest";
import { mintEntity } from "../facets/entity-id";
import type { Datom } from "../db/db.client";
import { isScheduleRuleActive } from "../recurrence/rules";
import type { ScheduleRule, DayOfWeek } from "../recurrence/rules";

export type { EntityPayload, ScheduleRule, DayOfWeek };

export interface ExecutionRow {
  time: number;
  target?: string;
  status: "completed" | "exempt" | "uncompleted";
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
  status: "completed" | "exempt" | "uncompleted" = "completed",
  target_id?: string,
  now: number = Date.now()
): Datom[] {
  const eventId = mintEntity(
    "event:execute_",
    `${now}_${Math.random().toString(36).slice(2, 9)}`
  );

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

/**
 * Returns the LOCAL calendar date string "YYYY-MM-DD" for a Unix ms timestamp.
 *
 * The user's local day defines which day an event belongs to (consistent with
 * food logging); the event's `time` timestamp remains the source of truth for
 * when it actually happened.
 */
export function toLocalDateStr(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parses a "YYYY-MM-DD" local date string into a Date at local midnight. */
export function localDateStrToDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

/**
 * The timestamp an execution event should be recorded with for a selected local
 * day. Logging on today's row uses the real "now"; for any other day we anchor
 * to local noon so the event buckets onto that local calendar day (consistent
 * with food logging).
 */
export function eventTimestampForDay(
  dateStr: string,
  now: number = Date.now()
): number {
  if (dateStr === toLocalDateStr(now)) return now;
  return new Date(dateStr + "T12:00:00").getTime();
}

export interface DayState {
  status: "completed" | "exempt" | "off" | "failed";
  fraction: number;
  blueprintId: string;
}

/**
 * Counts the distinct local days in the trailing `windowDays`-day window ending
 * at `refDayMs` (a local-midnight timestamp) that count toward a weekly_flexible
 * goal — i.e. days with a completed or exempt execution once per-day undos are
 * resolved. Shared by the heatmap engine and the agenda pill so they cannot
 * disagree: resolving undos per day (not across the whole window) means a later
 * undo never cancels an earlier day's completion.
 */
export function countActiveDaysInWindow(
  executions: { time: number; status: string; target_id?: string }[],
  refDayMs: number,
  windowDays = 7
): number {
  const cursor = new Date(refDayMs);
  let count = 0;
  for (let i = 0; i < windowDays; i++) {
    const dayStr = toLocalDateStr(cursor.getTime());
    const dayExecs = getActiveExecutions(
      executions.filter((e) => toLocalDateStr(e.time) === dayStr)
    );
    if (
      dayExecs.some((e) => e.status === "completed" || e.status === "exempt")
    ) {
      count++;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
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
    status: string;
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

  const startDayStr = toLocalDateStr(startMs);
  const endDayStr = toLocalDateStr(asOfTimestamp);

  const startDay = localDateStrToDate(startDayStr);
  const endDay = localDateStrToDate(endDayStr);

  // Map executions by date
  const execsByDate = new Map<string, typeof executions>();
  for (const exec of executions) {
    const dateStr = toLocalDateStr(exec.time);
    if (!execsByDate.has(dateStr)) {
      execsByDate.set(dateStr, []);
    }
    execsByDate.get(dateStr)!.push(exec);
  }

  const currentDay = new Date(startDay);
  while (currentDay <= endDay) {
    const currentMs = currentDay.getTime();
    const currentDayStr = toLocalDateStr(currentMs);

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
      // Respect the `until` date on all rule types
      if (rules.until && currentDayStr > rules.until) {
        states.set(currentDayStr, {
          status: "off",
          fraction: 1.0,
          blueprintId: activeBlueprint.entity,
        });
        currentDay.setDate(currentDay.getDate() + 1);
        continue;
      }

      const activeExecs = getActiveExecutions(
        execsByDate.get(currentDayStr) || []
      );
      const dayExecs = activeExecs.filter((e) => e.status === "completed");
      const hasExempt = activeExecs.some((e) => e.status === "exempt");

      if (hasExempt) {
        states.set(currentDayStr, {
          status: "exempt",
          fraction: 1.0,
          blueprintId: activeBlueprint.entity,
        });
      } else {
        let status: DayState["status"] = "failed";
        let fraction = 0;

        if (rules.type === "weekly_flexible") {
          const requiredCount = rules.count ?? 1;
          const completedDays = countActiveDaysInWindow(executions, currentMs);
          fraction =
            requiredCount > 0
              ? Math.min(1.0, completedDays / requiredCount)
              : 1.0;
          status = completedDays >= requiredCount ? "completed" : "failed";
        } else {
          if (isScheduleRuleActive(rules, currentDayStr)) {
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
              status =
                matched === rules.targets.length ? "completed" : "failed";
            } else {
              const requiredCount = rules.count ?? 1;
              const completedCount = dayExecs.length;
              fraction =
                requiredCount > 0
                  ? Math.min(1.0, completedCount / requiredCount)
                  : 1.0;
              status = completedCount >= requiredCount ? "completed" : "failed";
            }
          } else {
            status = "off";
            fraction = 1.0;
          }
        }

        states.set(currentDayStr, {
          status,
          fraction,
          blueprintId: activeBlueprint.entity,
        });
      }
    }

    currentDay.setDate(currentDay.getDate() + 1);
  }

  return states;
}

export function getActiveExecutions<
  T extends { status: string; target_id?: string; time: number },
>(executions: T[]): T[] {
  // Order by domain `time` for the LIFO undo. The input already arrives in HLC
  // order from `computeHabitLineages` (ADR-0020), and Array.sort is stable, so
  // same-millisecond executions keep that logical order rather than colliding.
  const sorted = [...executions].sort((a, b) => a.time - b.time);
  const active: T[] = [];
  for (const e of sorted) {
    if (e.status === "completed" || e.status === "exempt") {
      active.push(e);
    } else if (e.status === "uncompleted") {
      // Undo exactly one prior completion — the most recent one matching this
      // target_id (LIFO). For simple/quantitative habits target_id is undefined,
      // so this removes a single rep rather than wiping the whole day.
      for (let i = active.length - 1; i >= 0; i--) {
        if (active[i].target_id === e.target_id) {
          active.splice(i, 1);
          break;
        }
      }
    }
  }
  return active;
}

export function computeStreak(
  executions: { time: number; status: string; target_id?: string }[],
  lineageBlueprints: {
    entity: string;
    time: number;
    schedule_rules: string | object;
  }[] = [],
  asOfTimestamp: number = Date.now()
): number {
  if (lineageBlueprints.length === 0) return 0;

  const states = getDailyLineageStates(
    lineageBlueprints,
    executions as any,
    asOfTimestamp
  );
  if (states.size === 0) return 0;

  const todayStr = toLocalDateStr(asOfTimestamp);
  const yesterday = localDateStrToDate(todayStr);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toLocalDateStr(yesterday.getTime());

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
    status: string;
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
