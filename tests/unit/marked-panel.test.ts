/**
 * The marked panel (ADR-0113 §§4, 5 and 7): what a **Pack pairing** fills, what
 * it may never fill, and what the reading a person meets is composed of.
 *
 * `pack-pairing.test.ts` holds the attribute — which reference food you named,
 * and which twins refuse to name one at all. Nothing here re-states that. These
 * are statements about the READING: the label always wins, silence is
 * partitioned by nutrient rather than by jurisdiction, and the composition is a
 * read rather than a write.
 */
import { describe, expect, it } from "vitest";
import {
  DECLARED_NUTRIENT_KEYS,
  FILLABLE_NUTRIENT_KEYS,
  markPanel,
} from "../../src/lib/food/marked-panel";
import {
  EXTRA_NUTRIENT_KEYS,
  PER_100G,
  PER_100ML,
  PER_SERVING,
  type NutritionInfo,
} from "../../src/lib/food/nutrition";

/** A label panel: an EU pack's mandatory declaration and nothing else. */
const label = (extra: Partial<NutritionInfo> = {}): NutritionInfo => ({
  serving_size: PER_100G,
  calories: 116,
  protein_content: 8.7,
  fat_content: 0.5,
  carbohydrate_content: 15.6,
  sugar_content: 0.6,
  saturated_fat_content: 0.1,
  sodium_content: 0.24,
  ...extra,
});

/** `fdc:173740`, the jar this map was chartered on, in the shape a store reads
 *  back: per 100 g, and carrying what no European label prints. */
const reference = (extra: Partial<NutritionInfo> = {}): NutritionInfo => ({
  serving_size: PER_100G,
  calories: 127,
  protein_content: 8.67,
  fat_content: 0.5,
  carbohydrate_content: 22.8,
  sugar_content: 0.32,
  saturated_fat_content: 0.072,
  sodium_content: 0.001,
  cholesterol_content: 0,
  trans_fat_content: 0,
  fiber_content: 6.4,
  iron: 0.00222,
  potassium: 0.403,
  folate: 0.00013,
  magnesium: 0.045,
  ...extra,
});

describe("the label always wins (§4)", () => {
  it("shows the label's figure and not the reference's where both carry one", () => {
    // An overlapping USDA value is not a better measurement of your jar; it is
    // an accurate measurement of a different preparation.
    const { panel } = markPanel(label({ fiber_content: 3.2 }), reference());
    expect(panel.fiber_content).toBe(3.2);
  });

  it("never names a key the label carried among the filled fields", () => {
    const { filled_fields } = markPanel(
      label({ fiber_content: 3.2 }),
      reference()
    );
    expect(filled_fields).not.toContain("fiber_content");
  });

  it("treats a declared zero as a figure the label carried", () => {
    // Absent is never 0 in this app (ADR-0030), and the converse holds here: a
    // pack declaring 0 g of fibre has measured its fibre, so nothing is silent
    // for a reference food to stand in for.
    const { panel, filled_fields } = markPanel(
      label({ fiber_content: 0 }),
      reference()
    );
    expect(panel.fiber_content).toBe(0);
    expect(filled_fields).not.toContain("fiber_content");
  });
});

describe("silence is partitioned by nutrient, never by jurisdiction (§4)", () => {
  it("fills the twelve metered micronutrients, which are the prize", () => {
    const { panel, filled_fields } = markPanel(label(), reference());
    expect(panel.iron).toBe(0.00222);
    expect(panel.potassium).toBe(0.403);
    expect(filled_fields).toEqual(
      expect.arrayContaining(["iron", "potassium", "folate", "magnesium"])
    );
  });

  it("fills cholesterol and trans fat, which no European label prints", () => {
    // Both are outside the EU declaration, so a European pack is lawfully
    // silent on them and a fill is not covering for a failed capture.
    const { filled_fields } = markPanel(label(), reference());
    expect(filled_fields).toContain("cholesterol_content");
    expect(filled_fields).toContain("trans_fat_content");
  });

  it("never fills sodium or saturated fat, whatever the reference carries", () => {
    // Both are in the mandatory declaration under EU 1169/2011 AND 21 CFR
    // 101.9, so their absence is a failed capture wherever the jar was sold.
    // A refused fill needs no surface and no new word: it looks exactly like a
    // nutrient neither source carries, because that is what it is.
    const silent: NutritionInfo = {
      serving_size: PER_100G,
      calories: 116,
      protein_content: 8.7,
    };
    const { panel, filled_fields } = markPanel(silent, reference());
    expect(panel.sodium_content).toBeUndefined();
    expect(panel.saturated_fat_content).toBeUndefined();
    expect(filled_fields).not.toContain("sodium_content");
    expect(filled_fields).not.toContain("saturated_fat_content");
  });

  it("never fills the energy and macro rows a declaration always carries", () => {
    // A pack silent on protein is a failed capture too, and the four headline
    // figures read as 0 rather than as absent everywhere in this app — so a
    // fill here would be indistinguishable from a measurement AND would be
    // covering for exactly the defect §4 refuses to cover for.
    const bare: NutritionInfo = { serving_size: PER_100G, calories: 116 };
    const { panel, filled_fields } = markPanel(bare, reference());
    expect(panel.calories).toBe(116);
    expect(panel.protein_content).toBeUndefined();
    expect(panel.carbohydrate_content).toBeUndefined();
    expect(panel.sugar_content).toBeUndefined();
    expect(filled_fields).not.toContain("sugar_content");
  });

  it("partitions every panel nutrient, so a new one cannot arrive unruled", () => {
    // Closed over the panel's own key list rather than over a literal: a
    // nutrient added to EXTRA_NUTRIENT_KEYS is fillable unless the declaration
    // names it, which is the rule read forwards — outside the mandatory
    // declaration, a label could lawfully have been silent on it.
    for (const key of EXTRA_NUTRIENT_KEYS) {
      expect(
        DECLARED_NUTRIENT_KEYS.has(key) || FILLABLE_NUTRIENT_KEYS.includes(key)
      ).toBe(true);
    }
    for (const key of FILLABLE_NUTRIENT_KEYS) {
      expect(DECLARED_NUTRIENT_KEYS.has(key)).toBe(false);
    }
  });

  it("names the mandatory declaration and nothing else", () => {
    // EU 1169/2011: energy, fat, saturates, carbohydrate, sugars, protein and
    // salt. Every one of them is mandatory on a US panel too, which is what
    // makes the partition hold wherever the jar was sold.
    expect([...DECLARED_NUTRIENT_KEYS].sort()).toEqual(
      [
        "calories",
        "carbohydrate_content",
        "fat_content",
        "protein_content",
        "saturated_fat_content",
        "sodium_content",
        "sugar_content",
      ].sort()
    );
  });
});

