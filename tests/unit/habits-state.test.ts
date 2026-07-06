import { describe, it, expect } from "vitest";
import { computeHabitLineages } from "../../src/lib/habits/state";
import { asStored } from "./support/stored";

const dailyRule = { type: "daily_multiple", count: 1 };

describe("computeHabitLineages", () => {
  it("folds a blueprint and its executions into one lineage", () => {
    const datoms = [
      {
        entity: "habit:run_1",
        attribute: "habit/name",
        value: "Morning Run",
        time: 1000,
      },
      {
        entity: "habit:run_1",
        attribute: "habit/category",
        value: "Fitness",
        time: 1000,
      },
      {
        entity: "habit:run_1",
        attribute: "habit/schedule_rules",
        value: JSON.stringify(dailyRule),
        time: 1000,
      },
      {
        entity: "habit:run_1",
        attribute: "habit/status",
        value: "active",
        time: 1000,
      },
      // Two executions targeting the blueprint
      {
        entity: "event:execute_a",
        attribute: "event/type",
        value: "ExerciseAction",
        time: 2000,
      },
      {
        entity: "event:execute_a",
        attribute: "event/target",
        value: "habit:run_1",
        time: 2000,
      },
      {
        entity: "event:execute_a",
        attribute: "event/status",
        value: "completed",
        time: 2000,
      },
      {
        entity: "event:execute_b",
        attribute: "event/target",
        value: "habit:run_1",
        time: 3000,
      },
      {
        entity: "event:execute_b",
        attribute: "event/status",
        value: "completed",
        time: 3000,
      },
    ];

    const lineages = computeHabitLineages(asStored(datoms));

    expect(lineages).toHaveLength(1);
    const lineage = lineages[0];
    expect(lineage.head.entity).toBe("habit:run_1");
    expect(lineage.head.name).toBe("Morning Run");
    expect(lineage.head.schedule_rules).toEqual(dailyRule);
    expect(lineage.blueprints).toHaveLength(1);
    expect(lineage.executions).toHaveLength(2);
    expect(typeof lineage.score).toBe("number");
    expect(typeof lineage.streak).toBe("number");
  });

  it("chains a replacing blueprint into one lineage, oldest first", () => {
    const datoms = [
      // v1 — archived, replaced by v2
      {
        entity: "habit:run_v1",
        attribute: "habit/name",
        value: "Run",
        time: 1000,
      },
      {
        entity: "habit:run_v1",
        attribute: "habit/schedule_rules",
        value: JSON.stringify(dailyRule),
        time: 1000,
      },
      {
        entity: "habit:run_v1",
        attribute: "habit/status",
        value: "archived",
        time: 2000,
      },
      // v2 — active, replaces v1
      {
        entity: "habit:run_v2",
        attribute: "habit/name",
        value: "Run",
        time: 2000,
      },
      {
        entity: "habit:run_v2",
        attribute: "habit/schedule_rules",
        value: JSON.stringify(dailyRule),
        time: 2000,
      },
      {
        entity: "habit:run_v2",
        attribute: "habit/status",
        value: "active",
        time: 2000,
      },
      {
        entity: "habit:run_v2",
        attribute: "habit/replaces",
        value: "habit:run_v1",
        time: 2000,
      },
      // Execution targeting the old version still belongs to the lineage
      {
        entity: "event:execute_c",
        attribute: "event/target",
        value: "habit:run_v1",
        time: 1500,
      },
      {
        entity: "event:execute_c",
        attribute: "event/status",
        value: "completed",
        time: 1500,
      },
    ];

    const lineages = computeHabitLineages(asStored(datoms));

    expect(lineages).toHaveLength(1);
    const lineage = lineages[0];
    expect(lineage.head.entity).toBe("habit:run_v2");
    expect(lineage.blueprints.map((b) => b.entity)).toEqual([
      "habit:run_v1",
      "habit:run_v2",
    ]);
    expect(lineage.executions).toHaveLength(1);
  });

  it("drops executions with no target and yields no lineage for an archived-only habit", () => {
    const datoms = [
      {
        entity: "habit:gone",
        attribute: "habit/name",
        value: "Gone",
        time: 1000,
      },
      {
        entity: "habit:gone",
        attribute: "habit/status",
        value: "archived",
        time: 1000,
      },
      // Orphan execution with no target attribute
      {
        entity: "event:execute_x",
        attribute: "event/status",
        value: "completed",
        time: 1500,
      },
    ];

    expect(computeHabitLineages(asStored(datoms))).toHaveLength(0);
  });
});
