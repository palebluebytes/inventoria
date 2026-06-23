import { describe, it, expect } from "vitest";
import {
  ingestHabit,
  logExecution,
  computeStreak,
  computeHabitScore,
  getDailyLineageStates,
  getActiveExecutions,
  countActiveDaysInWindow,
  toLocalDateStr,
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
    const datoms = logExecution(
      "habit:swing_01",
      "twin:kettlebell_16kg",
      undefined,
      "completed",
      undefined,
      9000
    );
    const typeDatom = datoms.find((d) => d.attribute === "event/type");
    expect(typeDatom?.value).toBe("ExerciseAction");
  });

  it("sets event/target to the habitId", () => {
    const datoms = logExecution(
      "habit:swing_01",
      "twin:kettlebell_16kg",
      undefined,
      "completed",
      undefined,
      9000
    );
    const targetDatom = datoms.find((d) => d.attribute === "event/target");
    expect(targetDatom?.value).toBe("habit:swing_01");
  });

  it("sets event/instrument_used to the instrumentId", () => {
    const datoms = logExecution(
      "habit:swing_01",
      "twin:kettlebell_16kg",
      undefined,
      "completed",
      undefined,
      9000
    );
    const instrDatom = datoms.find(
      (d) => d.attribute === "event/instrument_used"
    );
    expect(instrDatom?.value).toBe("twin:kettlebell_16kg");
  });

  it("sets event/status to completed", () => {
    const datoms = logExecution(
      "habit:swing_01",
      "twin:kettlebell_16kg",
      undefined,
      "completed",
      undefined,
      9000
    );
    const statusDatom = datoms.find((d) => d.attribute === "event/status");
    expect(statusDatom?.value).toBe("completed");
  });

  it("entity uses event: prefix with unique suffix", () => {
    const datoms = logExecution(
      "habit:swing_01",
      "twin:kettlebell_16kg",
      undefined,
      "completed",
      undefined,
      9000
    );
    expect(datoms[0].entity).toMatch(/^event:/);
  });

  it("two calls produce unique entity IDs", () => {
    const a = logExecution(
      "habit:swing_01",
      "twin:k16",
      undefined,
      "completed",
      undefined,
      1000
    );
    const b = logExecution(
      "habit:swing_01",
      "twin:k16",
      undefined,
      "completed",
      undefined,
      2000
    );
    expect(a[0].entity).not.toBe(b[0].entity);
  });
});

// ---- unit: computeStreak ---------------------------------------------------

describe("computeStreak", () => {
  /** Returns a Unix-ms timestamp for a given number of days ago at local noon */
  function daysAgo(n: number): number {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.getTime();
  }

  it("returns 0 for empty execution list", () => {
    expect(computeStreak([])).toBe(0);
  });

  it("returns 1 for a single execution today", () => {
    const rows: ExecutionRow[] = [{ time: daysAgo(0), status: "completed" }];
    expect(computeStreak(rows)).toBe(1);
  });

  it("returns 2 for executions today and yesterday", () => {
    const rows: ExecutionRow[] = [
      { time: daysAgo(0), status: "completed" },
      { time: daysAgo(1), status: "completed" },
    ];
    expect(computeStreak(rows)).toBe(2);
  });

  it("returns streak of 5 for five consecutive days", () => {
    const rows: ExecutionRow[] = [0, 1, 2, 3, 4].map((n) => ({
      time: daysAgo(n),
      status: "completed",
    }));
    expect(computeStreak(rows)).toBe(5);
  });

  it("breaks streak on gap day", () => {
    // Today, yesterday, then gap, then 3 days ago
    const rows: ExecutionRow[] = [
      { time: daysAgo(0), status: "completed" },
      { time: daysAgo(1), status: "completed" },
      { time: daysAgo(3), status: "completed" }, // gap on day 2
    ];
    expect(computeStreak(rows)).toBe(2);
  });

  it("returns 0 when most recent execution is more than 1 day ago", () => {
    const rows: ExecutionRow[] = [{ time: daysAgo(2), status: "completed" }];
    expect(computeStreak(rows)).toBe(0);
  });
});

// ---- unit: computeHabitScore -----------------------------------------------

