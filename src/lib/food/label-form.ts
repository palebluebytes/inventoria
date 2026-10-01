// The full-panel label-capture form's field catalogue + its pure panel builder
// (ADR-0034 §3, #57). The Custom tab's "Read-along" form (Variant B, prototype
// #52) transcribes a nutrition label top-to-bottom: name + brand, the four
// macros, the sat-fat/fibre/sugar/salt detail row, the twelve ADR-0030
// micronutrients, and household portions. Every row is TYPED in the label's own
// unit (kcal, g, mg, µg) but the panel STORES grams (the ADR-0031 idiom), so the
// assembly round-trips through the real `parseNutrientEntry`/`nutrientDisplayValue`
// helpers — no parallel conversion. Absent ≠ 0: an untouched or skipped row is
// OMITTED from the built panel, never written as 0 (ADR-0030 / #28), so "not on
// the label" stays distinct from a genuine zero.
//
// The catalogue and the builder live here — outside the Svelte component — so the
// mg/µg-to-grams assembly is a pure function the unit suite exercises directly
// (labels omitted, round-trips, basis→serving_size), and the form is a thin shell
// over it.
//
// A row is one panel key plus one or more Faces — a box, its unit, and the
// conversion to what the panel stores. Twenty-two rows have one face and read as
// a label and a unit. Salt has two, because an EU pack prints salt in grams and
// an Australian or US one prints sodium in milligrams, the panel stores sodium
// either way, and the row used to ask for "Salt / sodium" in milligrams and store
// whatever was typed — 2.5x the truth for anybody who read the first word (#508).
// The two boxes cannot disagree: the row holds one value, shown twice.
//
// Each row holds what it was SEEDED from as well as what it shows, so an
// untouched row re-emits its source rather than being rebuilt from a string
// rounded to two decimals — 41 of 88 real panels carried at least one row that
// could not survive that trip (#561). It is `PortionRow`'s rule, applied to the
// other half of the same form.
//
// Every row's faces mirror `nutrient-display.ts` EXTRA_NUTRIENT_META — with
// `sugar` included, which the display catalogue hides and a label-entry form must
// let you type. Salt is not an exception to that mirror: its second face IS the
// catalogue's "Sodium" in "mg".
import {
  parseNutrientEntry,
  nutrientDisplayValue,
  type NutrientUnit,
} from "./nutrient-display";
import {
  basisIsStated,
  basisUnit,
  parseBasisQuantity,
  portionMagnitude,
  portionMeasure,
  roundFoodDisplay,
  SALT_TO_SODIUM,
  type MeasuredUnit,
  type NutritionInfo,
  type Portion,
} from "./nutrition";

/**
 * The basis a label printed its values against — **a magnitude and the unit it
 * is measured in**, which is all a basis ever was.
 *
 * It was a two-member union of `per_100g | per_100ml` until #562. That shape
 * made `per_100g` a *kind* of basis rather than one *value* of one, and the
 * consequence was a label printing only "Amount per serving" — the US Nutrition
 * Facts panel — having nothing to say (ADR-0060's 2026-08-30 Amendment, which
 * named that cost and accepted it). Typed this way the two per-100 bases are
 * {@link BASIS_PRESETS}, and a stated serving weight is the general case rather
 * than a third literal. ADR-0052's Consequences asked for exactly this: "a
 * fourth basis would want the field typed rather than a third literal added."
 *
 * What is **not** restored is a basis naming no magnitude. ADR-0060 SS7 was right
 * about the case it argued: a serving of unstated weight names no divisor, the
 * `"1 serving"` receipt that followed was a quantity nothing could scale, and
 * that panel is still refused — {@link invertServingSize} answers `null` for it
 * and the form holds rather than guessing.
 *
 * It is also the app's ONE basis type: `ai-autofill.ts` reads it from here
 * rather than keeping a narrower copy of its own, which the next basis value
 * would leave wrong exactly as `per_100ml` already had.
 */
export interface Basis {
  /** The magnitude the panel's figures are measured per — 100, or 36. */
  amount: number;
  /** The unit that magnitude is in. Nothing converts between the two (SS2). */
  unit: MeasuredUnit;
}

/** The two bases a reputable source reports against, which the toggle offers as
 *  positions rather than as a number to type. */
