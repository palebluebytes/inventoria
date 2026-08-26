import { describe, it, expect } from "vitest";
import {
  roundFood,
  roundFoodDisplay,
  formatPortionLabel,
  formatPortionPreset,
  portionLabelIsBareWeight,
  macrosFromNutrition,
  portionPresets,
  reportsNoEnergy,
  resolvePortionGrams,
  scaleNutrition,
  sumNutrition,
  PER_100ML,
  amountDefaults,
  basisCaption,
  basisUnit,
  dedupePortions,
  isMeasuredUnit,
  measuredUnitName,
  isPer100Basis,
  parseBasisQuantity,
  servingSizeGrams,
  servingSizePortion,
  type NutritionBreakdown,
  type NutritionInfo,
  type Portion,
} from "../../src/lib/food/nutrition";

describe("roundFood", () => {
  it("strips binary-float noise from summed macros", () => {
    // 0.6 + 0.6 -> 1.2000000000000002 in IEEE-754; the UI must show 1.2.
    expect(roundFood(0.6 + 0.6)).toBe(1.2);
    expect(roundFood(0.1 + 0.2)).toBe(0.3);
  });

  it("keeps up to three decimals, rounding a fourth away", () => {
    expect(roundFood(0.125)).toBe(0.125); // a fine-grained amount survives
    expect(roundFood(38.5678)).toBe(38.568);
    expect(roundFood(1.2344)).toBe(1.234);
  });

  it("returns a number, so exact values gain no trailing zeros", () => {
    // Decimals surface only when the value has them: whole → whole, 2 dp → 2 dp.
    expect(roundFood(0.5)).toBe(0.5);
    expect(roundFood(134)).toBe(134);
    expect(String(roundFood(1.2))).toBe("1.2");
    expect(String(roundFood(32.5))).toBe("32.5");
    expect(String(roundFood(400))).toBe("400");
  });
});

describe("roundFoodDisplay", () => {
  it("caps the shown value at two decimals though storage keeps more", () => {
    // A value logged at 3 dp is shown rounded to 2 dp.
    expect(roundFoodDisplay(0.125)).toBe(0.13);
    expect(roundFoodDisplay(21.667)).toBe(21.67);
    expect(roundFoodDisplay(1.895)).toBe(1.9);
  });

  it("still pads no trailing zeros, so whole/1-dp values read clean", () => {
    expect(roundFoodDisplay(32.5)).toBe(32.5);
    expect(String(roundFoodDisplay(400))).toBe("400");
    expect(String(roundFoodDisplay(12.3))).toBe("12.3");
  });
});

// A rich panel: the four macros plus a spread of extras + one micronutrient, so
// the scale/sum helpers are exercised across every category of nutrient.
const RICH_PANEL: NutritionInfo = {
  serving_size: "100 g",
  calories: 380,
  protein_content: 13,
  fat_content: 7,
  carbohydrate_content: 67,
  fiber_content: 10,
  sugar_content: 1,
  sodium_content: 0.006,
  saturated_fat_content: 1.2,
  iron: 0.0047,
};

describe("reportsNoEnergy", () => {
  // ADR-0048 §1: a panel that omits calories is SILENT about energy; a panel
  // carrying 0 is asserting a measurement. This is the one place the app draws
  // that line, and both the generator and the food card ask it here.
  it("is true for a panel that never measured energy", () => {
    expect(reportsNoEnergy({ serving_size: "100 g" })).toBe(true);
    // `Oil, olive, extra virgin` — protein and carbohydrate absent too.
    expect(
      reportsNoEnergy({ serving_size: "100 g", protein_content: 0.87 })
    ).toBe(true);
  });

  it("is false for a measured zero — tap water is not a defect", () => {
    expect(reportsNoEnergy({ serving_size: "100 g", calories: 0 })).toBe(false);
  });

  it("is false for any energy the source actually reported", () => {
    expect(reportsNoEnergy({ serving_size: "100 g", calories: 884 })).toBe(
      false
    );
    expect(reportsNoEnergy({ serving_size: "100 g", calories: 0.4 })).toBe(
      false
    );
  });

  it("is true for no panel at all, and for a number that is not one", () => {
    // A food with no panel logs the same silent zero a calorie-less one does,
    // and a NaN/Infinity energy is no measurement either.
    expect(reportsNoEnergy(undefined)).toBe(true);
    expect(reportsNoEnergy({ serving_size: "100 g", calories: NaN })).toBe(
      true
    );
    expect(reportsNoEnergy({ serving_size: "100 g", calories: Infinity })).toBe(
      true
    );
  });
});

