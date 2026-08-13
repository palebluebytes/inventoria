import { describe, it, expect } from "vitest";
import {
  foodSourceView,
  type FoodSourceView,
} from "../../src/lib/food/food-source";
import type { EntityPayload } from "../../src/lib/ingestion/ingest";

// The source-tag presentation model (ADR-0043 §2) is pure, so assert the origin
// bucket + label + leading icon it reads off each entity-id prefix, including the
// manual catch-all. Every food has an origin, so it is always present (never
// absent). The icon is the prototype's ◆/✎ split: ◆ marks a resolved data source
// (OFF / USDA / a computed recipe), ✎ marks a hand-authored manual entry.

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