describe("computeHabitScore", () => {
  function daysAgo(n: number): number {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.getTime();
  }

  it("returns 0 for empty blueprints", () => {
    expect(computeHabitScore([], [])).toBe(0);
  });

  it("returns low score for a single execution on a daily habit", () => {
    const blueprints = [
      {
        entity: "habit:1",
        time: daysAgo(1),
        schedule_rules: { type: "daily_multiple" as const, count: 1 },
      },
    ];
    const execs = [
      { time: daysAgo(0), target: "habit:1", status: "completed" },
    ];
    const score = computeHabitScore(blueprints, execs, daysAgo(0));
    expect(score).toBe(0.15); // first day score = 0.15
  });

  it("grows score with daily completions", () => {
    const blueprints = [
      {
        entity: "habit:1",
        time: daysAgo(3),
        schedule_rules: { type: "daily_multiple" as const, count: 1 },
      },
    ];
    const execs = [
      { time: daysAgo(3), target: "habit:1", status: "completed" },
      { time: daysAgo(2), target: "habit:1", status: "completed" },
      { time: daysAgo(1), target: "habit:1", status: "completed" },
      { time: daysAgo(0), target: "habit:1", status: "completed" },
    ];
    const score = computeHabitScore(blueprints, execs, daysAgo(0));
    // S0 = 0.15
    // S1 = 0.15 + 0.85 * 0.15 = 0.2775
    // S2 = 0.2775 + 0.7225 * 0.15 = 0.385875
    // S3 = 0.385875 + 0.614125 * 0.15 = 0.47799375 -> 0.48
    expect(score).toBe(0.48);
  });

  it("decays score when daily habit is missed", () => {
    const blueprints = [
      {
        entity: "habit:1",
        time: daysAgo(2),
        schedule_rules: { type: "daily_multiple" as const, count: 1 },
      },
    ];
    const execs = [
      { time: daysAgo(2), target: "habit:1", status: "completed" },
    ]; // completed day 2, missed day 1 & day 0
    const score = computeHabitScore(blueprints, execs, daysAgo(0));
    // S_2 = 0.15
    // S_1 = 0.15 * 0.85 = 0.1275
    // S_0 = 0.1275 * 0.85 = 0.108375 -> 0.11
    expect(score).toBe(0.11);
  });

  it("works with weekly habit rolling window target", () => {
    const blueprints = [
      {
        entity: "habit:1",
        time: daysAgo(7),
        schedule_rules: { type: "weekly_flexible" as const, count: 3 },
      },
    ];
    // Executed 3 times inside the 7 days
    const execs = [
      { time: daysAgo(6), target: "habit:1", status: "completed" },
      { time: daysAgo(4), target: "habit:1", status: "completed" },
      { time: daysAgo(2), target: "habit:1", status: "completed" },
    ];
    const score = computeHabitScore(blueprints, execs, daysAgo(0));
    // It should have grown on days because the rolling 7-day window had completions.
    expect(score).toBeGreaterThan(0.2);
  });
});

describe("logExecution with metadata", () => {
  it("includes event/metadata datom when metadata is passed", () => {
    const datoms = logExecution(
      "habit:swing_01",
      "twin:kettlebell_16kg",
      { note: "Felt heavy", difficulty: "hard" },
      "completed",
      undefined,
      9000
    );
    const metaDatom = datoms.find((d) => d.attribute === "event/metadata");
    expect(metaDatom?.value).toEqual({
      note: "Felt heavy",
      difficulty: "hard",
    });
  });
});