export type BasisPresetId = "per_100g" | "per_100ml";

/**
 * The preset positions, keyed so that adding one **fails the typecheck**.
 *
 * A `Record` rather than an array, on `DENSITY_CLASS_OPTIONS`' precedent and for
 * its reason: while the basis was a union, `basisOptions` was a plain array, so
 * a third member compiled clean with no cell rendered and no error — a basis the
 * type permitted and the UI could not reach.
 */
export const BASIS_PRESETS: Record<BasisPresetId, Basis> = {
  per_100g: { amount: 100, unit: "g" },
  per_100ml: { amount: 100, unit: "ml" },
};

/** A box is typed in kcal (energy) or a nutrient mass unit; grams are stored. */
export type FieldUnit = "kcal" | NutrientUnit;

/**
 * One input box on a nutrient row: the quantity it asks for, the unit it is
 * typed in, and the two conversions between that and what the panel stores.
 *
 * A row has one face in the ordinary case and the face's label is the row's
 * caption. Salt has two ({@link SALT_FACES}), which is the whole reason this
 * type exists: an EU pack prints `Salt 0,6 g` and a US or Australian one prints
 * `Sodium 240mg`, the panel stores sodium either way (ADR-0021's 2026-08-14
 * Amendment), and before #508 the row asked for "Salt / sodium" in milligrams
 * and stored whatever was typed as sodium — 2.5x the truth for anybody reading
 * the word the row offered them.
 *
 * The conversions live on the face rather than in the template because the
 * factor between the boxes is the one thing that must not live in markup
 * (`CODING_STANDARDS.md` SS2.2) — it is how the `/ 2.5` went missing from the
 * hand-typed path for as long as it did.
 */
export interface Face {
  /** The quantity this box asks for, e.g. "Salt", "Sodium", "Fibre". */
  label: string;
  /** The unit this box is typed in, and prints beside itself. */
  unit: FieldUnit;
  /** This box's number -> stored grams of the row's key. */
  toStored: (typed: number) => number;
  /**
   * Stored grams of the row's key -> the number this box shows, **rounded here
   * and nowhere else**.
   *
   * One rounding per face, inside the face, because composing two roundings is
   * what broke the salt box first: routing grams through
   * {@link nutrientDisplayValue}'s fixed two decimals before multiplying by 2.5
   * turned Nutella's 0.0428 g of sodium into 0.04, and so into 0.1 g of salt
   * where the jar prints 0.107 — and a cucumber's 0.0015 g into a flat 0.
   *
   * Rounding is cosmetic either way: an untouched row re-emits what it was
   * seeded from ({@link buildLabelPanel}), so this decides what the box reads
   * and never what the panel stores.
   */
  fromStored: (grams: number) => number;
}

export interface FieldDef {
  /** The `NutritionInfo` key this row fills. */
  key: keyof NutritionInfo;
  /**
   * The row's boxes, left to right. `faces[0]` is **canonical**: the row's text
   * is held in its unit, every other face is a lens over that text, and its
   * label is the row's caption.
   */
  faces: [Face, ...Face[]];
}

/** The caption a row shows — its canonical face's label, never a second copy of
 *  it that could drift. */
export function fieldLabel(field: FieldDef): string {
  return field.faces[0].label;
}

/**
 * The ordinary box: typed in its own unit, storing grams, converting by nothing
 * but the mass scale (kcal passes through).
 *
 * Twenty-two of the twenty-three rows are one of these, so the catalogues below
 * read as a label and a unit exactly as they did before faces existed.
 */
function plainFace(label: string, unit: FieldUnit): Face {
  return {
    label,
    unit,
    toStored: (typed) =>
      unit === "kcal" ? typed : parseNutrientEntry(typed, unit),
    fromStored: (grams) =>
      unit === "kcal"
        ? roundFoodDisplay(grams)
        : nutrientDisplayValue(grams, unit),
  };
}

