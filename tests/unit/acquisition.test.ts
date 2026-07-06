import { describe, it, expect } from "vitest";
import { logAcquisitionEvent } from "../../src/lib/ingestion/acquisition";
import { computeAcquisitionState } from "../../src/lib/acquisition/state";
import { asStored } from "./support/stored";

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

    const result = computeAcquisitionState(asStored(datoms));

    expect(result).toHaveLength(1);

    const shirt = result[0];
    expect(shirt.id).toBe("gtin:1234567890123");
    expect(shirt.name).toBe("Sustainable T-Shirt");
    expect(shirt.brand).toBe("EcoBrand");
    expect(shirt.status).toBe("owned");
    expect(shirt.last_updated).toBe(3000);
  });

  it("resolves events in HLC order, not domain time, under clock skew (ADR-0020)", () => {
    // Two acquisition events whose HLC order is the reverse of their `time`.
    // The HLC-later event ("owned") carries the EARLIER domain time, so a
    // time-based fold would wrongly pick "wanted". HLC order must win.
    const acquire = (
      id: string,
      status: string,
      time: number,
      hlc_ms: number
    ) =>
      ["event/type", "event/target", "event/status"].map((attribute) => ({
        entity: id,
        attribute,
        value:
          attribute === "event/type"
            ? "AcquisitionAction"
            : attribute === "event/target"
              ? "gtin:skew"
              : status,
        time,
        hlc_ms,
        hlc_ctr: 0,
        device_id: "dev-a",
      }));

    const datoms = [
      {
        entity: "gtin:skew",
        attribute: "twin/name",
        value: "Skewed",
        time: 1,
        hlc_ms: 1,
        hlc_ctr: 0,
        device_id: "dev-a",
      },
      ...acquire("event:acquire_early_hlc", "wanted", 9000, 2000),
      ...acquire("event:acquire_late_hlc", "owned", 1000, 5000),
    ];

    const [item] = computeAcquisitionState(datoms);
    expect(item.status).toBe("owned");
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

    const result = computeAcquisitionState(asStored(datoms));
    expect(result).toHaveLength(1);
    const item = result[0];
    expect(item.tags).toEqual(["stationery", "recycled", "office"]);
    expect(item.note).toBe("Updated note context.");
    expect(item.last_updated).toBe(2500);
  });
});
