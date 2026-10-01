import { describe, it, expect } from "vitest";
import {
  ALL_FIELDS,
  BASIS_PRESETS,
  blankNutrientRows,
  buildLabelPanel,
  buildPortions,
  faceDisplay,
  faceEntry,
  fieldLabel,
  invertServingSize,
  nutrientRows,
  portionRowIsEditable,
  portionRows,
  resolveServingSize,
  storedFromText,
  textFromStored,
  type FieldDef,
  type NutrientRow,
} from "../../src/lib/food/label-form";
import {
  basisIsStated,
  parseBasisQuantity,
  SALT_TO_SODIUM,
} from "../../src/lib/food/nutrition";
import type { NutritionInfo, Portion } from "../../src/lib/food/nutrition";
import {
  formatNutrientValue,
  NUTRIENT_CATALOGUE,
} from "../../src/lib/food/nutrient-display";

// The Read-along form's pure panel builder (ADR-0034 §3, #57). The form is a thin
// shell over this: typed rows (kcal/g/mg/µg) → a stored `nutrition/info` panel in
// grams, with untouched rows OMITTED (absent ≠ 0) and the basis resolved onto
// serving_size. These assert exactly that assembly, no component involved.

/** The form's rows with `text` set for the named keys — a filled-in blank form. */
function typed(values: Record<string, string>): NutrientRow[] {
  return blankNutrientRows().map((row) =>
    values[row.key] === undefined ? row : { ...row, text: values[row.key] }
  );
}

/** The catalogue entry for a key, by its own key. */
function field(key: string): FieldDef {
  const found = ALL_FIELDS.find((f) => f.key === key);
  if (!found) throw new Error(`no field for ${key}`);
  return found;
}

describe("invertServingSize (serving_size → basis, the inverse)", () => {
  it("round-trips every preset resolveServingSize can emit", () => {
    for (const basis of Object.values(BASIS_PRESETS)) {
      expect(invertServingSize(resolveServingSize(basis))).toEqual(basis);
    }
  });

  it("round-trips a serving the label weighs, which is the point of #562", () => {
    const basis = { amount: 36, unit: "g" as const };
    expect(resolveServingSize(basis)).toBe("36 g");
    expect(invertServingSize("36 g")).toEqual(basis);
    // And in the other unit, which is the half ADR-0060's 2026-08-31 Amendment
    // named as the reason not to do this at all.
    expect(invertServingSize("250 ml")).toEqual({ amount: 250, unit: "ml" });
  });

  it("refuses a basis that names no magnitude, rather than reading it as per 100 g", () => {
    // The repair. It used to answer `per_100g` for all four of these, so
    // re-saving a "1 serving" twin here RELABELLED its whole-serving figures as
    // per-100 ones — twelve such panels exist in the real ledger. `null` leaves
    // the magnitude box empty and the save gate holding, which is what makes
    // them repairable instead (#562).
    expect(invertServingSize(undefined)).toBeNull();
    expect(invertServingSize("1 serving")).toBeNull();
    expect(invertServingSize("1 portion (330 ml)")).toBeNull();
    expect(invertServingSize("")).toBeNull();
  });
});

describe("resolveServingSize (basis → serving_size, §3)", () => {
  it("per-100 g resolves to the canonical '100 g'", () => {
    expect(resolveServingSize(BASIS_PRESETS.per_100g)).toBe("100 g");
  });

  it("per-100 ml resolves to '100 ml', the basis OFF published (#148)", () => {
    expect(resolveServingSize(BASIS_PRESETS.per_100ml)).toBe("100 ml");
  });

  it("emits only bases that name a divisor every scaler can read", () => {
    // What survives of ADR-0060 §7 after #562: the magnitude no longer has to be
    // 100, but it still has to EXIST. A panel naming no divisor is one nothing
    // can scale, and the form withholds the save rather than writing one.
    for (const basis of [
      ...Object.values(BASIS_PRESETS),
      { amount: 36, unit: "g" as const },
      { amount: 62.5, unit: "ml" as const },
    ]) {
      const serving_size = resolveServingSize(basis);
      expect(basisIsStated(serving_size)).toBe(true);
      expect(parseBasisQuantity(serving_size)).toBe(basis.amount);
    }
  });
});

