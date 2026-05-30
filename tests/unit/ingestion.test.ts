import { describe, it, expect } from "vitest";
import {
  ingestEntity,
  type EntityPayload,
} from "../../src/lib/ingestion/ingest";

describe("ingestEntity — EAVT ingestion layer", () => {
  it("emits one datom per attribute for a food twin", () => {
    const payload: EntityPayload = {
      entity: "gtin:3017620422003",
      attributes: {
        "food/name": "Nutella",
        "food/calories": "539 kcal",
        "food/protein": "6.3 g",
      },
    };

    const datoms = ingestEntity(payload, 1000);

    expect(datoms).toHaveLength(3);
    expect(datoms.map((d) => d.attribute)).toEqual(
      expect.arrayContaining(["food/name", "food/calories", "food/protein"])
    );
  });

  it("each datom carries correct entity, attribute, value, and time", () => {
    const payload: EntityPayload = {
      entity: "gtin:3017620422003",
      attributes: { "food/name": "Nutella" },
    };

    const [datom] = ingestEntity(payload, 42000);

    expect(datom.entity).toBe("gtin:3017620422003");
    expect(datom.attribute).toBe("food/name");
    expect(datom.value).toBe("Nutella");
    expect(datom.time).toBe(42000);
  });

  it("maps a habit blueprint payload to datoms", () => {
    const payload: EntityPayload = {
      entity: "habit:swing_01",
      attributes: {
        "habit/name": "1-Arm Swings",
        "habit/instrument": "twin:kettlebell_16kg",
        "habit/target_reps": "10 per side",
        "habit/rest_interval": "90 Seconds",
      },
    };

    const datoms = ingestEntity(payload, 5000);

    expect(datoms).toHaveLength(4);
    const names = datoms.map((d) => d.attribute);
    expect(names).toContain("habit/name");
    expect(names).toContain("habit/instrument");
  });

  it("throws when entity field is missing", () => {
    const payload = {
      entity: "",
      attributes: { "food/name": "Nutella" },
    } as EntityPayload;

    expect(() => ingestEntity(payload)).toThrow(/entity/i);
  });

  it("throws when attributes map is empty", () => {
    const payload: EntityPayload = {
      entity: "gtin:123",
      attributes: {},
    };

    expect(() => ingestEntity(payload)).toThrow(/attributes/i);
  });

  it("uses Date.now() when no timestamp provided", () => {
    const before = Date.now();
    const [datom] = ingestEntity({
      entity: "gtin:123",
      attributes: { "food/name": "X" },
    });
    const after = Date.now();

    expect(datom.time).toBeGreaterThanOrEqual(before);
    expect(datom.time).toBeLessThanOrEqual(after);
  });
});