describe("macrosFromNutrition", () => {
  it("keeps its ?? 0, because the display path wants a number (ADR-0048 §1)", () => {
    // The distinction between absent and zero lives one level up, in the panel.
    // Restoring it HERE would widen Macros.calories to `number | undefined` and
    // push an absence check into every meter, ring and sum in the app.
    expect(macrosFromNutrition({ serving_size: "100 g" })).toEqual({
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
    });
  });
});

describe("scaleNutrition", () => {
  it("scales every nutrient the panel carries by the factor, rounded to food precision", () => {
    // ×0.5: macros via macrosFromNutrition, extras under their panel names.
    expect(scaleNutrition(RICH_PANEL, 0.5)).toEqual({
      calories: 190,
      protein: 6.5,
      fat: 3.5,
      carbs: 33.5,
      fiber_content: 5,
      sugar_content: 0.5,
      sodium_content: 0.003,
      saturated_fat_content: 0.6,
      iron: 0.00235, // 0.0047 × 0.5 — kept at micronutrient precision, not 3 dp
    });
  });

  it("keeps the headline four exactly as macrosFromNutrition×factor would (headline never diverges from the macro path)", () => {
    const scaled = scaleNutrition(RICH_PANEL, 1.5);
    expect({
      calories: scaled.calories,
      protein: scaled.protein,
      fat: scaled.fat,
      carbs: scaled.carbs,
    }).toEqual({ calories: 570, protein: 19.5, fat: 10.5, carbs: 100.5 });
  });

  it("never invents a nutrient the panel omitted — a macro-only panel scales to just the four macros", () => {
    const macroOnly: NutritionInfo = {
      serving_size: "100 g",
      calories: 100,
      protein_content: 2,
      fat_content: 1,
      carbohydrate_content: 20,
    };
    const scaled = scaleNutrition(macroOnly, 2);
    expect(scaled).toEqual({ calories: 200, protein: 4, fat: 2, carbs: 40 });
    expect("fiber_content" in scaled).toBe(false);
    expect("iron" in scaled).toBe(false);
  });

  it("defaults absent macros to 0 (unchanged) but leaves extras absent", () => {
    const scaled = scaleNutrition(
      { serving_size: "100 g", fiber_content: 4 },
      1
    );
    expect(scaled).toEqual({
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      fiber_content: 4,
    });
  });

  it("keeps a sub-milligram micronutrient instead of rounding it to zero", () => {
    // Iron at 0.26 mg = 0.00026 g would vanish at the 3-dp macro precision, so a
    // breakdown would read "0 mg". The finer micronutrient precision keeps it,
    // through scaling and through summing across the day.
    const panel: NutritionInfo = { serving_size: "100 g", iron: 0.00026 };
    expect(scaleNutrition(panel, 1).iron).toBe(0.00026);
    expect(scaleNutrition(panel, 2).iron).toBe(0.00052);
    expect(
      sumNutrition([scaleNutrition(panel, 1), scaleNutrition(panel, 1)]).iron
    ).toBe(0.00052);
  });
});