describe("the reference food is read against the label's own basis", () => {
  it("fills a per-serving label at what that serving weighs", () => {
    // The reference food publishes per 100 g and the pack declares per 30 g, so
    // a borrowed figure is the reference's at 30 g of it. Nothing is rescaled
    // to another preparation (§10); this is the same arithmetic every panel on
    // every screen in this app is already divided by.
    const { panel, filled_fields } = markPanel(
      label({ serving_size: "30 g" }),
      reference()
    );
    expect(panel.fiber_content).toBeCloseTo(1.92, 5);
    expect(filled_fields).toContain("fiber_content");
  });

  it("fills nothing on a drink published per 100 ml that nobody has classified", () => {
    // The one door between a volume and a weight is a density the user asserted
    // (ADR-0108 §1). With none, the reference's per-100-g figures cannot be put
    // onto this panel's basis at all, and a ratio-1 pretence is what ADR-0060
    // §2 refuses.
    const { panel, filled_fields } = markPanel(
      label({ serving_size: PER_100ML }),
      reference()
    );
    expect(panel.iron).toBeUndefined();
    expect(filled_fields).toEqual([]);
  });

  it("fills a classified drink through that same door", () => {
    const { panel, filled_fields } = markPanel(
      label({ serving_size: PER_100ML }),
      reference(),
      { class: "water-like" }
    );
    // 100 ml of a water-like liquid is 100 g of it, so the factor is 1.
    expect(panel.iron).toBeCloseTo(0.00222, 6);
    expect(filled_fields).toContain("iron");
  });

  it("fills nothing on a serving whose weight the panel never states", () => {
    // `parseBasisQuantity` falls back to 100 so a scaler always has a divisor.
    // Borrowing against that fallback would state the serving weighs 100 g,
    // which is a number nobody measured.
    const { panel, filled_fields } = markPanel(
      label({ serving_size: PER_SERVING }),
      reference()
    );
    expect(panel.iron).toBeUndefined();
    expect(filled_fields).toEqual([]);
  });
});

describe("omitted, never emitted empty", () => {
  it("hands back the label untouched where the pack is paired with nobody", () => {
    const pack = label();
    const marked = markPanel(pack, undefined);
    expect(marked.panel).toBe(pack);
    expect(marked.filled_fields).toEqual([]);
  });

  it("hands back the label untouched where the reference supplied nothing", () => {
    // A reference food carrying only what this label already carries fills no
    // silence, and an empty fill is absence rather than a fill of size zero.
    const pack = label();
    const marked = markPanel(pack, {
      serving_size: PER_100G,
      calories: 127,
      protein_content: 8.67,
    });
    expect(marked.panel).toBe(pack);
    expect(marked.filled_fields).toEqual([]);
  });

  it("lists the filled fields in panel order", () => {
    // The order the panel itself is read in, so the list a later reader sums
    // against reads in the order the rows do.
    const { filled_fields } = markPanel(label(), reference());
    expect(filled_fields).toEqual([
      "fiber_content",
      "trans_fat_content",
      "cholesterol_content",
      "iron",
      "potassium",
      "folate",
      "magnesium",
    ]);
  });
});

describe("an estimate never reaches a stored nutrition/info (§7)", () => {
  it("leaves the label panel it was handed exactly as it was", () => {
    // The panel datom stays strictly the label and the marked rows are composed
    // at read time. `nutrition/info` is user-writable as a label correction
    // (ADR-0034 §6), so a merged panel would silently become a user-attributed
    // transcription the first time somebody fixed a typo in it.
    const pack = label();
    const before = JSON.stringify(pack);
    markPanel(pack, reference());
    expect(JSON.stringify(pack)).toBe(before);
  });
});
