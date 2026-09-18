// ---------------------------------------------------------------------------
// The marked panel: what a Pack pairing fills, and what it may never fill
// ---------------------------------------------------------------------------
//
// A **Pack pairing** names one reference food and stops there (`pairing.ts`,
// ADR-0113 §7): the datom carries no field list and no name, because which
// reference food you chose is the whole of your assertion. **This module is the
// other half** — what that assertion licenses on screen, computed at read time
// from whichever panel rows are silent now.
//
// Two rules make the whole of it (§4):
//
//  - **The label always wins.** Where both sources carry a value the label's is
//    shown and the reference's is not shown at all — not folded away, not behind
//    a tap. An overlapping USDA value is not a better measurement of your jar; it
//    is an accurate measurement of a different preparation.
//  - **Silence is partitioned by nutrient, never by jurisdiction.** A reference
//    food fills a silence only where no label could have carried the figure.
//
// Everything this hands back is a **reading**. An estimate never reaches a stored
// `nutrition/info` (§7): the panel datom stays strictly the label, and the marked
// rows are composed here on every read. The narrow reason is §1 — the Open Food
// Facts product stays the food. The sharper one is that `nutrition/info` is
// user-writable as a label correction (ADR-0034 §6), so a merged panel would
// silently become a user-attributed transcription the first time somebody fixed a
// typo in it, and the seam would be gone with no datom having lied.
// ---------------------------------------------------------------------------

import { convertAmount, type FoodDensity } from "./density";
import {
  fdcIdFor,
  storedPanelFor,
  type UsdaCorpusNutrientStore,
} from "./usda-corpus";
import {
  EXTRA_NUTRIENT_KEYS,
  basisIsStated,
  basisUnit,
  parseBasisQuantity,
  roundExtraNutrient,
  type ExtraNutrientKey,
  type NutritionExtras,
  type NutritionInfo,
} from "./nutrition";

/**
 * The mandatory nutrition declaration, in this app's panel keys — the nutrients
 * a reference food may **never** supply (§4).
 *
 * EU Regulation 1169/2011 requires energy, fat, saturates, carbohydrate, sugars,
 * protein and salt, and every one of them is mandatory on a US panel under 21 CFR
 * 101.9(c) as well. So a pack silent on one of these is silent wherever it was
 * sold, which makes the silence a **failed capture** rather than a lawful
 * omission — and a reference food may not cover for a failed capture.
 *
 * The converse is what makes the partition a rule rather than a list: cholesterol
 * and trans fat are mandatory on a US panel and absent from the EU declaration, so
 * a European pack is lawfully silent on both, and the twelve metered
 * micronutrients are outside the EU declaration too. #495 measured the population
 * agreeing — 20 of 22 paired twins silent on cholesterol, 22 of 22 on trans fat,
 * and of 35 `gtin:` twins with a panel, 0 carry a non-zero trans fat.
 *
 * **The per-jurisdiction version of this rule is unsound, not merely
 * unnecessary**, and the fact it would need is already in the ledger: OFF's
 * `countries_tags` is a *sales* list, so it cannot say which panel is printed on
 * the jar in your hand, and 14 of the 21 twins carrying it sit under
 * `twin/raw_provenance`, which ADR-0086 §5 superseded and the shipped code does
 * not read.
 */
export const DECLARED_NUTRIENT_KEYS: ReadonlySet<string> = new Set([
  "calories",
  "protein_content",
  "fat_content",
  "carbohydrate_content",
  "sugar_content",
  "saturated_fat_content",
  "sodium_content",
]);

/**
 * The panel keys a reference food may fill, in panel order.
 *
 * Derived by exclusion from {@link EXTRA_NUTRIENT_KEYS} rather than written out,
 * so the rule reads forwards: a nutrient outside the mandatory declaration is one
 * a label could lawfully have been silent on, and a panel nutrient coined later
 * arrives fillable unless {@link DECLARED_NUTRIENT_KEYS} names it.
 *
 * The four headline macros are absent for a second, independent reason and are
 * named in the declaration anyway: they are not extras at all, and read as 0
 * rather than as absent on every surface in this app, so a borrowed one could not
 * be told from a measured one even by the mark.
 */
export const FILLABLE_NUTRIENT_KEYS: readonly ExtraNutrientKey[] =
  EXTRA_NUTRIENT_KEYS.filter((key) => !DECLARED_NUTRIENT_KEYS.has(key));

/**
 * A panel as a person reads it: the label's own figures, plus whatever the
 * reference food supplied, and the list of which was which.
 *
 * `filled_fields` is the same key under the same name a frozen occasion writes
 * (§6), because it is the same fact about the same act — one read live, one
 * frozen at log time.
 */
