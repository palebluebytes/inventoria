import { ingestEntity, type EntityPayload } from "../ingestion/ingest";
import type { Datom } from "../db/db.client";

export type { EntityPayload };

export interface ExecutionRow {
  time: number;
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
 * @param now          - Unix ms timestamp; defaults to Date.now().
 */
export function logExecution(
  habitId: string,
  instrumentId: string,
  now: number = Date.now()
): Datom[] {
  const eventId = `event:execute_${now}_${Math.random().toString(36).slice(2, 9)}`;

  return [
    {
      entity: eventId,
      attribute: "event/type",
      value: "ExerciseAction",
      time: now,
    },
    { entity: eventId, attribute: "event/target", value: habitId, time: now },
    {
      entity: eventId,
      attribute: "event/instrument_used",
      value: instrumentId,
      time: now,
    },
    {
      entity: eventId,
      attribute: "event/status",
      value: "completed",
      time: now,
    },
  ];
}

// ---------------------------------------------------------------------------
// Streak computation
// ---------------------------------------------------------------------------

/** Returns the UTC calendar date string "YYYY-MM-DD" for a Unix ms timestamp */
function toUTCDateStr(ms: number): string {
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
