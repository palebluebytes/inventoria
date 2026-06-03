import { describe, it, expect, vi, beforeEach } from "vitest";
import { dbClient } from "../../src/lib/db/db.client";
import { habitsStore } from "../../src/lib/stores/habits.store";

vi.mock("../../src/lib/db/db.client", () => {
  return {
    dbClient: {
      query: vi.fn(),
      append: vi.fn(),
      onInvalidate: vi.fn(() => () => {}),
    },
  };
});

describe("Habits Store Client Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createHabit", () => {
    it("appends new habit datoms to the ledger", async () => {
      const mockAppend = vi
        .spyOn(dbClient, "append")
        .mockResolvedValue(undefined);

      const entityId = await habitsStore.createHabit(
        "Kettlebell Swings",
        "Fitness",
        "weekly",
        4,
        "twin:kettlebell_16kg"
      );

      expect(entityId).toMatch(/^habit:kettlebell_swings_/);
      expect(mockAppend).toHaveBeenCalledTimes(1);

      const appendedDatoms = mockAppend.mock.calls[0][0];
      expect(appendedDatoms.length).toBe(6); // name, category, schedule_type, schedule_value, status, instrument

      const nameDatom = appendedDatoms.find(
        (d) => d.attribute === "habit/name"
      );
      expect(nameDatom?.value).toBe("Kettlebell Swings");

      const categoryDatom = appendedDatoms.find(
        (d) => d.attribute === "habit/category"
      );
      expect(categoryDatom?.value).toBe("Fitness");

      const typeDatom = appendedDatoms.find(
        (d) => d.attribute === "habit/schedule_type"
      );
      expect(typeDatom?.value).toBe("weekly");

      const valDatom = appendedDatoms.find(
        (d) => d.attribute === "habit/schedule_value"
      );
      expect(valDatom?.value).toBe(4);

      const statusDatom = appendedDatoms.find(
        (d) => d.attribute === "habit/status"
      );
      expect(statusDatom?.value).toBe("active");

      const instrumentDatom = appendedDatoms.find(
        (d) => d.attribute === "habit/instrument"
      );
      expect(instrumentDatom?.value).toBe("twin:kettlebell_16kg");
    });
  });

  describe("updateHabit (Version Chaining)", () => {
    it("archives the old habit blueprint and creates a new one linked via habit/replaces", async () => {
      const mockAppend = vi
        .spyOn(dbClient, "append")
        .mockResolvedValue(undefined);

      const oldBlueprint = {
        entity: "habit:kettlebell_swings_12345",
        name: "Kettlebell Swings",
        category: "Fitness",
        schedule_type: "weekly" as const,
        schedule_value: 3,
        status: "active" as const,
        time: 12345,
      };

      const newEntityId = await habitsStore.updateHabit(
        oldBlueprint,
        "Kettlebell Swings (Heavy)",
        "Fitness",
        "daily",
        1,
        "twin:kettlebell_24kg"
      );

      expect(newEntityId).toMatch(/^habit:kettlebell_swings_\(heavy\)_/);
      expect(mockAppend).toHaveBeenCalledTimes(1);

      const appendedDatoms = mockAppend.mock.calls[0][0];
      // 1 status datom for old archive + 7 datoms for new blueprint (name, category, type, val, status, replaces, instrument)
      expect(appendedDatoms.length).toBe(8);

      // Verify archiving
      const archiveDatom = appendedDatoms.find(
        (d) =>
          d.entity === oldBlueprint.entity && d.attribute === "habit/status"
      );
      expect(archiveDatom?.value).toBe("archived");

      // Verify new version links back to the old one
      const replacesDatom = appendedDatoms.find(
        (d) => d.entity === newEntityId && d.attribute === "habit/replaces"
      );
      expect(replacesDatom?.value).toBe(oldBlueprint.entity);

      const nameDatom = appendedDatoms.find(
        (d) => d.entity === newEntityId && d.attribute === "habit/name"
      );
      expect(nameDatom?.value).toBe("Kettlebell Swings (Heavy)");

      const instrDatom = appendedDatoms.find(
        (d) => d.entity === newEntityId && d.attribute === "habit/instrument"
      );
      expect(instrDatom?.value).toBe("twin:kettlebell_24kg");
    });
  });

  describe("archiveHabit", () => {
    it("archives a habit blueprint by writing an archived status datom", async () => {
      const mockAppend = vi
        .spyOn(dbClient, "append")
        .mockResolvedValue(undefined);

      await habitsStore.archiveHabit("habit:kettlebell_swings_12345");

      expect(mockAppend).toHaveBeenCalledTimes(1);
      const appendedDatoms = mockAppend.mock.calls[0][0];
      expect(appendedDatoms.length).toBe(1);
      expect(appendedDatoms[0].entity).toBe("habit:kettlebell_swings_12345");
      expect(appendedDatoms[0].attribute).toBe("habit/status");
      expect(appendedDatoms[0].value).toBe("archived");
    });
  });

  describe("logExecution", () => {
    it("logs a habit execution with optional metadata", async () => {
      const mockAppend = vi
        .spyOn(dbClient, "append")
        .mockResolvedValue(undefined);

      await habitsStore.logExecution(
        "habit:kettlebell_swings_12345",
        "twin:kettlebell_16kg",
        {
          note: "Felt strong today",
          difficulty: "easy",
          duration: 15,
        }
      );

      expect(mockAppend).toHaveBeenCalledTimes(1);
      const appendedDatoms = mockAppend.mock.calls[0][0];

      // Verifying event type, target, instrument_used, status, and metadata datoms
      expect(appendedDatoms.length).toBe(5);

      const typeDatom = appendedDatoms.find(
        (d) => d.attribute === "event/type"
      );
      expect(typeDatom?.value).toBe("ExerciseAction");

      const targetDatom = appendedDatoms.find(
        (d) => d.attribute === "event/target"
      );
      expect(targetDatom?.value).toBe("habit:kettlebell_swings_12345");

      const metadataDatom = appendedDatoms.find(
        (d) => d.attribute === "event/metadata"
      );
      expect(metadataDatom?.value).toEqual({
        note: "Felt strong today",
        difficulty: "easy",
        duration: 15,
      });
    });
  });
});