describe("sumNutrition", () => {
  it("totals every nutrient present across breakdowns with round-then-sum", () => {
    const a: NutritionBreakdown = {
      calories: 190,
      protein: 6.5,
      fat: 3.5,
      carbs: 33.5,
      fiber_content: 5,
      sodium_content: 0.003,
    };
    const b: NutritionBreakdown = {
      calories: 128,
      protein: 6.8,
      fat: 7.2,
      carbs: 9.4,
      fiber_content: 0.5,
      iron: 0.002,
    };
    expect(sumNutrition([a, b])).toEqual({
      calories: 318,
      protein: 13.3,
      fat: 10.7,
      carbs: 42.9,
      fiber_content: 5.5, // present in both
      sodium_content: 0.003, // only in a
      iron: 0.002, // only in b
    });
  });

  it("keeps a nutrient absent when no breakdown froze it — never fabricates 0", () => {
    // A macro-only event (a custom food with no source panel) summed with a full
    // one: the macro-only event contributes nothing to fibre, and fibre is the
    // full event's value alone.
    const macroOnly: NutritionBreakdown = {
      calories: 100,
      protein: 5,
      fat: 2,
      carbs: 10,
    };
    const full: NutritionBreakdown = {
      calories: 50,
      protein: 1,
      fat: 0,
      carbs: 12,
      fiber_content: 3,
    };
    const total = sumNutrition([macroOnly, full]);
    expect(total.fiber_content).toBe(3);
    // sodium was never frozen by either — it is absent, not 0.
    expect("sodium_content" in total).toBe(false);
  });

  it("returns just zeroed macros for an empty list", () => {
    expect(sumNutrition([])).toEqual({
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
    });
  });
});

// ---- household portions (ADR-0030 §2) --------------------------------------

describe("formatPortionLabel", () => {
  it("joins amount and unit into a display label", () => {
    expect(formatPortionLabel(1, "medium")).toBe("1 medium");
    expect(formatPortionLabel(1, "cup, sliced")).toBe("1 cup, sliced");
    expect(formatPortionLabel(2, "tbsp")).toBe("2 tbsp");
  });

  it("collapses stray whitespace so a padded unit reads clean", () => {
    expect(formatPortionLabel(1, "  medium ")).toBe("1 medium");
  });
});

describe("formatPortionPreset", () => {
  it("reads the label plus the gram weight it resolves to", () => {
    expect(
      formatPortionPreset({
        label: "1 medium",
        amount: 1,
        unit: "medium",
        grams: 118,
      })
    ).toBe("1 medium — 118 g");
  });

  it("shows grams at the display precision, not the stored precision", () => {
    // A finely-weighed portion reads clean (2 dp) rather than as stored noise.
    expect(
      formatPortionPreset({
        label: "1 tbsp",
        amount: 1,
        unit: "tbsp",
        grams: 14.174,
      })
    ).toBe("1 tbsp — 14.17 g");
  });

  it("drops the redundant suffix when the label is itself the gram weight", () => {
    // OFF serving sizes are often bare gram weights ("30 g"); repeating them as
    // "30 g — 30 g" reads as a range, so the chip collapses to just the label.
    expect(
      formatPortionPreset({
        label: "30 g",
        amount: 1,
        unit: "serving",
        grams: 30,
      })
    ).toBe("30 g");
    // Spacing/case variants normalise the same way ("45G" ≡ "45 g").
    expect(
      formatPortionPreset({
        label: "45G",
        amount: 1,
        unit: "serving",
        grams: 45,
      })
    ).toBe("45G");
  });
});

describe("portionLabelIsBareWeight", () => {
  it("flags labels that only restate a gram weight", () => {
    for (const label of [
      "30 g",
      "30g",
      "30 grams",
      "30 gram",
      "30",
      "2.5 g",
      " 45 G ",
    ]) {
      expect(portionLabelIsBareWeight(label)).toBe(true);
    }
  });

  it("does not flag real household units or blank labels", () => {
    for (const label of [
      "1 slice",
      "1 biscuit (12 g)",
      "half a can",
      "",
      "  ",
    ]) {
      expect(portionLabelIsBareWeight(label)).toBe(false);
    }
  });
});

