import { describe, it, expect } from "vitest";
import {
  ingestHabit,
  logExecution,
  computeStreak,
  type ExecutionRow,
} from "../../src/lib/habits/habits";

// ---- unit: ingestHabit -----------------------------------------------------

describe("ingestHabit", () => {
  const habitPayload = {
    entity: "habit:swing_01",
    attributes: {
      "habit/name": "1-Arm Swings",
      "habit/instrument": "twin:kettlebell_16kg",
      "habit/target_reps": "10 per side",
      "habit/rest_interval": "90 Seconds",
    },
  };

  it("emits one datom per attribute", () => {
    const datoms = ingestHabit(habitPayload, 1000);
    expect(datoms).toHaveLength(4);
  });

  it("sets correct entity on all datoms", () => {
    const datoms = ingestHabit(habitPayload, 1000);
    datoms.forEach((d) => expect(d.entity).toBe("habit:swing_01"));
  });

  it("includes habit/name attribute", () => {
    const datoms = ingestHabit(habitPayload, 1000);
    const names = datoms.find((d) => d.attribute === "habit/name");
    expect(names?.value).toBe("1-Arm Swings");
  });
});

// ---- unit: logExecution ----------------------------------------------------

describe("logExecution", () => {
  it("emits datoms with event/type = ExerciseAction", () => {
    const datoms = logExecution("habit:swing_01", "twin:kettlebell_16kg", 9000);
    const typeDatom = datoms.find((d) => d.attribute === "event/type");
    expect(typeDatom?.value).toBe("ExerciseAction");
  });

  it("sets event/target to the habitId", () => {
    const datoms = logExecution("habit:swing_01", "twin:kettlebell_16kg", 9000);
    const targetDatom = datoms.find((d) => d.attribute === "event/target");
    expect(targetDatom?.value).toBe("habit:swing_01");
  });

  it("sets event/instrument_used to the instrumentId", () => {
    const datoms = logExecution("habit:swing_01", "twin:kettlebell_16kg", 9000);
    const instrDatom = datoms.find(
      (d) => d.attribute === "event/instrument_used"
    );
    expect(instrDatom?.value).toBe("twin:kettlebell_16kg");
  });

  it("sets event/status to completed", () => {
    const datoms = logExecution("habit:swing_01", "twin:kettlebell_16kg", 9000);
    const statusDatom = datoms.find((d) => d.attribute === "event/status");
    expect(statusDatom?.value).toBe("completed");
  });

  it("entity uses event: prefix with unique suffix", () => {
    const datoms = logExecution("habit:swing_01", "twin:kettlebell_16kg", 9000);
    expect(datoms[0].entity).toMatch(/^event:/);
  });

  it("two calls produce unique entity IDs", () => {
    const a = logExecution("habit:swing_01", "twin:k16", 1000);
    const b = logExecution("habit:swing_01", "twin:k16", 2000);
    expect(a[0].entity).not.toBe(b[0].entity);
  });
});

// ---- unit: computeStreak ---------------------------------------------------

describe("computeStreak", () => {
  /** Returns a Unix-ms timestamp for a given number of days ago at noon UTC */
  function daysAgo(n: number): number {
    const d = new Date();
    d.setUTCHours(12, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - n);
    return d.getTime();
  }

  it("returns 0 for empty execution list", () => {
    expect(computeStreak([])).toBe(0);
  });

  it("returns 1 for a single execution today", () => {
    const rows: ExecutionRow[] = [{ time: daysAgo(0) }];
    expect(computeStreak(rows)).toBe(1);
  });

  it("returns 2 for executions today and yesterday", () => {
    const rows: ExecutionRow[] = [{ time: daysAgo(0) }, { time: daysAgo(1) }];
    expect(computeStreak(rows)).toBe(2);
  });

  it("returns streak of 5 for five consecutive days", () => {
    const rows: ExecutionRow[] = [0, 1, 2, 3, 4].map((n) => ({
      time: daysAgo(n),
    }));
    expect(computeStreak(rows)).toBe(5);
  });

  it("breaks streak on gap day", () => {
    // Today, yesterday, then gap, then 3 days ago
    const rows: ExecutionRow[] = [
      { time: daysAgo(0) },
      { time: daysAgo(1) },
      { time: daysAgo(3) }, // gap on day 2
    ];
    expect(computeStreak(rows)).toBe(2);
  });

  it("returns 0 when most recent execution is more than 1 day ago", () => {
    const rows: ExecutionRow[] = [{ time: daysAgo(2) }];
    expect(computeStreak(rows)).toBe(0);
  });
});
