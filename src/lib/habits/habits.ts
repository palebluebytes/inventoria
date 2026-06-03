import { ingestEntity, type EntityPayload } from "../ingestion/ingest";
import type { Datom } from "../db/db.client";

export type { EntityPayload };

export interface ExecutionRow {
  time: number;
  target?: string;
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
 *
 * @param habitId      - Entity ID of the habit blueprint (e.g. "habit:swing_01").
 * @param instrumentId - Entity ID of the instrument used (e.g. "twin:kettlebell_16kg").
 * @param metadata     - Optional rich metadata (note, difficulty, duration).
 * @param now          - Unix ms timestamp; defaults to Date.now().
 */
export function logExecution(
  habitId: string,
  instrumentId: string,
  metadata?: {
    note?: string;
    difficulty?: "easy" | "medium" | "hard";
    duration?: number;
  },
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
      value: "completed",
      time: now,
    },
  ];

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

/**
 * Computes the current consecutive-day streak from an array of execution rows
 * ordered by time (most recent first or any order — the function sorts).
 *
 * Rules:
 * - If the most recent execution is not from today or yesterday, streak = 0.
 * - Counts consecutive distinct calendar days working backwards from the most
 *   recent execution.
 */
export function computeStreak(rows: ExecutionRow[]): number {
  if (rows.length === 0) return 0;

  // Collect unique UTC date strings, sorted descending (newest first)
  const uniqueDays = Array.from(
    new Set(rows.map((r) => toUTCDateStr(r.time)))
  ).sort((a, b) => (a > b ? -1 : 1));

  const today = toUTCDateStr(Date.now());
  const yesterday = toUTCDateStr(Date.now() - 86_400_000);

  // Streak only counts if most recent execution is today or yesterday
  if (uniqueDays[0] !== today && uniqueDays[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    // Compute expected previous day
    const prev = new Date(uniqueDays[i - 1]);
    prev.setUTCDate(prev.getUTCDate() - 1);
    const expectedPrev = prev.toISOString().slice(0, 10);

    if (uniqueDays[i] === expectedPrev) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Computes a habit strength score between 0.00 and 1.00 by walking the Habit Lineage.
 * Each completion grows strength; days without completions decay it.
 * Respects changing schedules across blueprints in the lineage.
 */
export function computeHabitScore(
  lineageBlueprints: {
    entity: string;
    time: number;
    schedule_type: string;
    schedule_value?: number;
  }[],
  executions: { time: number; target: string }[],
  asOfTimestamp: number = Date.now()
): number {
  if (lineageBlueprints.length === 0) return 0;

  // Sort blueprints chronologically by their time
  const sortedBlueprints = [...lineageBlueprints].sort(
    (a, b) => a.time - b.time
  );

  // The start timestamp is the minimum of the first blueprint's time or the first execution's time
  let startMs = sortedBlueprints[0].time;
  if (executions.length > 0) {
    const firstExecTime = Math.min(...executions.map((e) => e.time));
    if (firstExecTime < startMs) {
      startMs = firstExecTime;
    }
  }

  // Convert startMs and asOfTimestamp to calendar days (UTC to avoid timezone boundary shifts)
  const startDayStr = toUTCDateStr(startMs);
  const endDayStr = toUTCDateStr(asOfTimestamp);

  const startDay = new Date(startDayStr + "T00:00:00Z");
  const endDay = new Date(endDayStr + "T00:00:00Z");

  // Create a set of execution dates for O(1) daily lookup
  const execDates = new Set(executions.map((e) => toUTCDateStr(e.time)));

  // We also keep the actual execution timestamps for weekly rolling window calculations
  const execTimestamps = executions.map((e) => e.time).sort((a, b) => a - b);

  let score = 0;

  // Iterate day by day from startDay to endDay
  const currentDay = new Date(startDay);
  while (currentDay <= endDay) {
    const currentMs = currentDay.getTime();
    const currentDayStr = toUTCDateStr(currentMs);

    // Find the active blueprint on this day (the most recent blueprint that has time <= currentMs)
    let activeBlueprint = sortedBlueprints[0];
    for (const bp of sortedBlueprints) {
      if (bp.time <= currentMs) {
        activeBlueprint = bp;
      } else {
        break;
      }
    }

    const schedType = activeBlueprint.schedule_type || "daily";
    const schedVal = activeBlueprint.schedule_value ?? 1;

    let targetMet = false;

    if (schedType === "daily") {
      // Completed if there's an execution on this day
      targetMet = execDates.has(currentDayStr);
    } else if (schedType === "weekly") {
      // Completed if there are at least schedVal executions in the rolling 7 days ending at currentMs (inclusive of current day's end)
      const weekStartMs = currentMs - 6 * 24 * 60 * 60 * 1000;
      const weekEndMs = currentMs + 24 * 60 * 60 * 1000 - 1; // end of current day

      const countInWeek = execTimestamps.filter(
        (t) => t >= weekStartMs && t <= weekEndMs
      ).length;

      targetMet = countInWeek >= Number(schedVal);
    }

    if (targetMet) {
      score = score + (1 - score) * 0.15;
    } else {
      score = score * 0.85;
    }

    // Move to next day (UTC)
    currentDay.setUTCDate(currentDay.getUTCDate() + 1);
  }

  return Math.round(score * 100) / 100;
}