describe("portionPresets", () => {
  const portions: Portion[] = [
    { label: "1 medium", amount: 1, unit: "medium", grams: 118 },
    { label: "1 cup, sliced", amount: 1, unit: "cup, sliced", grams: 150 },
  ];

  it("maps each portion to a chip preset carrying label, grams and display", () => {
    expect(portionPresets(portions)).toEqual([
      { label: "1 medium", grams: 118, display: "1 medium — 118 g" },
      { label: "1 cup, sliced", grams: 150, display: "1 cup, sliced — 150 g" },
    ]);
  });

  it("rounds each preset's grams to stored precision so a tap matches resolvePortionGrams", () => {
    const raw: Portion[] = [
      { label: "1 slice", amount: 1, unit: "slice", grams: 14.12367 },
    ];
    const [preset] = portionPresets(raw);
    expect(preset.grams).toBe(14.124);
    // The chip's pre-rounded grams equal what resolving its label yields, so the
    // primary/secondary highlight tracks a tapped chip exactly.
    expect(resolvePortionGrams(raw, "1 slice")).toBe(preset.grams);
  });

  it("drops a portion whose grams are absent or non-finite", () => {
    const mixed: Portion[] = [
      { label: "good", amount: 1, unit: "x", grams: 40 },
      { label: "nan", amount: 1, unit: "x", grams: NaN },
      {
        label: "missing",
        amount: 1,
        unit: "x",
        grams: undefined as unknown as number,
      },
    ];
    expect(portionPresets(mixed).map((p) => p.label)).toEqual(["good"]);
  });

  it("returns an empty list for a portion-less or missing food", () => {
    expect(portionPresets([])).toEqual([]);
    expect(portionPresets(undefined)).toEqual([]);
  });
});

describe("resolvePortionGrams", () => {
  const portions: Portion[] = [
    { label: "1 medium", amount: 1, unit: "medium", grams: 118 },
    { label: "1 cup, sliced", amount: 1, unit: "cup, sliced", grams: 150 },
  ];

  it("returns the gram weight of the chosen portion", () => {
    expect(resolvePortionGrams(portions, "1 medium")).toBe(118);
    expect(resolvePortionGrams(portions, "1 cup, sliced")).toBe(150);
  });

  it("scales by the quantity of that portion", () => {
    // Two "1 medium" bananas resolve to 236 g; three cups to 450 g.
    expect(resolvePortionGrams(portions, "1 medium", 2)).toBe(236);
    expect(resolvePortionGrams(portions, "1 cup, sliced", 3)).toBe(450);
  });

  it("rounds a fractional-quantity result to the stored food precision", () => {
    // 0.5 × 118 = 59; a non-integer that would carry float noise is trimmed.
    expect(resolvePortionGrams(portions, "1 medium", 0.5)).toBe(59);
    expect(
      resolvePortionGrams([{ ...portions[0], grams: 0.1 }], "1 medium", 3)
    ).toBe(0.3);
  });

  it("returns undefined when the chosen label is not in the list", () => {
    expect(resolvePortionGrams(portions, "1 large")).toBeUndefined();
  });

  it("returns undefined for an empty or missing portion list", () => {
    expect(resolvePortionGrams([], "1 medium")).toBeUndefined();
    expect(resolvePortionGrams(undefined, "1 medium")).toBeUndefined();
  });

  it("returns undefined when the matched portion's grams are malformed", () => {
    const malformed: Portion[] = [
      { label: "bad", amount: 1, unit: "x", grams: NaN },
      {
        label: "missing",
        amount: 1,
        unit: "x",
        grams: undefined as unknown as number,
      },
    ];
    expect(resolvePortionGrams(malformed, "bad")).toBeUndefined();
    expect(resolvePortionGrams(malformed, "missing")).toBeUndefined();
  });

  it("returns undefined for a non-finite quantity", () => {
    expect(resolvePortionGrams(portions, "1 medium", NaN)).toBeUndefined();
    expect(resolvePortionGrams(portions, "1 medium", Infinity)).toBeUndefined();
  });
});

describe("servingSizeGrams", () => {
  it("reads the gram weight from a weighed serving size", () => {
    expect(servingSizeGrams("30 g")).toBe(30);
    expect(servingSizeGrams("30g")).toBe(30);
    expect(servingSizeGrams("62.5 g")).toBe(62.5);
  });

  it("is null for the per-100 g reference basis", () => {
    // "100 g" is the reference basis, not a household serving to surface.
    expect(servingSizeGrams("100 g")).toBeNull();
  });

  it("is null for a weightless serving (never misreads '1 serving' as 1 g)", () => {
    // parseFloat("1 serving") === 1; the helper must NOT treat that as 1 gram.
    expect(servingSizeGrams("1 serving")).toBeNull();
  });

  it("is null for a non-gram unit", () => {
    expect(servingSizeGrams("240 ml")).toBeNull();
    expect(servingSizeGrams("")).toBeNull();
  });

  it("is null for the per-100 ml drink basis (never a 100 g serving chip)", () => {
    // A drink's panel basis is a volume; surfacing it as a weighed serving would
    // put "1 serving = 100 g" on a can of cola (ADR-0052 §1).
    expect(servingSizeGrams(PER_100ML)).toBeNull();
  });
});