describe("buildLabelPanel (typed rows → stored grams panel)", () => {
  it("stores grams, typing micros in mg/µg — round-trips with formatNutrientValue", () => {
    const { nutrition, filledKeys } = buildLabelPanel(
      typed({
        calories: "250", // kcal, passes through
        protein_content: "15", // g
        iron: "2.6", // typed in mg → stored grams
        vitamin_d: "5", // typed in µg → stored grams
      }),
      BASIS_PRESETS.per_100g
    );

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
    const { nutrition, filledKeys } = buildLabelPanel(
      typed({ calories: "120" }),
      BASIS_PRESETS.per_100g
    );

    // Only calories + serving_size land; no fabricated zeros for the rest.
    expect(Object.keys(nutrition).sort()).toEqual(["calories", "serving_size"]);
    expect(nutrition).not.toHaveProperty("protein_content");
    expect(nutrition).not.toHaveProperty("iron");
    expect(nutrition).not.toHaveProperty("cholesterol_content");
    expect(filledKeys).toEqual(["calories"]);
  });

  it("keeps a genuine typed 0 distinct from an absent row", () => {
    const { nutrition } = buildLabelPanel(
      typed({ calories: "90", trans_fat_content: "0" }),
      BASIS_PRESETS.per_100g
    );

    expect(nutrition.trans_fat_content).toBe(0);
    expect(nutrition).not.toHaveProperty("saturated_fat_content");
  });

  it("skips a row explicitly marked 'not on label' even if it holds a value", () => {
    const rows = typed({ calories: "200", sugar_content: "9" }).map((row) =>
      row.key === "sugar_content" ? { ...row, skipped: true } : row
    );
    const { nutrition, filledKeys } = buildLabelPanel(
      rows,
      BASIS_PRESETS.per_100g
    );

    expect(nutrition).not.toHaveProperty("sugar_content");
    expect(filledKeys).toEqual(["calories"]);
  });

  it("resolves a millilitre basis onto the panel's serving_size", () => {
    const { nutrition } = buildLabelPanel(
      typed({ calories: "180" }),
      BASIS_PRESETS.per_100ml
    );

    expect(nutrition.serving_size).toBe("100 ml");
  });

  it("resolves a weighed serving basis onto the panel's serving_size (#562)", () => {
    const { nutrition } = buildLabelPanel(typed({ calories: "140" }), {
      amount: 36,
      unit: "g",
    });

    expect(nutrition.serving_size).toBe("36 g");
  });
});

