import { describe, it, expect } from "vitest";
import {
  buildLabelPanel,
  invertServingSize,
  resolveServingSize,
  toDisplay,
  toGrams,
  splitPortionRows,
  ALL_FIELDS,
} from "../../src/lib/food/label-form";
import { parseBasisQuantity } from "../../src/lib/food/nutrition";
import type { Portion } from "../../src/lib/food/nutrition";
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
    for (const basis of ["per_100g", "per_100ml"] as const) {
      expect(invertServingSize(resolveServingSize(basis))).toBe(basis);
    }
  });

  it("reads a basis it has no cell for as per 100 g", () => {
    // Only the manual-entry writers still mint these, and their twins re-open
    // on their own mini-form rather than here (ADR-0060's 2026-08-30
    // Amendment). Nothing routes one to this form, so the fallback is a total
    // function's last arm rather than a case the UI can reach.
    expect(invertServingSize(undefined)).toBe("per_100g");
    expect(invertServingSize("1 serving")).toBe("per_100g");
    expect(invertServingSize("30 g")).toBe("per_100g");
    expect(invertServingSize("1 portion (330 ml)")).toBe("per_100g");
  });
});

describe("resolveServingSize (basis → serving_size, §3)", () => {
  it("per-100 g resolves to the canonical '100 g'", () => {
    expect(resolveServingSize("per_100g")).toBe("100 g");
  });

  it("per-100 ml resolves to '100 ml', the basis OFF published (#148)", () => {
    expect(resolveServingSize("per_100ml")).toBe("100 ml");
  });

  it("emits only bases that name a divisor", () => {
    // The whole point of dropping the per-serving cell: every panel this form
    // writes can be scaled, so the food it captures stays editable by amount.
    for (const basis of ["per_100g", "per_100ml"] as const) {
      expect(parseBasisQuantity(resolveServingSize(basis))).toBe(100);
    }
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
      skipped: new Set(["sugar_content"]),
    });

    expect(nutrition).not.toHaveProperty("sugar_content");
    expect(filledKeys).toEqual(["calories"]);
  });

  it("resolves a millilitre basis onto the panel's serving_size", () => {
    const values = blankValues();
    values.calories = "180";

    const { nutrition } = buildLabelPanel({
      values,
      basis: "per_100ml",
      skipped: new Set(),
    });

    expect(nutrition.serving_size).toBe("100 ml");
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

describe("splitPortionRows (a twin's portions → the form's rows)", () => {
  const medium: Portion = {
    label: "1 medium",
    amount: 1,
    unit: "medium",
    grams: 118,
  };
  const can: Portion = {
    label: "1 can",
    amount: 1,
    unit: "serving",
    millilitres: 330,
  };

  it("turns each gram portion into an editable row", () => {
    expect(splitPortionRows([medium])).toEqual({
      rows: [{ label: "1 medium", grams: "118" }],
      carried: [],
    });
  });

  it("carries a volume portion instead of showing it an empty grams box", () => {
    // The form types a weight, so a drink's "1 can — 330 ml" has no row to sit
    // in (ADR-0060 §6) — and re-saving must not turn it into a zero-gram
    // weight it never was.
    expect(splitPortionRows([medium, can])).toEqual({
      rows: [{ label: "1 medium", grams: "118" }],
      carried: [can],
    });
  });

  it("carries a portion with no usable magnitude, for the same reason", () => {
    const malformed: Portion = { label: "1 splash", amount: 1, unit: "splash" };
    expect(splitPortionRows([malformed]).rows).toEqual([]);
    expect(splitPortionRows([malformed]).carried).toEqual([malformed]);
  });

  it("is two empty halves for a portion-less or missing food", () => {
    expect(splitPortionRows([])).toEqual({ rows: [], carried: [] });
    expect(splitPortionRows(undefined)).toEqual({ rows: [], carried: [] });
  });
});