describe("isPer100Basis", () => {
  it("is true for both per-100 bases, whichever unit the 100 is in", () => {
    expect(isPer100Basis("100 g")).toBe(true);
    expect(isPer100Basis("100 ml")).toBe(true);
  });

  it("is false for a serving basis and for no basis at all", () => {
    expect(isPer100Basis("30 g")).toBe(false);
    expect(isPer100Basis("1 serving")).toBe(false);
    expect(isPer100Basis(undefined)).toBe(false);
  });
});

describe("isMeasuredUnit", () => {
  it("is true for every unit scaled against a panel's basis", () => {
    expect(isMeasuredUnit("g")).toBe(true);
    expect(isMeasuredUnit("ml")).toBe(true);
  });

  it("is false for a count of whole servings", () => {
    // The one question the retired `=== "g"` ternaries were really asking
    // (ADR-0060 §5): a serving amount is a count, not a measurement to divide.
    expect(isMeasuredUnit("serving")).toBe(false);
  });
});

describe("basisUnit", () => {
  it("reads millilitres off a volume basis", () => {
    expect(basisUnit(PER_100ML)).toBe("ml");
    expect(basisUnit("330ml")).toBe("ml");
  });

  it("reads grams off a weight basis", () => {
    expect(basisUnit("100 g")).toBe("g");
    expect(basisUnit("30g")).toBe("g");
    expect(basisUnit("62.5 grams")).toBe("g");
  });

  it("falls back to grams for a basis naming no unit at all", () => {
    // Mirrors parseBasisQuantity's own fallback: a weightless serving and a
    // missing panel are entered in grams (ADR-0060 §1).
    expect(basisUnit("1 serving")).toBe("g");
    expect(basisUnit(undefined)).toBe("g");
    expect(basisUnit("")).toBe("g");
  });
});

describe("measuredUnitName", () => {
  it("spells each measured unit out for a control's own label", () => {
    expect(measuredUnitName("g")).toBe("grams");
    expect(measuredUnitName("ml")).toBe("millilitres");
  });
});

describe("amountDefaults", () => {
  it("opens a weighed food at 100 g on a 500 g slider", () => {
    expect(amountDefaults("g")).toEqual({ amount: 100, sliderMax: 500 });
  });

  it("opens a drink at a glass, topping out below a litre", () => {
    // 100 ml is half a glass and 500 ml stops short of a carton, so the same
    // two numbers read wrong on a volume basis (ADR-0060 §3).
    expect(amountDefaults("ml")).toEqual({ amount: 250, sliderMax: 1000 });
  });
});

describe("basisCaption", () => {
  it("names a per-100 basis in its own unit", () => {
    expect(basisCaption("100 g")).toBe("Per 100 g");
    expect(basisCaption(PER_100ML)).toBe("Per 100 ml");
  });

  it("names a weighed label serving with the weight it is measured over", () => {
    // A "30 g" panel divides by 30, which nothing on screen used to say.
    expect(basisCaption("30 g")).toBe("Per serving (30 g)");
    expect(basisCaption("62.5 g")).toBe("Per serving (62.5 g)");
  });

  it("normalises what it prints rather than echoing the basis", () => {
    expect(basisCaption("30g")).toBe("Per serving (30 g)");
    expect(basisCaption("30 grams")).toBe("Per serving (30 g)");
    // A per-100 basis is per-100 however it was spaced — decided on the
    // quantity, not on an exact match against the two sentinel strings.
    expect(basisCaption("100g")).toBe("Per 100 g");
    expect(basisCaption("100ml")).toBe("Per 100 ml");
  });

  it("gives a bare serving no weight at all", () => {
    // parseBasisQuantity divides "1 serving" by 100 as a last resort, and that
    // fallback is not a fact about the food — printing it would show a number
    // the source never gave (ADR-0060 §3).
    expect(basisCaption("1 serving")).toBe("Per serving");
    expect(basisCaption("1 portion (330 ml)")).toBe("Per serving");
    // parseBasisQuantity would hand a zero basis the same 100 fallback, so this
    // reads the quantity off its own match rather than through that sibling.
    expect(basisCaption("0 g")).toBe("Per serving");
  });

  it("says nothing at all when the food names no basis", () => {
    // A panel-less food renders no caption, as it renders no preview.
    expect(basisCaption(undefined)).toBeNull();
    expect(basisCaption("   ")).toBeNull();
  });
});