describe("the salt row asks for salt and stores sodium (#508)", () => {
  const salt = field("sodium_content");

  it("captions the row Salt, and offers Sodium as its second box", () => {
    expect(fieldLabel(salt)).toBe("Salt");
    expect(salt.faces.map((f) => [f.label, f.unit])).toEqual([
      ["Salt", "g"],
      ["Sodium", "mg"],
    ]);
  });

  it("stores a European pack's printed salt as sodium, divided", () => {
    // The defect: `Salt 0,6 g` typed into a row labelled "Salt / sodium" in mg
    // stored 0.6 g of SODIUM — 2.5x the truth, against a 2,300 mg DRV, in an
    // append-only ledger.
    const { nutrition } = buildLabelPanel(
      typed({ calories: "600", sodium_content: "0.6" }),
      BASIS_PRESETS.per_100g
    );
    expect(nutrition.sodium_content).toBeCloseTo(0.24, 10);
    expect(0.6 / SALT_TO_SODIUM).toBeCloseTo(0.24, 10);
  });

  it("shows the same figure in both boxes, so they cannot disagree", () => {
    const [, sodium] = salt.faces;
    // 0.6 g of salt IS 240 mg of sodium. One value, shown twice.
    expect(faceDisplay(salt, sodium, "0.6")).toBe("240");
    // And a whole number of milligrams survives the trip through the salt box,
    // which is what the salt face's fourth decimal buys.
    for (const mg of [59, 240, 450, 1190]) {
      expect(
        faceDisplay(salt, sodium, faceEntry(salt, sodium, String(mg)) as string)
      ).toBe(String(mg));
    }
    // Typing the sodium box rewrites the canonical salt text, rather than
    // keeping a second value beside it.
    expect(faceEntry(salt, sodium, "240")).toBe("0.6");
  });

  it("takes an Australian panel's sodium in milligrams as printed", () => {
    // GTIN 9300658411892, Farmers Union Greek Style Yogurt: the FSANZ panel
    // prints sodium in mg per 100 g, and OFF holds 59 mg/100 g for it. Typing
    // the sodium box is a transcription, not a conversion.
    const [, sodium] = salt.faces;
    const text = faceEntry(salt, sodium, "59");
    expect(text).not.toBeUndefined();
    const { nutrition } = buildLabelPanel(
      typed({ calories: "100", sodium_content: text as string }),
      BASIS_PRESETS.per_100g
    );
    expect(nutrition.sodium_content).toBeCloseTo(0.059, 6);
  });

  it("seeds an OFF panel's sodium as the salt figure the jar prints", () => {
    // Nutella: OFF publishes sodium 0.0428 and salt 0.107, and the pack prints
    // the salt. ADR-0021's Amendment is why the panel holds the former.
    expect(textFromStored(salt, 0.0428)).toBe("0.107");
  });

  it("never seeds a real sodium figure as 0 — the hazard a gram box carries", () => {
    // A salt row is the only one putting a milligram-scale quantity in a gram
    // box. At the form's ordinary two decimals a cucumber's real 1.5 mg of
    // sodium would have read "0", and a save would have written that zero over
    // it. Three decimals, and the smallest nonzero sodium figure in the real
    // ledger (0.001 g, white rice) still reads as a number.
    expect(textFromStored(salt, 0.001)).toBe("0.0025");
    expect(textFromStored(salt, 0.00152)).toBe("0.0038");
    for (const sodium of [0.001, 0.00113, 0.00152, 0.002, 0.0027]) {
      expect(textFromStored(salt, sodium)).not.toBe("0");
    }
  });

  it("keeps the two boxes typeable mid-entry, rather than blanking the other", () => {
    const [, sodium] = salt.faces;
    // A half-typed "0." is not a number, and rewriting the canonical text from
    // it would clear the box being typed in. `undefined` means "no change".
    expect(faceEntry(salt, sodium, "0.")).toBeUndefined();
    expect(faceEntry(salt, sodium, "-")).toBeUndefined();
    expect(faceEntry(salt, sodium, "1e")).toBeUndefined();
    // A complete one applies, leading separator and all.
    expect(faceEntry(salt, sodium, ".5")).toBe("0.0013");
    // An emptied box IS a change: the row is being cleared.
    expect(faceEntry(salt, sodium, "")).toBe("");
  });
});

describe("an untouched row re-emits its source (#561)", () => {
  // The form holds display strings, and a display string carries two decimals.
  // 41 of 88 real panels held at least one row that did not survive being
  // rebuilt from one — 137 rows across 16 keys. These are the real figures.
  const awkward: NutritionInfo = {
    serving_size: "100 g",
    calories: 52,
    trans_fat_content: 0.005, // Bread, french or vienna — 100% out at 2 dp
    vitamin_b6: 0.000005, // Egg white — 100% out
    saturated_fat_content: 0.015, // Strawberries — 33% out
    vitamin_d: 2.2e-8, // White button mushrooms — 9% out
    sodium_content: 0.00113, // Mushroom, oyster — does not survive a salt box
  };

  it("round-trips a seeded panel byte for byte", () => {
    const { nutrition } = buildLabelPanel(
      nutrientRows(awkward),
      BASIS_PRESETS.per_100g
    );
    expect(nutrition).toEqual(awkward);
  });

  it("would lose those figures if the row were rebuilt from what it shows", () => {
    // The vacuity check: this is what the same assembly does to the same panel
    // when the row has no source to fall back on, which is what shipped.
    const { nutrition } = buildLabelPanel(
      nutrientRows(awkward).map(({ source: _source, ...row }) => row),
      BASIS_PRESETS.per_100g
    );
    expect(nutrition.trans_fat_content).not.toBe(0.005);
    expect(nutrition.vitamin_b6).not.toBe(0.000005);
    expect(nutrition.sodium_content).not.toBe(0.00113);
  });

  it("rebuilds a row the user actually retyped", () => {
    const rows = nutrientRows(awkward).map((row) =>
      row.key === "saturated_fat_content" ? { ...row, text: "2.5" } : row
    );
    const { nutrition } = buildLabelPanel(rows, BASIS_PRESETS.per_100g);
    expect(nutrition.saturated_fat_content).toBe(2.5);
    // And leaves its neighbours exactly as they were read.
    expect(nutrition.vitamin_b6).toBe(0.000005);
    expect(nutrition.trans_fat_content).toBe(0.005);
  });

  it("drops a row the panel never carried, rather than seeding it as 0", () => {
    const rows = nutrientRows(awkward);
    expect(rows.find((r) => r.key === "iron")?.source).toBeUndefined();
    const { nutrition } = buildLabelPanel(rows, BASIS_PRESETS.per_100g);
    expect(nutrition).not.toHaveProperty("iron");
  });
});

