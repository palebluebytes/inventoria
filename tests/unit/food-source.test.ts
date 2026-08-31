import { describe, it, expect } from "vitest";
import {
  foodSourceView,
  type FoodSourceView,
} from "../../src/lib/food/food-source";
import type { EntityPayload } from "../../src/lib/ingestion/ingest";
import { buildArrival, FOOD_ARRIVAL_ATTR } from "../../src/lib/food/provenance";

// The source-tag presentation model (ADR-0043 §2) is pure, so assert the origin
// bucket + label + leading icon it reads off each entity-id prefix, including the
// manual catch-all. Every food has an origin, so it is always present (never
// absent). The icon is the prototype's ◆/✎ split: ◆ marks a resolved data source
// (OFF / USDA / a computed recipe), ✎ marks a hand-authored manual entry, and ↓
// marks a food that arrived with a meal somebody sent (ADR-0073 §11).

function food(entity: string): EntityPayload {
  return { entity, attributes: { "food/name": "X" } };
}

describe("foodSourceView — origin from the entity id", () => {
  const cases: [string, FoodSourceView][] = [
    ["gtin:5000159407236", { kind: "off", label: "OFF", icon: "◆" }],
    ["fdc:167512", { kind: "usda", label: "USDA", icon: "◆" }],
    [
      "recipe:ab12cd_1699999999",
      { kind: "recipe", label: "Recipe", icon: "◆" },
    ],
    ["food:custom_a1b2c3", { kind: "manual", label: "Manual", icon: "✎" }],
  ];
  for (const [entity, expected] of cases) {
    it(`reads ${expected.kind} from ${entity}`, () => {
      expect(foodSourceView(food(entity))).toEqual(expected);
    });
  }

  it("reads the ingested record's adapter ahead of the id", () => {
    // A corrected OFF product: the user's label capture sits BESIDE the OFF
    // record it enriched, so the food still descends from OFF and still reads
    // OFF — even were it living under an id with no source prefix.
    const edited: EntityPayload = {
      entity: "food:custom_a1b2c3",
      attributes: {
        "food/name": "X",
        "twin/raw_provenance": {
          adapter: "off",
          adapter_version: "1",
          source_uri: "https://world.openfoodfacts.org/api/v2/product/123",
          raw_data: {},
        },
        "food/label_capture": { adapter: "label" },
      },
    };
    expect(foodSourceView(edited)).toEqual<FoodSourceView>({
      kind: "off",
      label: "OFF",
      icon: "◆",
    });
  });

  it("reads a USDA ingest from its adapter too", () => {
    const usda: EntityPayload = {
      entity: "whatever",
      attributes: {
        "twin/raw_provenance": {
          adapter: "fdc",
          adapter_version: "1",
          source_uri: "https://api.nal.usda.gov/fdc/v1/food/167512",
          raw_data: {},
        },
      },
    };
    expect(foodSourceView(usda).kind).toBe("usda");
  });

  it("ignores an unrecognised adapter and falls through to the id", () => {
    const odd: EntityPayload = {
      entity: "gtin:5000159407236",
      attributes: {
        "twin/raw_provenance": { adapter: "somewhere-else" },
      },
    };
    expect(foodSourceView(odd).kind).toBe("off");
  });

  it("reads the arrival mark ahead of the id", () => {
    // A food that came with a meal somebody sent (ADR-0073 §11). Without the
    // mark this twin matches no prefix and falls through to `manual` — a false
    // claim that the recipient hand-authored it.
    const received: EntityPayload = {
      entity: "food:custom_a1b2c3",
      attributes: {
        "food/name": "Nan's apple cake",
        [FOOD_ARRIVAL_ATTR]: buildArrival(1_756_600_000_000),
      },
    };
    expect(foodSourceView(received)).toEqual<FoodSourceView>({
      kind: "arrival",
      label: "Received",
      icon: "↓",
    });
  });

  it("says received for a food whose source record did not come with it", () => {
    // A received `gtin:` twin: its provenance is never rebuilt (§3), so reading
    // the prefix would claim OFF while carrying none of OFF's record — and the
    // mark is also what explains the missing NOVA verdict.
    const received: EntityPayload = {
      entity: "gtin:5000159407236",
      attributes: {
        "food/name": "Peanut M&M's",
        [FOOD_ARRIVAL_ATTR]: buildArrival(1_756_600_000_000),
      },
    };
    expect(foodSourceView(received).kind).toBe("arrival");
  });

  it("leaves a received food this device can vouch for reading as its source", () => {
    // ADR-0073 §3 rebuilds an `fdc:` twin's provenance at accept, from the
    // bundle this device already holds — so the record is here, and the food
    // reads USDA whether it was searched for or sent. The mark covers the ground
    // the record cannot, and does not make a received food a second-class one.
    const received: EntityPayload = {
      entity: "fdc:167512",
      attributes: {
        "food/name": "Kale, raw",
        "twin/raw_provenance": {
          adapter: "fdc",
          adapter_version: "1",
          source_uri: "https://fdc.nal.usda.gov/food-details/167512",
          raw_data: {},
        },
        [FOOD_ARRIVAL_ATTR]: buildArrival(1_756_600_000_000),
      },
    };
    expect(foodSourceView(received).kind).toBe("usda");
  });

  it("leaves a food the recipient already held reading as its own origin", () => {
    // §6 skips a held entity whole, so no mark is ever written on it: their own
    // USDA food stays a USDA food after a meal logs against it.
    expect(foodSourceView(food("fdc:167512")).kind).toBe("usda");
  });

  it("falls back to manual for an unrecognised / bare id", () => {
    expect(foodSourceView(food("whatever"))).toEqual<FoodSourceView>({
      kind: "manual",
      label: "Manual",
      icon: "✎",
    });
    expect(foodSourceView(food(""))).toEqual<FoodSourceView>({
      kind: "manual",
      label: "Manual",
      icon: "✎",
    });
  });
});