/**
 * The salt row's two boxes, and the only arithmetic in this file that is not a
 * unit scale.
 *
 * **Salt first**, because that is the pack in evidence: all four committed label
 * samples print salt in grams (#476), and so does every pack in the real
 * ledger. **Sodium second**, so an Australian or US panel printing `Sodium 240mg`
 * is transcribed as printed rather than converted by hand — the FSANZ panel
 * prints sodium in milligrams per 100 g, which this form takes as it stands.
 *
 * The two can never disagree: the row holds one text, in salt grams, and the
 * sodium box is a lens over it. There is deliberately no third state recording
 * which box was typed, because there is nothing for it to decide — both boxes
 * describe one stored figure.
 *
 * No composite factor is written here. Salt grams reach sodium milligrams by
 * composing the two faces through stored grams, so the 400 that relates them
 * exists nowhere and cannot fall out of step with {@link SALT_TO_SODIUM} or the
 * milligram scale.
 */
const SALT_FACES: [Face, Face] = [
  {
    label: "Salt",
    unit: "g",
    toStored: (typed) => parseNutrientEntry(typed, "g") / SALT_TO_SODIUM,
    // Grams to grams, so the mass scale is 1 and the only arithmetic is the
    // ratio.
    //
    // FOUR decimals, not the display layer's two, for two reasons that both
    // bite. At two, the smallest sodium figure in the real ledger (0.001 g,
    // white rice) reads as "0" — a zero a save would then have written over a
    // real measurement. And because salt is the CANONICAL face, the sodium box
    // beside it is quantised by this precision: at four, sodium typed as a whole
    // number of milligrams round-trips exactly (m mg is m x 0.0025 g of salt,
    // which never has a fifth decimal), so an Australian panel's "59" comes back
    // as 59 rather than 59.2. EU packs print salt to two or three decimals
    // anyway ("0.6 g", "0.107 g"), so a typed figure is untouched by this.
    fromStored: (grams) => roundFoodDisplay(grams * SALT_TO_SODIUM, 4),
  },
  plainFace("Sodium", "mg"),
];

/** The common case — the four rows today's Custom tab already captures. */
export const CORE: FieldDef[] = [
  { key: "calories", faces: [plainFace("Calories", "kcal")] },
  { key: "protein_content", faces: [plainFace("Protein", "g")] },
  { key: "fat_content", faces: [plainFace("Fat", "g")] },
  { key: "carbohydrate_content", faces: [plainFace("Carbs", "g")] },
];

/** The rest of the "big four corners" of a label — fats, fibre, sugar, salt. */
export const DETAIL: FieldDef[] = [
  { key: "saturated_fat_content", faces: [plainFace("Saturated fat", "g")] },
  { key: "trans_fat_content", faces: [plainFace("Trans fat", "g")] },
  {
    key: "unsaturated_fat_content",
    faces: [plainFace("Unsaturated fat", "g")],
  },
  { key: "fiber_content", faces: [plainFace("Fibre", "g")] },
  { key: "sugar_content", faces: [plainFace("Sugar", "g")] },
  { key: "sodium_content", faces: SALT_FACES },
  { key: "cholesterol_content", faces: [plainFace("Cholesterol", "mg")] },
];

/** The twelve US Nutrition-Facts micronutrients (ADR-0030), in panel order. */
export const MICROS: FieldDef[] = [
  { key: "vitamin_d", faces: [plainFace("Vitamin D", "µg")] },
  { key: "calcium", faces: [plainFace("Calcium", "mg")] },
  { key: "iron", faces: [plainFace("Iron", "mg")] },
  { key: "potassium", faces: [plainFace("Potassium", "mg")] },
  { key: "vitamin_a", faces: [plainFace("Vitamin A", "µg")] },
  { key: "vitamin_c", faces: [plainFace("Vitamin C", "mg")] },
  { key: "vitamin_e", faces: [plainFace("Vitamin E", "mg")] },
  { key: "vitamin_b6", faces: [plainFace("Vitamin B6", "mg")] },
  { key: "vitamin_b12", faces: [plainFace("Vitamin B12", "µg")] },
  { key: "folate", faces: [plainFace("Folate", "µg")] },
  { key: "magnesium", faces: [plainFace("Magnesium", "mg")] },
  { key: "zinc", faces: [plainFace("Zinc", "mg")] },
];

/** Every nutrient row the form renders, in read-along order. */
export const ALL_FIELDS: FieldDef[] = [...CORE, ...DETAIL, ...MICROS];

