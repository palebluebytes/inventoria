import { describe, it, expect } from "vitest";
import {
  buildLabelPanel,
  invertServingSize,
  resolveServingSize,
  toDisplay,
  toGrams,
  ALL_FIELDS,
} from "../../src/lib/food/label-form";
import { formatNutrientValue } from "../../src/lib/food/nutrient-display";

// The Read-along form's pure panel builder (ADR-0034 §3, #57). The form is a thin
// shell over this: typed rows (kcal/g/mg/µg) → a stored `nutrition/info` panel in
// grams, with untouched rows OMITTED (absent ≠ 0) and the basis resolved onto
// serving_size. These assert exactly that assembly, no component involved.

// A blank form's field map — every catalogue key present, all empty.
function blankValues(): Record<string, string> {
  return Object.fromEntries(ALL_FIELDS.map((f) => [f.key, ""]));
}

describe("invertServingSize (serving_size → basis, the inverse)", () => {
  it("round-trips every basis resolveServingSize can emit", () => {
    for (const [basis, servingGrams] of [
      ["per_100g", ""],
      ["per_100ml", ""],
      ["per_serving", "45"],
      ["per_serving", ""],
    ] as const) {
      expect(
        invertServingSize(resolveServingSize(basis, servingGrams))
      ).toEqual({ basis, servingGrams });
    }
  });

  it("reads a basis it has no field for as a weightless serving", () => {
    expect(invertServingSize(undefined)).toEqual({
      basis: "per_serving",
      servingGrams: "",
    });
    expect(invertServingSize("1 portion (330 ml)")).toEqual({
      basis: "per_serving",
      servingGrams: "",
    });
  });
});

describe("resolveServingSize (basis → serving_size, §3)", () => {
  it("per-100 g resolves to the canonical '100 g'", () => {
    expect(resolveServingSize("per_100g", "")).toBe("100 g");
    // The serving-grams field is ignored when the basis is per-100 g.
    expect(resolveServingSize("per_100g", "45")).toBe("100 g");
  });

  it("per-100 ml resolves to '100 ml', the basis OFF published (#148)", () => {
    // Only ever inverted back out of a drink twin, never chosen from scratch:
    // correcting a drink must not restamp its volume basis as a weight.
    expect(resolveServingSize("per_100ml", "")).toBe("100 ml");
    expect(resolveServingSize("per_100ml", "45")).toBe("100 ml");
  });

  it("per-serving resolves to 'N g' with a weight, else bare '1 serving'", () => {
    expect(resolveServingSize("per_serving", "45")).toBe("45 g");
    expect(resolveServingSize("per_serving", "")).toBe("1 serving");
    // A non-positive / non-numeric weight is not a gram basis.
    expect(resolveServingSize("per_serving", "0")).toBe("1 serving");
    expect(resolveServingSize("per_serving", "abc")).toBe("1 serving");
  });
});

describe("buildLabelPanel (typed rows → stored grams panel)", () => {
  it("stores grams, typing micros in mg/µg — round-trips with formatNutrientValue", () => {
    const values = blankValues();
    values.calories = "250"; // kcal, passes through
    values.protein_content = "15"; // g
    values.iron = "2.6"; // typed in mg → stored grams
    values.vitamin_d = "5"; // typed in µg → stored grams

    const { nutrition, filledKeys } = buildLabelPanel({
      values,
      basis: "per_100g",
      servingGrams: "",
      skipped: new Set(),
    });

    expect(nutrition.serving_size).toBe("100 g");
    expect(nutrition.calories).toBe(250);
    expect(nutrition.protein_content).toBe(15);
    // 2.6 mg = 0.0026 g; 5 µg = 0.000005 g — the ADR-0031 mass scale.
    expect(nutrition.iron).toBeCloseTo(0.0026, 10);
    expect(nutrition.vitamin_d).toBeCloseTo(0.000005, 12);
    // Stored grams read back as the typed mg/µg via the real display helper.
    expect(formatNutrientValue(nutrition.iron as number, "mg")).toBe("2.6 mg");
    expect(formatNutrientValue(nutrition.vitamin_d as number, "µg")).toBe(
      "5 µg"
    );

    // filledKeys follows the read-along catalogue order (vitamin_d precedes iron).
    expect(filledKeys).toEqual([
      "calories",
      "protein_content",
      "vitamin_d",
      "iron",
    ]);
  });

  it("omits every untouched row — absent ≠ 0, never written as 0", () => {
    const values = blankValues();
    values.calories = "120";

    const { nutrition, filledKeys } = buildLabelPanel({
      values,
      basis: "per_100g",
      servingGrams: "",
      skipped: new Set(),
    });

    // Only calories + serving_size land; no fabricated zeros for the rest.
    expect(Object.keys(nutrition).sort()).toEqual(["calories", "serving_size"]);
    expect(nutrition).not.toHaveProperty("protein_content");
    expect(nutrition).not.toHaveProperty("iron");
    expect(nutrition).not.toHaveProperty("cholesterol_content");
    expect(filledKeys).toEqual(["calories"]);
  });

  it("keeps a genuine typed 0 distinct from an absent row", () => {
    const values = blankValues();
    values.calories = "90";
    values.trans_fat_content = "0"; // an explicit label zero

    const { nutrition } = buildLabelPanel({
      values,
      basis: "per_100g",
      servingGrams: "",
      skipped: new Set(),
    });

    expect(nutrition.trans_fat_content).toBe(0);
    expect(nutrition).not.toHaveProperty("saturated_fat_content");
  });

  it("skips a row explicitly marked 'not on label' even if it holds a value", () => {
    const values = blankValues();
    values.calories = "200";
    values.sugar_content = "9";

    const { nutrition, filledKeys } = buildLabelPanel({
      values,
      basis: "per_100g",
      servingGrams: "",
      skipped: new Set(["sugar_content"]),
    });

    expect(nutrition).not.toHaveProperty("sugar_content");
    expect(filledKeys).toEqual(["calories"]);
  });

  it("resolves a per-serving basis onto the panel's serving_size", () => {
    const values = blankValues();
    values.calories = "180";

    const { nutrition } = buildLabelPanel({
      values,
      basis: "per_serving",
      servingGrams: "30",
      skipped: new Set(),
    });

    expect(nutrition.serving_size).toBe("30 g");
  });
});

describe("toDisplay / toGrams round-trip", () => {
  it("are inverses across kcal, g, mg and µg", () => {
    expect(toGrams(toDisplay(0.0026, "mg"), "mg")).toBeCloseTo(0.0026, 10);
    expect(toGrams(toDisplay(12.5, "g"), "g")).toBeCloseTo(12.5, 10);
    expect(toGrams(toDisplay(250, "kcal"), "kcal")).toBe(250);
  });

  it("treats a blank or non-numeric entry as absent, never 0", () => {
    expect(toGrams("", "g")).toBeUndefined();
    expect(toGrams("   ", "mg")).toBeUndefined();
    expect(toGrams("abc", "g")).toBeUndefined();
  });
});