describe("parseBasisQuantity", () => {
  it("reads the quantity a per-100 basis names", () => {
    expect(parseBasisQuantity("100 g")).toBe(100);
    expect(parseBasisQuantity("100 ml")).toBe(100);
  });

  it("reads a weighed label serving's own quantity", () => {
    expect(parseBasisQuantity("30 g")).toBe(30);
    expect(parseBasisQuantity("30g")).toBe(30);
    expect(parseBasisQuantity("62.5 g")).toBe(62.5);
  });

  it("divides a millilitre basis by its own quantity, never by a density", () => {
    // A per-100 ml drink panel scales like any other per-100 panel: 330 against
    // 100. Converting millilitres to grams would compute one measurement from
    // another (ADR-0048 §3), so the volume is carried, not converted.
    expect(parseBasisQuantity("250 ml")).toBe(250);
    expect(parseBasisQuantity("330ml")).toBe(330);
  });

  it("falls back to 100 for a weightless serving, never the '1' in it", () => {
    // parseFloat("1 serving") === 1, which would have scaled a whole-serving
    // panel by the typed gram count — a custom food logged at 100 g reading
    // 100x its calories.
    expect(parseBasisQuantity("1 serving")).toBe(100);
  });

  it("falls back to 100 for a basis naming no quantity", () => {
    expect(parseBasisQuantity(undefined)).toBe(100);
    expect(parseBasisQuantity("")).toBe(100);
    expect(parseBasisQuantity("1 portion (330 ml)")).toBe(100);
    expect(parseBasisQuantity("0 g")).toBe(100);
  });
});

describe("servingSizePortion", () => {
  it("synthesises a '1 serving' chip for a weighed per-serving panel", () => {
    const info: NutritionInfo = { serving_size: "30 g", calories: 190 };
    expect(servingSizePortion(info)).toEqual([
      { label: "1 serving", amount: 1, unit: "serving", grams: 30 },
    ]);
  });

  it("is empty for a per-100 g or weightless panel", () => {
    expect(servingSizePortion({ serving_size: "100 g" })).toEqual([]);
    expect(servingSizePortion({ serving_size: "1 serving" })).toEqual([]);
    expect(servingSizePortion(undefined)).toEqual([]);
  });
});

describe("dedupePortions", () => {
  const serving: Portion = {
    label: "1 serving",
    amount: 1,
    unit: "serving",
    grams: 30,
  };
  // OFF's own serving, as `offPortions` emits it: the `serving_size` string as
  // the label, standing at the same 30 g the synthesised chip does.
  const off: Portion = { label: "30 g", amount: 1, unit: "serving", grams: 30 };
  const cup: Portion = { label: "1 cup", amount: 1, unit: "cup", grams: 150 };

  it("keeps the first of two portions standing at the same amount", () => {
    // The synthesised serving precedes the twin's own list, so a serving the
    // source also publishes as a portion is one chip, not two.
    expect(dedupePortions([serving, off, cup])).toEqual([serving, cup]);
  });

  it("keeps portions that stand at different amounts", () => {
    expect(dedupePortions([off, cup])).toEqual([off, cup]);
  });

  it("passes through portions with no weight to key on", () => {
    // Keying two of these on the same non-weight would fold them into one,
    // which loses a chip; passing them through at worst repeats one, and
    // `portionPresets` drops both from the picker anyway.
    const malformed: Portion[] = [
      { label: "1 splash", amount: 1, unit: "splash", grams: NaN },
      { label: "1 dash", amount: 1, unit: "dash", grams: NaN },
    ];
    expect(dedupePortions(malformed)).toEqual(malformed);
  });

  it("is empty for an empty list", () => {
    expect(dedupePortions([])).toEqual([]);
  });
});