/**
 * One household-portion row as typed in the form (mirrors {@link Portion}).
 *
 * The row carries the unit its magnitude is in, which is the whole of #460's
 * fix. It is NOT a choice the row offers: {@link portionRows} reads it off the
 * portion's own magnitude, and a row the user adds takes the form's basis unit.
 * There is deliberately no control to change it — the form already answers the
 * g-versus-ml question once, above, and an earlier build that asked it twice
 * found the two controls could disagree.
 *
 * What the unit decides is whether a row is editable
 * ({@link portionRowIsEditable}).
 */
export interface PortionRow {
  label: string;
  /** The magnitude as typed. A string because it is a text box; "" ⇒ absent. */
  amount: string;
  /** The unit that magnitude is in — which sibling {@link buildPortions} fills. */
  unit: MeasuredUnit;
  /**
   * The portion this row was seeded from, held whole so an untouched row is
   * re-emitted **exactly** as it was read rather than rebuilt from the two boxes
   * the form can show. Absent on a row the user added, which has no source to
   * preserve — that absence is the row's provenance, not a missing value.
   */
  source?: Portion;
}

/** A twin's portion as the row that shows it. The one place the mapping lives,
 *  so {@link buildPortions} can ask whether a row still equals its source. */
function seededRow(portion: Portion, fallbackUnit: MeasuredUnit): PortionRow {
  const measure = portionMeasure(portion);
  return {
    label: portion.label,
    amount: measure ? String(measure.amount) : "",
    unit: measure?.unit ?? fallbackUnit,
    source: portion,
  };
}

/** True when nothing has been typed into a row — both boxes empty. */
export function portionRowIsBlank(row: PortionRow): boolean {
  return row.label.trim() === "" && row.amount.trim() === "";
}

/**
 * Whether the form may type into this row, given the unit its panel is in.
 *
 * The rule of #460, and it lives here rather than in the template because it is
 * the decision the ticket turns on: a row stating a magnitude in the unit the
 * panel does not take is shown **read-only**, in its own unit, rather than
 * hidden. That covers ADR-0060 §6's two real shapes — a drink powder's
 * prepared-100 ml serving against a per-100 g panel, an oat carton's 100 g
 * against a per-100 ml one — and a third §6 could not have: a row stranded by
 * the user flipping the basis underneath it. Nothing converts and nothing clears
 * on a flip; the row simply stops being editable.
 *
 * A blank row is always editable whatever unit it was minted in. Its unit is a
 * placeholder for a magnitude nobody has typed yet, so locking it would strand
 * an EMPTY row the user could only delete — a trap with nothing on the other
 * side of it, where a locked row that holds a magnitude is at least showing
 * something true.
 */
export function portionRowIsEditable(
  row: PortionRow,
  panelUnit: MeasuredUnit
): boolean {
  return row.unit === panelUnit || portionRowIsBlank(row);
}

/**
 * A twin's `food/portions` as the form's rows — **every** portion, in source
 * order, each carrying the unit of its own magnitude.
 *
 * This replaced a split that handed back gram rows plus a `carried` list the
 * form re-emitted untouched and never rendered. Carrying bought byte-exactness
 * and cost visibility: a drink's "1 can — 330 ml" was data the app held and
 * showed in exactly zero places — not in this form, and not in the picker
 * either, since `portionPresets` drops a portion in the other unit on a food
 * with no Density Class. A user could not tell the portion was there at all
 * (#460). The byte-exactness is kept, by `source` and the untouched rule in
 * {@link buildPortions}, so nothing was traded away to get the visibility.
 *
 * A portion carrying no usable magnitude ({@link portionMeasure} says `null`)
 * becomes a blank row in `panelUnit` and stays editable, because a portion
 * naming a household measure and no amount is precisely what a correction form
 * exists to correct. Left alone it is re-emitted untouched, exactly as the
 * `carried` list used to do for it.
 *
 * `panelUnit` is required rather than defaulted: a default would read as a
 * sensible fallback while quietly seeding every malformed portion of a drink
 * into a gram row.
 */
export function portionRows(
  portions: Portion[] | undefined,
  panelUnit: MeasuredUnit
): PortionRow[] {
  return (portions ?? []).map((portion) => seededRow(portion, panelUnit));
}