describe("advanced scheduling and exempt calculations", () => {
  function daysAgo(n: number): number {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.getTime();
  }

  it("handles daily_multiple with sub-targets", () => {
    const blueprints = [
      {
        entity: "habit:subtargets",
        time: daysAgo(3),
        schedule_rules: {
          type: "daily_multiple" as const,
          targets: [
            { id: "morning", time_hint: "08:00" },
            { id: "evening", time_hint: "20:00" },
          ],
        },
      },
    ];

    const execs = [
      {
        time: daysAgo(2),
        target: "habit:subtargets",
        target_id: "morning",
        status: "completed",
      },
      {
        time: daysAgo(1),
        target: "habit:subtargets",
        target_id: "morning",
        status: "completed",
      },
      {
        time: daysAgo(1),
        target: "habit:subtargets",
        target_id: "evening",
        status: "completed",
      },
      {
        time: daysAgo(0),
        target: "habit:subtargets",
        target_id: "morning",
        status: "completed",
      },
      {
        time: daysAgo(0),
        target: "habit:subtargets",
        target_id: "evening",
        status: "completed",
      },
    ];

    const states = getDailyLineageStates(blueprints, execs, daysAgo(0));
    expect(states.get(toLocalDateStr(daysAgo(2)))?.status).toBe("failed");
    expect(states.get(toLocalDateStr(daysAgo(1)))?.status).toBe("completed");
    expect(states.get(toLocalDateStr(daysAgo(0)))?.status).toBe("completed");

    const streak = computeStreak(execs, blueprints, daysAgo(0));
    expect(streak).toBe(2);
  });

  it("handles uncompleted status to toggle/cycle done state", () => {
    const blueprints = [
      {
        entity: "habit:toggle",
        time: daysAgo(3),
        schedule_rules: {
          type: "daily_multiple" as const,
          targets: [{ id: "morning", time_hint: "08:00" }],
        },
      },
    ];

    const execs = [
      {
        time: daysAgo(1),
        target: "habit:toggle",
        target_id: "morning",
        status: "completed",
      },
      {
        time: daysAgo(1) + 1000,
        target: "habit:toggle",
        target_id: "morning",
        status: "uncompleted",
      },
    ];

    const states = getDailyLineageStates(blueprints, execs, daysAgo(0));
    expect(states.get(toLocalDateStr(daysAgo(1)))?.status).toBe("failed");
  });

  it("handles weekly_days schedule", () => {
    // Build the most recent Monday at local noon. Noon anchoring keeps the
    // `+ k * 86400000` assertions on the correct local date across DST shifts.
    const monday = new Date();
    const daysSinceMonday = (monday.getDay() + 6) % 7;
    monday.setHours(12, 0, 0, 0);
    monday.setDate(monday.getDate() - daysSinceMonday);
    const mondayMs = monday.getTime();

    const blueprints = [
      {
        entity: "habit:days",
        time: mondayMs - 86400000,
        schedule_rules: {
          type: "weekly_days" as const,
          days: ["mon" as const, "wed" as const, "fri" as const],
        },
      },
    ];

    const execs = [
      { time: mondayMs, target: "habit:days", status: "completed" },
      {
        time: mondayMs + 2 * 86400000,
        target: "habit:days",
        status: "completed",
      },
      { time: mondayMs + 4 * 86400000, target: "habit:days", status: "exempt" },
    ];

    const states = getDailyLineageStates(
      blueprints,
      execs,
      mondayMs + 4 * 86400000
    );

    expect(states.get(toLocalDateStr(mondayMs))?.status).toBe("completed");
    expect(states.get(toLocalDateStr(mondayMs + 86400000))?.status).toBe("off");
    expect(states.get(toLocalDateStr(mondayMs + 2 * 86400000))?.status).toBe(
      "completed"
    );
    expect(states.get(toLocalDateStr(mondayMs + 3 * 86400000))?.status).toBe(
      "off"
    );
    expect(states.get(toLocalDateStr(mondayMs + 4 * 86400000))?.status).toBe(
      "exempt"
    );

    const streak = computeStreak(execs, blueprints, mondayMs + 4 * 86400000);
    expect(streak).toBe(2);
  });

  it("handles weekly_flexible schedule", () => {
    const blueprints = [
      {
        entity: "habit:flex",
        time: daysAgo(10),
        schedule_rules: {
          type: "weekly_flexible" as const,
          count: 3,
        },
      },
    ];

    const execs = [
      { time: daysAgo(6), target: "habit:flex", status: "completed" },
      { time: daysAgo(4), target: "habit:flex", status: "completed" },
      { time: daysAgo(2), target: "habit:flex", status: "completed" },
    ];

    const states = getDailyLineageStates(blueprints, execs, daysAgo(0));
    expect(states.get(toLocalDateStr(daysAgo(2)))?.status).toBe("completed");
    expect(states.get(toLocalDateStr(daysAgo(1)))?.status).toBe("completed");
    expect(states.get(toLocalDateStr(daysAgo(0)))?.status).toBe("completed");
  });

  it("counts weekly_flexible days per-day so a later undo can't cancel an earlier day", () => {
    // A bare uncompleted on day-1 has nothing to undo *that day*; it must not
    // reach back and cancel day-3's or day-5's completion. This is the engine /
    // agenda-pill drift that countActiveDaysInWindow fixes: resolving undos
    // window-wide would (wrongly) leave only one active day.
    const execs = [
      { time: daysAgo(5), target: "habit:flex", status: "completed" },
      { time: daysAgo(3), target: "habit:flex", status: "completed" },
      { time: daysAgo(1), target: "habit:flex", status: "uncompleted" },
    ];

    expect(countActiveDaysInWindow(execs, daysAgo(0))).toBe(2);

    // And the heatmap engine agrees, since it shares the same helper.
    const blueprints = [
      {
        entity: "habit:flex",
        time: daysAgo(10),
        schedule_rules: { type: "weekly_flexible" as const, count: 2 },
      },
    ];
    const states = getDailyLineageStates(blueprints, execs, daysAgo(0));
    expect(states.get(toLocalDateStr(daysAgo(0)))?.status).toBe("completed");
  });

  it("pauses streak on exempt executions", () => {
    const blueprints = [
      {
        entity: "habit:exempt",
        time: daysAgo(5),
        schedule_rules: { type: "daily_multiple" as const, count: 1 },
      },
    ];

    const execs = [
      { time: daysAgo(3), target: "habit:exempt", status: "completed" },
      { time: daysAgo(2), target: "habit:exempt", status: "completed" },
      { time: daysAgo(1), target: "habit:exempt", status: "exempt" },
      { time: daysAgo(0), target: "habit:exempt", status: "completed" },
    ];

    const streak = computeStreak(execs, blueprints, daysAgo(0));
    expect(streak).toBe(3);

    const states = getDailyLineageStates(blueprints, execs, daysAgo(0));
    expect(states.get(toLocalDateStr(daysAgo(1)))?.status).toBe("exempt");
  });
});

