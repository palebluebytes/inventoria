import { describe, it, expect } from "vitest";
import {
  ledgerFoodsFromEvents,
  matchLedgerFoods,
} from "../../src/lib/food/ledger-foods";
import type { ConsumptionEvent } from "../../src/lib/food/consumption-state";

// #320: a food you scanned or typed in yourself is findable by typing its name.
// Pure folds over the consumption history, so the rule is asserted here rather
// than through the sheet that renders it.

let seq = 0;
const log = (
  target: string,
  foodName: string,
  time: number,
  extra: Partial<ConsumptionEvent> = {}
): ConsumptionEvent => ({
  id: `e${seq++}`,
  time,
  target,
  foodName,
  ...extra,
});

describe("ledgerFoodsFromEvents", () => {
  it("returns each distinct food once, newest first", () => {
    const foods = ledgerFoodsFromEvents([
      log("gtin:1", "Oat granola", 100),
      log("gtin:2", "Kefir", 200),
      log("gtin:1", "Oat granola", 300),
    ]);
    expect(foods.map((f) => f.target)).toEqual(["gtin:1", "gtin:2"]);
    expect(foods[0].time).toBe(300);
  });

  it("keeps the name from the NEWEST log of a food", () => {
    // A food renamed after it was logged answers to the name it was logged
    // under, because that is the name the person who typed it will type.
    const foods = ledgerFoodsFromEvents([
      log("gtin:1", "Granola", 100),
      log("gtin:1", "Oat granola, Catalan", 300),
    ]);
    expect(foods[0].name).toBe("Oat granola, Catalan");
  });

  it("excludes a USDA food, which the corpus already carries", () => {
    const foods = ledgerFoodsFromEvents([
      log("fdc:171077", "Chicken breast", 100),
      log("gtin:5", "Kefir", 200),
    ]);
    expect(foods.map((f) => f.target)).toEqual(["gtin:5"]);
  });

  it("does not offer a retracted log", () => {
    const foods = ledgerFoodsFromEvents([
      log("gtin:1", "Undone", 100, { status: "retracted" }),
      log("gtin:2", "Kept", 200),
    ]);
    expect(foods.map((f) => f.name)).toEqual(["Kept"]);
  });

  it("skips an event with no name to match against", () => {
    const foods = ledgerFoodsFromEvents([
      { id: "x", time: 100, target: "gtin:1" } as ConsumptionEvent,
      log("gtin:2", "   ", 150),
      log("gtin:3", "Kefir", 200),
    ]);
    expect(foods.map((f) => f.target)).toEqual(["gtin:3"]);
  });
});

describe("matchLedgerFoods", () => {
  const foods = ledgerFoodsFromEvents([
    log("gtin:1", "Oat granola, Catalan", 300),
    log("gtin:2", "Kefir, plain", 200),
    log("gtin:3", "Nocciolata cocoa spread", 100),
  ]);

  it("finds a food by a word it starts with, mid-type", () => {
    expect(matchLedgerFoods(foods, ["gran"]).map((f) => f.target)).toEqual([
      "gtin:1",
    ]);
  });

  it("demands EVERY typed word, so a query is a conjunction", () => {
    expect(
      matchLedgerFoods(foods, ["oat granola"]).map((f) => f.target)
    ).toEqual(["gtin:1"]);
    expect(matchLedgerFoods(foods, ["oat kefir"])).toEqual([]);
  });

  it("is position-free, because a product name has no head phrase", () => {
    // `cocoa spread` and `spread cocoa` both reach it: there is no `Food,
    // qualifier` grammar in an OFF name to be nearer or further from.
    expect(
      matchLedgerFoods(foods, ["spread cocoa"]).map((f) => f.target)
    ).toEqual(["gtin:3"]);
  });

  it("matches on a stem, so a plural reaches a singular", () => {
    const plural = ledgerFoodsFromEvents([log("gtin:9", "Oat cake", 1)]);
    expect(matchLedgerFoods(plural, ["cakes"]).map((f) => f.target)).toEqual([
      "gtin:9",
    ]);
  });

  it("reads a hyphen the way the corpus search does", () => {
    // The shared tokeniser, never a regex of its own (#136): a typed hyphen must
    // not produce a token no word can equal.
    const dashed = ledgerFoodsFromEvents([
      log("gtin:9", "Semi-skimmed milk", 1),
    ]);
    expect(
      matchLedgerFoods(dashed, ["semi skimmed"]).map((f) => f.target)
    ).toEqual(["gtin:9"]);
  });

  it("takes every phrase, so a vocabulary expansion reaches your foods too", () => {
    const aubergine = ledgerFoodsFromEvents([
      log("gtin:9", "Aubergine dip", 1),
    ]);
    expect(
      matchLedgerFoods(aubergine, ["eggplant", "aubergine"]).map(
        (f) => f.target
      )
    ).toEqual(["gtin:9"]);
  });

  it("answers nothing for an empty query rather than everything", () => {
    expect(matchLedgerFoods(foods, [""])).toEqual([]);
  });
});

describe("the reading one occasion froze", () => {
  // #485: a recipe twin carries no nutrition panel by design (ADR-0021), so the
  // only honest figures for it are the ones its log froze. The fold already
  // holds them; it threw them away, and the mapper downstream then read zeros
  // off a twin that never had a panel to read.
  it("carries the log's metrics and the quantity they are quoted against", () => {
    const foods = ledgerFoodsFromEvents([
      log("recipe:abc", "Bean salad", 100, {
        quantity: "1 serving",
        metrics: {
          calories: 420,
          protein: 18,
          fat: 12,
          carbs: 55,
          iron: 0.003,
        },
      }),
    ]);
    expect(foods[0].quantity).toBe("1 serving");
    expect(foods[0].metrics?.calories).toBe(420);
    expect(foods[0].metrics?.iron).toBe(0.003);
  });

  it("takes them from the SAME log the name came from", () => {
    // Newest wins for both, or a row would print one occasion's name over
    // another occasion's figures.
    const foods = ledgerFoodsFromEvents([
      log("recipe:abc", "Bean salad", 100, {
        quantity: "1 serving",
        metrics: { calories: 420, protein: 18, fat: 12, carbs: 55 },
      }),
      log("recipe:abc", "Bean salad, doubled", 300, {
        quantity: "2 serving",
        metrics: { calories: 840, protein: 36, fat: 24, carbs: 110 },
      }),
    ]);
    expect(foods).toHaveLength(1);
    expect(foods[0].name).toBe("Bean salad, doubled");
    expect(foods[0].quantity).toBe("2 serving");
    expect(foods[0].metrics?.calories).toBe(840);
  });

  it("leaves both absent on a log that froze neither", () => {
    const foods = ledgerFoodsFromEvents([log("gtin:1", "Kefir", 100)]);
    expect(foods[0].metrics).toBeUndefined();
    expect(foods[0].quantity).toBeUndefined();
  });
});