describe("the catalogue mirrors the display catalogue", () => {
  it("gives every row a face naming the quantity and unit the app displays", () => {
    // The header has claimed this mirror since the form shipped and nothing held
    // it to the claim, which is how `"Salt / sodium"` in milligrams survived
    // (#508). Salt is NOT an exception to it: its second face IS "Sodium" in
    // "mg", so the assertion needs no allowlist.
    //
    // Case is not compared: the form sentence-cases a row caption ("Saturated
    // fat") where the display catalogue title-cases a pill label ("Saturated
    // Fat"). That is presentation. The quantity and the unit are the claim.
    for (const descriptor of NUTRIENT_CATALOGUE) {
      const found = ALL_FIELDS.find((f) => f.key === descriptor.key);
      if (!found) continue; // macros are keyed by breakdown name, not panel key
      const matches = found.faces.some(
        (face) =>
          face.label.toLowerCase() === descriptor.label.toLowerCase() &&
          face.unit === descriptor.unit
      );
      expect(matches, `${String(descriptor.key)} has no matching face`).toBe(
        true
      );
    }
  });

  it("covers sodium, the row the mirror was claimed about", () => {
    // A census is vacuous when the one row it exists for is not in it.
    const keys = NUTRIENT_CATALOGUE.map((d) => String(d.key));
    expect(keys).toContain("sodium_content");
  });
});

describe("storedFromText / textFromStored round-trip", () => {
  it("are inverses across kcal, g, mg and µg", () => {
    for (const [key, grams] of [
      ["iron", 0.0026],
      ["protein_content", 12.5],
      ["calories", 250],
    ] as const) {
      const f = field(key);
      expect(storedFromText(f, textFromStored(f, grams))).toBeCloseTo(
        grams,
        10
      );
    }
  });

  it("treats a blank or non-numeric entry as absent, never 0", () => {
    const f = field("protein_content");
    expect(storedFromText(f, "")).toBeUndefined();
    expect(storedFromText(f, "   ")).toBeUndefined();
    expect(storedFromText(f, "abc")).toBeUndefined();
  });
});

describe("portionRows (a twin's portions → the form's rows)", () => {
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

  it("gives every portion a row, carrying the unit its own magnitude is in", () => {
    // The split this replaced kept gram portions and set the rest aside
    // unrendered, so a drink's "1 can — 330 ml" was data the form concealed
    // from the one person correcting it (#460). Every portion is a row now;
    // what the form's basis decides is which rows are EDITABLE, not which exist.
    expect(portionRows([medium, can], "g")).toEqual([
      { label: "1 medium", amount: "118", unit: "g", source: medium },
      { label: "1 can", amount: "330", unit: "ml", source: can },
    ]);
  });

  it("keeps source order, mixed units and all", () => {
    expect(portionRows([can, medium], "g").map((r) => r.unit)).toEqual([
      "ml",
      "g",
    ]);
  });

  it("seeds a portion with no usable magnitude as a repairable blank row", () => {
    // It has no unit of its own to show, so it takes the panel's.
    const malformed: Portion = { label: "1 splash", amount: 1, unit: "splash" };
    expect(portionRows([malformed], "ml")).toEqual([
      { label: "1 splash", amount: "", unit: "ml", source: malformed },
    ]);
  });

  it("is empty for a portion-less or missing food", () => {
    expect(portionRows([], "g")).toEqual([]);
    expect(portionRows(undefined, "g")).toEqual([]);
  });
});

describe("portionRowIsEditable (which rows the panel's unit can type)", () => {
  it("is true for a row stated in the panel's own unit", () => {
    expect(
      portionRowIsEditable({ label: "1 slice", amount: "34", unit: "g" }, "g")
    ).toBe(true);
  });

  it("is false for a row stated in the other unit", () => {
    // ADR-0060 §6's two real shapes: a drink powder's prepared-100 ml serving
    // against a per-100 g panel, an oat carton's 100 g against a per-100 ml one.
    expect(
      portionRowIsEditable({ label: "1 can", amount: "330", unit: "ml" }, "g")
    ).toBe(false);
  });

  it("is true for a blank row whatever unit it was minted in", () => {
    // Locking an EMPTY row would strand it with nothing on the other side: the
    // user could only delete it. A row minted in ml and left untyped while the
    // basis flips to g is exactly that row.
    expect(
      portionRowIsEditable({ label: "", amount: "", unit: "ml" }, "g")
    ).toBe(true);
    expect(
      portionRowIsEditable({ label: " ", amount: " ", unit: "ml" }, "g")
    ).toBe(true);
  });
});