/**
 * The form's rows → the portions a twin stores: the inverse of
 * {@link portionRows}, and here beside it so the two cannot drift.
 *
 * **A row still equal to what it was seeded from is re-emitted verbatim.** That
 * is what makes the round trip byte-exact, and it reaches further than the two
 * boxes could: a portion whose magnitude is `NaN`, or one Open Food Facts
 * published as the string `"7"` rather than a number (#433), is a portion
 * `portionMeasure` cannot read and the form cannot honestly show — and it
 * survives a re-save anyway, untouched, exactly as the old `carried` list
 * ensured. Correcting the form must never be how a twin quietly loses a row.
 *
 * A row the user DID touch is rebuilt from what they typed, under three rules,
 * each of them a defect from the era when this lived inside the Svelte file and
 * nothing could test the round trip:
 *
 * - **The magnitude goes into the sibling its unit names** ({@link portionMagnitude}),
 *   so a hand-typed volume is stored as one. Before #460 every typed row was
 *   written as `grams` — a form comment said so outright — which is why a
 *   refused millilitre portion had no door back.
 * - **An unparseable magnitude writes neither sibling.** It was
 *   `Number(x) || 0`, which made a blank or non-numeric box a genuine zero-gram
 *   portion: `portionMeasure` reads 0 as a real magnitude, so the picker offered
 *   a chip that filled nothing. Absent ≠ 0 is the rule the rest of this form is
 *   built on (#28, ADR-0030) and this was the last row ignoring it.
 * - **`amount` and `unit` are minted from the label.** They always were; what is
 *   new is that an UNTOUCHED row no longer goes through it, so a scanned twin's
 *   `unit: "medium"` stops coming back as `unit: "1 medium"`. For a row somebody
 *   edited there is nothing better available — the form has no separate box for
 *   a count and a unit, and keeping the old source pair beside a label the user
 *   has just rewritten would be staler still.
 *
 * A touched row with no label is dropped, not written: every reader keys on the
 * label — `resolvePortionAmount` matches it, `formatPortionPreset` falls back to
 * it — so a nameless portion is a chip that renders as an empty string. An
 * untouched one is re-emitted by the rule above, so this never deletes a
 * nameless portion a source published.
 */
export function buildPortions(rows: PortionRow[]): Portion[] {
  const portions: Portion[] = [];
  for (const row of rows) {
    if (row.source && rowsMatch(row, seededRow(row.source, row.unit))) {
      portions.push(row.source);
      continue;
    }
    const label = row.label.trim();
    if (label === "") continue;
    const typed = row.amount.trim();
    const amount = typed === "" ? undefined : Number(typed);
    portions.push({
      label,
      amount: 1,
      unit: label,
      ...portionMagnitude(amount, row.unit),
    });
  }
  return portions;
}

/** Whether two rows show the same thing — the "untouched" test, on the three
 *  fields the form can change. */
function rowsMatch(a: PortionRow, b: PortionRow): boolean {
  return a.label === b.label && a.amount === b.amount && a.unit === b.unit;
}

/**
 * A typed box's string as a finite number, or `undefined` for a blank or
 * non-numeric one — the absent-not-zero guard every converter below shares, so
 * an empty row is omitted rather than assembled as 0 (#28, ADR-0030).
 */
