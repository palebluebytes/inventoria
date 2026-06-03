import { describe, it, expect } from "vitest";
import { logAcquisitionEvent } from "../../src/lib/ingestion/acquisition";
import { computeAcquisitionState } from "../../src/lib/acquisition/state";

describe("logAcquisitionEvent", () => {
  it("creates an AcquisitionAction event datom list with correct attributes", () => {
    const timestamp = 1234567890;
    const datoms = logAcquisitionEvent(
      "gtin:1234567890123",
      "wanted",
      timestamp
    );

    expect(datoms).toContainEqual({
      entity: expect.stringMatching(/^event:acquire_/),
      attribute: "event/type",
      value: "AcquisitionAction",
      time: timestamp,
    });

    expect(datoms).toContainEqual({
      entity: expect.stringMatching(/^event:acquire_/),
      attribute: "event/target",
      value: "gtin:1234567890123",
      time: timestamp,
    });

    expect(datoms).toContainEqual({
      entity: expect.stringMatching(/^event:acquire_/),
      attribute: "event/status",
      value: "wanted",
      time: timestamp,
    });
  });
});

describe("computeAcquisitionState", () => {
  it("groups datoms into digital twins with their latest acquisition status", () => {
    const datoms = [
      // Twin: Sustainable T-Shirt
      {
        entity: "gtin:1234567890123",
        attribute: "twin/name",
        value: "Sustainable T-Shirt",
        time: 1000,
      },
      {
        entity: "gtin:1234567890123",
        attribute: "twin/image",
        value: "image-url",
        time: 1000,
      },
      {
        entity: "gtin:1234567890123",
        attribute: "twin/description",
        value: "Made from organic cotton.",
        time: 1000,
      },
      {
        entity: "gtin:1234567890123",
        attribute: "twin/brand",
        value: "EcoBrand",
        time: 1000,
      },

      // Event 1: Acquire T-Shirt (Wanted)
      {
        entity: "event:acquire_1",
        attribute: "event/type",
        value: "AcquisitionAction",
        time: 2000,
      },
      {
        entity: "event:acquire_1",
        attribute: "event/target",
        value: "gtin:1234567890123",
        time: 2000,
      },
      {
        entity: "event:acquire_1",
        attribute: "event/status",
        value: "wanted",
        time: 2000,
      },

      // Event 2: Acquire T-Shirt (Owned)
      {
        entity: "event:acquire_2",
        attribute: "event/type",
        value: "AcquisitionAction",
        time: 3000,
      },
      {
        entity: "event:acquire_2",
        attribute: "event/target",
        value: "gtin:1234567890123",
        time: 3000,
      },
      {
        entity: "event:acquire_2",
        attribute: "event/status",
        value: "owned",
        time: 3000,
      },
    ];

    const result = computeAcquisitionState(datoms);

    expect(result).toHaveLength(1);

    const shirt = result[0];
    expect(shirt.id).toBe("gtin:1234567890123");
    expect(shirt.name).toBe("Sustainable T-Shirt");
    expect(shirt.brand).toBe("EcoBrand");
    expect(shirt.status).toBe("owned");
    expect(shirt.last_updated).toBe(3000);
  });

  it("extracts and aggregates tags and notes from the ledger, preferring the latest", () => {
    const datoms = [
      {
        entity: "gtin:9999",
        attribute: "twin/name",
        value: "Eco Notebook",
        time: 1000,
      },
      {
        entity: "gtin:9999",
        attribute: "twin/tags",
        value: JSON.stringify(["stationery", "paper"]),
        time: 1000,
      },
      {
        entity: "gtin:9999",
        attribute: "twin/note",
        value: "First note draft.",
        time: 1000,
      },
      // Event: Acquire wanted
      {
        entity: "event:acquire_3",
        attribute: "event/type",
        value: "AcquisitionAction",
        time: 1500,
      },
      {
        entity: "event:acquire_3",
        attribute: "event/target",
        value: "gtin:9999",
        time: 1500,
      },
      {
        entity: "event:acquire_3",
        attribute: "event/status",
        value: "wanted",
        time: 1500,
      },
      // Later metadata updates
      {
        entity: "gtin:9999",
        attribute: "twin/tags",
        value: JSON.stringify(["stationery", "recycled", "office"]),
        time: 2000,
      },
      {
        entity: "gtin:9999",
        attribute: "twin/note",
        value: "Updated note context.",
        time: 2500,
      },
    ];

    const result = computeAcquisitionState(datoms);
    expect(result).toHaveLength(1);
    const item = result[0];
    expect(item.tags).toEqual(["stationery", "recycled", "office"]);
    expect(item.note).toBe("Updated note context.");
    expect(item.last_updated).toBe(2500);
  });
});