describe("getActiveExecutions (single-undo semantics)", () => {
  it("removes only the most recent completion on an uncompleted (simple habit)", () => {
    // Three reps logged for a quantitative habit (no target_id), then one undo.
    const execs: ExecutionRow[] = [
      { time: 1000, status: "completed" },
      { time: 2000, status: "completed" },
      { time: 3000, status: "completed" },
      { time: 4000, status: "uncompleted" },
    ];
    const active = getActiveExecutions(execs);
    // Exactly one rep undone, not the whole day.
    expect(active.filter((e) => e.status === "completed")).toHaveLength(2);
    // The most recent (t=3000) was the one removed.
    expect(active.map((e) => e.time)).toEqual([1000, 2000]);
  });

  it("undoes per target_id for sub-target habits", () => {
    const execs: ExecutionRow[] = [
      { time: 1000, status: "completed", target_id: "morning" },
      { time: 2000, status: "completed", target_id: "evening" },
      { time: 3000, status: "uncompleted", target_id: "morning" },
    ];
    const active = getActiveExecutions(execs);
    expect(active.map((e) => e.target_id)).toEqual(["evening"]);
  });

  it("is a no-op when there is nothing to undo", () => {
    const execs: ExecutionRow[] = [{ time: 1000, status: "uncompleted" }];
    expect(getActiveExecutions(execs)).toHaveLength(0);
  });
});

describe("weekly_flexible counts only completed days", () => {
  function daysAgo(n: number): number {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.getTime();
  }

  it("does not count a day whose completion was undone", () => {
    const blueprints = [
      {
        entity: "habit:flex",
        time: daysAgo(10),
        schedule_rules: { type: "weekly_flexible" as const, count: 3 },
      },
    ];
    // Two real completions, plus today completed-then-undone. With the undone
    // day excluded the rolling week has only 2 of 3 → today must be "failed".
    // (The old bug counted the undone day as done, yielding 3 → "completed".)
    const execs = [
      { time: daysAgo(2), target: "habit:flex", status: "completed" },
      { time: daysAgo(1), target: "habit:flex", status: "completed" },
      { time: daysAgo(0), target: "habit:flex", status: "completed" },
      { time: daysAgo(0) + 1000, target: "habit:flex", status: "uncompleted" },
    ];
    const states = getDailyLineageStates(blueprints, execs, daysAgo(0));
    expect(states.get(toLocalDateStr(daysAgo(0)))?.status).toBe("failed");
  });
});