function typedNumber(typed: string): number | undefined {
  const trimmed = typed.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * A row's text → the grams the panel stores, through its canonical face.
 *
 * `undefined` when the row is blank or will not parse, which is what keeps an
 * untouched row out of the panel entirely.
 */
export function storedFromText(
  field: FieldDef,
  text: string
): number | undefined {
  const n = typedNumber(text);
  return n === undefined ? undefined : field.faces[0].toStored(n);
}

/**
 * Stored grams → the text the canonical box is seeded with (so a stored 0.0026 g
 * of iron reads back as "2.6" in "mg", and a stored 0.24 g of sodium as "0.6" in
 * grams of salt).
 */
export function textFromStored(field: FieldDef, grams: number): string {
  return String(field.faces[0].fromStored(grams));
}

/**
 * One face's box, read off the row's canonical text.
 *
 * The canonical box binds to the text itself; every other face is this lens over
 * it, which is what makes two boxes describing one figure unable to disagree —
 * there is one value, shown twice.
 */
export function faceDisplay(field: FieldDef, face: Face, text: string): string {
  const grams = storedFromText(field, text);
  if (grams === undefined) return "";
  return String(face.fromStored(grams));
}

/**
 * The row's canonical text after one of its other faces was typed into — or
 * `undefined` for "no change to apply".
 *
 * The `undefined` is what lets somebody type into the second box at all: a
 * half-finished "0." is not a number, and rewriting the canonical text from it
 * would blank the box being typed in. An EMPTY box is a real change (the row is
 * being cleared) and answers `""`.
 */
const COMPLETE_NUMBER = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

export function faceEntry(
  field: FieldDef,
  face: Face,
  typed: string
): string | undefined {
  const trimmed = typed.trim();
  if (trimmed === "") return "";
  // A COMPLETE number, which is stricter than `Number()` on purpose: it reads
  // "0." as 0, so a half-typed decimal would rewrite the other box as "0" and
  // take the separator away from under the cursor.
  if (!COMPLETE_NUMBER.test(trimmed)) return undefined;
  const n = typedNumber(trimmed);
  if (n === undefined) return undefined;
  return textFromStored(field, face.toStored(n));
}

/** Every row the form renders, by the key it fills — so {@link buildLabelPanel}
 *  can read a row's faces without being handed the catalogue again. */
const FIELD_BY_KEY: Map<keyof NutritionInfo, FieldDef> = new Map(
  ALL_FIELDS.map((field) => [field.key, field])
);

/**
 * One nutrient row of the form (the sibling of {@link PortionRow}, and
 * deliberately the same design).
 *
 * This replaced three parallel string-keyed collections — the typed values, the
 * skipped keys and the unreviewed keys — which could disagree with each other
 * and with the catalogue, and which made `toggleSkip` a function that had to
 * write all three to keep them consistent.
 *
 * {@link source} is the half that fixes #561. The form held display strings and
 * nothing else, so a save rebuilt every figure from a string rounded to two
 * decimals: 41 of 88 real panels carried at least one row that did not survive
 * the trip, 137 rows across 16 keys, up to 100% out. Holding what the row was
 * seeded from means only a row somebody actually retyped is ever rebuilt — the
 * rule `buildPortions` has enforced for portions all along, for the reason it
 * states there: correcting the form must never be how a twin quietly loses data.
 */
export interface NutrientRow {
  /** The `NutritionInfo` key this row fills. */
  key: keyof NutritionInfo;
  /** The canonical face's text as typed. A string because it is a text box;
   *  "" ⇒ absent. */
  text: string;
  /**
   * The stored grams this row was seeded from, held so an untouched row is
   * re-emitted **exactly** as it was read rather than rebuilt from a rounded
   * display string. Absent on a row of a fresh capture, which has no source to
   * preserve — that absence is the row's provenance, not a missing value.
   */
  source?: number;
  /** "∅ not on label" — force-omitted even if a value was typed. */
  skipped: boolean;
  /** Prefilled by a source or a reading and not yet reviewed (the amber accent);
   *  typing in any of the row's boxes clears it. */
  unverified: boolean;
}

/** A blank row for every field — a fresh read-along form. */
export function blankNutrientRows(): NutrientRow[] {
  return ALL_FIELDS.map((field) => ({
    key: field.key,
    text: "",
    skipped: false,
    unverified: false,
  }));
}

/**
 * A panel as the form's rows — the inverse of {@link buildLabelPanel}, and here
 * beside it so the two cannot drift. The mirror of {@link portionRows} for the
 * other half of the form.
 *
 * A key the panel does not carry becomes a blank row with no `source`: absent is
 * not zero, so a row the panel never had must not come back as one. `unverified`
 * is the caller's to set — a twin re-opened for correction is the user's own
 * work and nothing is amber, where a reading proposed by a model is all of it.
 */
export function nutrientRows(
  info: NutritionInfo | undefined,
  unverified = false
): NutrientRow[] {
  return ALL_FIELDS.map((field) => {
    const stored = info?.[field.key];
    const seeded = typeof stored === "number" ? stored : undefined;
    return {
      key: field.key,
      text: seeded === undefined ? "" : textFromStored(field, seeded),
      source: seeded,
      skipped: false,
      unverified: unverified && seeded !== undefined,
    };
  });
}

/**
 * The #52 basis toggle resolved to the panel's `serving_size` string (ADR-0034
 * SS3): `100 g` when the label prints per 100 g, `100 ml` when it prints per 100
 * ml, `36 g` when it prints per a serving it weighs.
 *
 * Total over {@link Basis} by construction now that a basis is a magnitude and a
 * unit — there is no member left to forget. A panel this form writes always
 * names a divisor, which is what keeps the food it captures editable by amount
 * afterwards; what changed in #562 is that the divisor no longer has to be 100.
 */
export function resolveServingSize(basis: Basis): string {
  return `${basis.amount} ${basis.unit}`;
}

/**
 * The inverse of {@link resolveServingSize}: a saved panel's basis read back onto
 * the form's control, so re-opening a twin shows the basis it was stored with
 * rather than a guess. Lives beside the forward mapping so the two cannot drift,
 * and round-trips every basis that mapping can emit.
 *
 * **`null` for a panel naming no magnitude**, which is the repair #562 makes. It
 * used to answer `per_100g` for such a panel, and ADR-0060's 2026-08-30
 * Amendment accepted what that cost: a `"1 serving"` twin re-opened here was
 * silently **relabelled** per 100 g on save, restating a whole-serving figure as
 * a per-100 one. Twelve such panels sit in the real ledger. Answering `null`
 * leaves the magnitude box empty and the save gate holding, which turns those
 * twelve from relabelled into repairable — the rule
 * {@link portionRowIsEditable} already states for a portion that names a
 * household measure and no amount: that is precisely what a correction form
 * exists to correct.
 *
 * It reads the three siblings in `nutrition.ts` rather than a regex of its own,
 * so this and every scaler agree about what a basis string says.
 */
export function invertServingSize(
  serving_size: string | undefined
): Basis | null {
  if (!basisIsStated(serving_size)) return null;
  return {
    amount: parseBasisQuantity(serving_size),
    unit: basisUnit(serving_size),
  };
}

export interface BuiltLabelPanel {
  /** The assembled panel: grams, `serving_size` resolved, untouched keys omitted. */
  nutrition: NutritionInfo;
  /** The nutrient keys that received a value — the audit hint for provenance. */
  filledKeys: string[];
}

/**
 * Assembles the typed rows into a stored {@link NutritionInfo} (ADR-0034 SS3) —
 * the pure heart of the Read-along form. The basis resolves onto `serving_size`;
 * a blank or skipped row is **omitted, never 0** (absent ≠ 0).
 *
 * **A row still equal to what it was seeded from re-emits its source**, byte for
 * byte, rather than being rebuilt from the string the box shows. That is the
 * whole of #561: the box shows two decimals, and a USDA panel's `0.000005` g of
 * B6 or `0.005` g of trans fat does not survive two decimals. Only a row
 * somebody actually retyped goes through a conversion, so correcting one figure
 * on a twin can no longer quietly rescale fifteen others.
 */
export function buildLabelPanel(
  rows: NutrientRow[],
  basis: Basis
): BuiltLabelPanel {
  const nutrition: NutritionInfo = { serving_size: resolveServingSize(basis) };
  const filledKeys: string[] = [];
  for (const row of rows) {
    if (row.skipped) continue;
    const field = FIELD_BY_KEY.get(row.key);
    if (!field) continue;
    const grams = nutrientRowIsUntouched(row, field)
      ? row.source
      : storedFromText(field, row.text);
    if (grams === undefined) continue;
    (nutrition as unknown as Record<string, unknown>)[row.key] = grams;
    filledKeys.push(row.key);
  }
  return { nutrition, filledKeys };
}

/** Whether a row still shows exactly what it was seeded with — the "untouched"
 *  test, and the sibling of `rowsMatch` on the portion half. */
export function nutrientRowIsUntouched(
  row: NutrientRow,
  field: FieldDef
): boolean {
  return (
    row.source !== undefined && row.text === textFromStored(field, row.source)
  );
}

/** True when nothing has been typed into a nutrient row. */
export function nutrientRowIsBlank(row: NutrientRow): boolean {
  return row.text.trim() === "";
}