describe("buildPortions (the form's rows → a twin's portions)", () => {
  it("writes each row's magnitude into the sibling its unit names", () => {
    expect(
      buildPortions([
        { label: "1 slice", amount: "34", unit: "g" },
        { label: "1 can", amount: "330", unit: "ml" },
      ])
    ).toEqual([
      { label: "1 slice", amount: 1, unit: "1 slice", grams: 34 },
      { label: "1 can", amount: 1, unit: "1 can", millilitres: 330 },
    ]);
  });

  it("round-trips a portion the user never touched, byte for byte", () => {
    // `amount`/`unit` used to be reconstructed from the label on every save, so
    // a scanned twin's `unit: "medium"` came back as `unit: "1 medium"`. Nothing
    // reads those fields today, which is a fact about today's readers and not a
    // licence to write a false one.
    const portions: Portion[] = [
      { label: "1 medium", amount: 1, unit: "medium", grams: 118 },
      { label: "1 can", amount: 1, unit: "serving", millilitres: 330 },
    ];
    expect(buildPortions(portionRows(portions, "g"))).toEqual(portions);
  });

  it("re-emits an untouched portion the form cannot even show", () => {
    // The guarantee the deleted `carried` list used to give, and the reason the
    // row holds its whole source rather than two fields off it. A magnitude
    // `portionMeasure` refuses — OFF publishes some as the STRING "7" (#433) —
    // seeds a blank box, and correcting the form must not be how the twin
    // quietly loses the row.
    const unreadable = [
      { label: "1 splash", amount: 1, unit: "splash" },
      { label: "1 sachet", amount: 1, unit: "sachet", grams: Number.NaN },
      {
        label: "1 scoop",
        amount: 1,
        unit: "scoop",
        grams: "7",
      } as unknown as Portion,
      { label: "", amount: 1, unit: "serving", grams: 12 },
    ] satisfies Portion[] as Portion[];
    expect(buildPortions(portionRows(unreadable, "g"))).toEqual(unreadable);
  });

  it("keeps a source label's exact spelling, spaces and all", () => {
    const padded: Portion = {
      label: "  1 slice  ",
      amount: 1,
      unit: "slice",
      grams: 34,
    };
    expect(buildPortions(portionRows([padded], "g"))).toEqual([padded]);
  });

  it("rebuilds a row the user edited, rather than keeping a stale source unit", () => {
    // Retitling "1 medium" to "1 large" must not save `unit: "medium"`. The
    // untouched rule keys on the row still EQUALLING its source, not on the
    // source merely being present.
    const [row] = portionRows(
      [{ label: "1 medium", amount: 1, unit: "medium", grams: 118 }],
      "g"
    );
    expect(buildPortions([{ ...row, label: "1 large" }])).toEqual([
      { label: "1 large", amount: 1, unit: "1 large", grams: 118 },
    ]);
  });

  it("writes neither sibling when a touched magnitude will not parse, never a 0", () => {
    // The absent-not-zero guard the rest of this form is built on (#28,
    // ADR-0030), reaching the last row that ignored it: `Number(x) || 0` made a
    // blank box a genuine zero-gram portion, and the picker offered a chip that
    // filled nothing.
    expect(
      buildPortions([{ label: "1 slice", amount: "", unit: "g" }])
    ).toEqual([{ label: "1 slice", amount: 1, unit: "1 slice" }]);
    expect(
      buildPortions([{ label: "1 slice", amount: "abc", unit: "g" }])
    ).toEqual([{ label: "1 slice", amount: 1, unit: "1 slice" }]);
  });

  it("drops a touched row carrying an amount and no name", () => {
    // Every reader keys on the label — `resolvePortionAmount` matches it and
    // `formatPortionPreset` falls back to it — so a nameless portion is a chip
    // that renders as an empty string.
    expect(buildPortions([{ label: "  ", amount: "330", unit: "ml" }])).toEqual(
      []
    );
  });

  it("drops a wholly blank row", () => {
    expect(buildPortions([{ label: "", amount: "", unit: "g" }])).toEqual([]);
  });
});