export interface MarkedPanel {
  /** The label's panel, widened by the borrowed rows. Never stored (§7). */
  panel: NutritionInfo;
  /**
   * The keys the reference food supplied, in panel order. **Empty rather than
   * absent**, and a caller reads _nothing was supplied_ off its length — the
   * same rule `buildRawProvenance` keeps for `merged_from`.
   */
  filled_fields: ExtraNutrientKey[];
}

/**
 * The paired row's own panel, on its own basis, or `undefined` where this store
 * does not carry it.
 *
 * The sibling of `referenceFoodName`, and it resolves the same way and for the
 * same reason: §7 keeps the twin's pairing a **bare live id**, so both what a
 * pack is paired with and what that food measures are looked up on every read
 * rather than copied onto the twin. An id the store cannot answer for is an
 * unfilled pairing and never an unpaired pack — the row may simply have left the
 * corpus, which §7 says leaves the pairing standing.
 *
 * `store` is the caller's, which is where the **Pairing nutrient store** will
 * enter: a pack paired with a **Pairing target** has its panel in the second
 * artifact rather than this one, and which set a pairing reaches is
 * [#522](https://github.com/palebluebytes/inventoria/issues/522)'s, alongside the
 * **Declared state** that is the only route to one.
 */
export function referenceFoodPanel(
  store: UsdaCorpusNutrientStore,
  reference: string
): NutritionInfo | undefined {
  const fdcId = fdcIdFor(reference);
  if (fdcId === null) return undefined;
  return storedPanelFor(store, fdcId);
}

/**
 * What one unit of the reference food's basis is worth against the label's, or
 * `undefined` where the two bases cannot be put onto each other.
 *
 * The reference food publishes per 100 g and this asks for that in writing: a
 * store row stating any other basis is not something to guess about.
 *
 * On the label's side there are two ways to have no answer, and both end the
 * fill rather than approximate it:
 *
 *  - **A volume basis on a food nobody has classified.** A per-100 ml drink's
 *    basis reaches grams only through a density the user asserted, which is the
 *    one door (ADR-0108 §1). With none, a factor of 1 would be the ratio-1
 *    pretence ADR-0060 §2 refuses.
 *  - **A serving of unstated weight.** `parseBasisQuantity` falls back to 100 so
 *    that a scaler always has a divisor; borrowing against that fallback would
 *    assert the serving weighs 100 g, which is a number nobody measured.
 */
function basisFactor(
  label: NutritionInfo,
  reference: NutritionInfo,
  density: FoodDensity | undefined
): number | undefined {
  if (!basisIsStated(reference.serving_size)) return undefined;
  if (basisUnit(reference.serving_size) !== "g") return undefined;
  if (!basisIsStated(label.serving_size)) return undefined;
  const grams = convertAmount(
    parseBasisQuantity(label.serving_size),
    basisUnit(label.serving_size),
    "g",
    density
  );
  if (grams === undefined || grams <= 0) return undefined;
  return grams / parseBasisQuantity(reference.serving_size);
}

/**
 * The reading a paired pack's panel composes to (§§4–5): one list, in panel
 * order, where a figure the reference food supplied is told apart from one the
 * manufacturer printed by the `est` mark the views draw off `filled_fields`.
 *
 * `reference` is the paired row's own panel, on its own basis. Absent — because
 * the pack is paired with nobody, or because the corpus no longer carries the row
 * (§7 keeps such a pairing standing) — hands the label straight back, which is
 * the state every unpaired pack is already in.
 *
 * `density` is the pack's, and it is here for exactly one job: putting the
 * label's own basis into grams so the reference's per-100-g figures can be read
 * against it. Nothing rescales the reference food to another preparation, and
 * nothing is calibrated by the label's own energy — §10 refuses both, and a
 * cooked jar is met by reaching the right record instead (§11).
 */
export function markPanel(
  label: NutritionInfo,
  reference: NutritionInfo | undefined,
  density: FoodDensity | undefined = undefined
): MarkedPanel {
  const factor = reference && basisFactor(label, reference, density);
  if (!reference || factor === undefined)
    return { panel: label, filled_fields: [] };

  const filled: NutritionExtras = {};
  const filled_fields: ExtraNutrientKey[] = [];
  for (const key of FILLABLE_NUTRIENT_KEYS) {
    // The label wins, and a declared zero is a figure it carried: absent is
    // never 0 in this app (ADR-0030), so a pack stating 0 g of fibre has
    // measured its fibre and nothing there is silent.
    if (typeof label[key] === "number") continue;
    const borrowed = reference[key];
    if (typeof borrowed !== "number") continue;
    filled[key] = roundExtraNutrient(borrowed * factor);
    filled_fields.push(key);
  }
  // Omitted, never emitted empty: a pairing that supplied nothing hands back the
  // very panel it was given, so a caller comparing identity sees no reading at
  // all rather than a copy that happens to be equal.
  if (filled_fields.length === 0) return { panel: label, filled_fields };
  return { panel: { ...label, ...filled }, filled_fields };
}
