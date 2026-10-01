import { BASIS_PRESETS, type Basis } from "./label-form";
import type { NutritionInfo } from "./nutrition";
import type { ModelOutcome } from "../logs/model-log";
import {
  askModel,
  ModelExhaustedError,
  ModelUnreachableError,
  ModelUnusableError,
  type LabelReading,
} from "./model-route";

// ---------------------------------------------------------------------------
// The normaliser: a label reading becomes a panel proposal (ADR-0115 §5.2, §5.3)
// ---------------------------------------------------------------------------
//
// This module is where a reading off the wire becomes something the confirm
// form can show, and it is deliberately **not** where the network is. The
// transport lives in `model-route.ts` for two reasons: a pure normaliser can be
// tested against the eight committed sample labels (#476) with no network and a
// module that fetches cannot, and normalising a label reading into a panel is
// exactly the "pure module full of nutrition arithmetic" that
// `scripts/worker-closure-check.mjs`'s own header disqualifies from the edge.
// So the Worker owns a flat wire shape and knows nothing about a `Basis`, and
// the arithmetic stays here.
//
// Three contracts, each won somewhere else and each easy to undo here:
//
//   * FULL PANEL, not four macros — the result targets the whole
//     `nutrition/info` panel via {@link NutritionInfo}, so a captured food
//     matches an OFF-sourced twin (ADR-0034 §3). The wire asks for twelve of
//     its rows and the other eleven stay blank; that is a decision about the
//     REQUEST (ADR-0115 §5.3) and not a narrowing of the panel.
//   * CONFIRM BEFORE SAVE — an {@link AIAutofillResult} is a **proposal** for
//     the user to verify row by row (ADR-0034 §3/§4), never written
//     un-reviewed. It is rule 1, and it is the reason a wrong figure here is
//     recoverable at all.
//   * ABSENT IS NEVER ZERO — a row the label did not print is **omitted**, never
//     `0` (ADR-0030). The wire may spell absence two ways and both normalise to
//     omitted; the third spelling, `0` for a row nothing printed, is the one
//     that must never arrive, is unfalsifiable from a response, and is what the
//     Worker's guard sentence exists to prevent.

/**
 * A proposed reading of a nutrition label, for the user to confirm/edit —
 * never a stored panel. Every nutrition row is optional and **absent means "not
 * present / unreadable on the label", never 0**: the same absent-not-zero
 * discipline the panel itself keeps (ADR-0030 / #28), so the form can tell a row
 * the label omitted from a genuine zero.
 */
export interface AIAutofillResult {
  /** Product name as read from the label; `null` when the label showed none or it was unreadable. */
  name: string | null;
  /** Brand as read from the label; `null` when absent/unreadable. */
  brand: string | null;
  /**
   * The basis the extracted values were printed against, resolved to a
   * `serving_size` by the confirm form through `resolveServingSize`.
   *
   * Deliberately {@link Basis} itself rather than a basis type of this module's
   * own (ADR-0060 §7): a duplicate that lacked `per_100ml` was wrong from the
   * moment #148 made a panel per-100 ml. The form assigns this straight onto
   * its toggle, which is a de facto assertion that the two are one type — so
   * they are one type.
   */
  basis: Basis;
  /**
   * The extracted panel keyed by {@link NutritionInfo} field, so it maps straight
   * onto a stored panel once confirmed. `serving_size` is omitted — {@link basis}
   * carries it, and the form sets the final string — hence `Partial`.
   */
  nutrition: Partial<NutritionInfo>;
}

/**
 * The guided-manual starting point (ADR-0034 §4): an {@link AIAutofillResult}
 * with nothing filled — no name, no brand, an empty panel, defaulting to the
 * per-100 g basis a label prints. The confirm form is built **once** for both
 * extraction modes by initialising from a result: this empty one is the
 * guided-manual case (every row blank, nothing prefilled/"to review"), while a
 * model read feeds the same form a populated one.
 */
export function emptyAutofillResult(): AIAutofillResult {
  return {
    name: null,
    brand: null,
    basis: BASIS_PRESETS.per_100g,
    nutrition: {},
  };
}

/**
 * The twelve keys the request asks for, and what each does to the panel.
 *
 * **A table of writers rather than a table of scale factors**, so that every
 * entry is checked against {@link NutritionInfo}'s own field types by the
 * compiler and salt is not a special case in a loop. Eleven are transcriptions
 * and one is a conversion; the conversion says so where it happens.
 *
 * The key list is the **fabrication surface** — #482's ablation measured that
 * the rows you ask for are what a fabrication attaches itself to — so it is
 * twelve rather than the prototype's twenty-one, and the four micros are named
 * for the unit their label prints. `vitamin_d_ug` rather than `vitamin_d_mg`
 * kills a 1000× trap of the olive oil's own shape by construction.
 *
 * Every `*_content` field and every micro is stored in **grams**, which is why
 * the micros divide and the macros do not.
 */
const WIRE_TO_PANEL: Record<
  string,
  (panel: Partial<NutritionInfo>, value: number) => void
> = {
  energy_kcal: (p, v) => void (p.calories = v),
  fat_g: (p, v) => void (p.fat_content = v),
  saturated_fat_g: (p, v) => void (p.saturated_fat_content = v),
  carbohydrate_g: (p, v) => void (p.carbohydrate_content = v),
  sugar_g: (p, v) => void (p.sugar_content = v),
  fiber_g: (p, v) => void (p.fiber_content = v),
  protein_g: (p, v) => void (p.protein_content = v),
  // The one derived row. See {@link SALT_TO_SODIUM}.
  salt_g: (p, v) => void (p.sodium_content = v / SALT_TO_SODIUM),
  vitamin_d_ug: (p, v) => void (p.vitamin_d = v * 1e-6),
  calcium_mg: (p, v) => void (p.calcium = v * 1e-3),
  iron_mg: (p, v) => void (p.iron = v * 1e-3),
  potassium_mg: (p, v) => void (p.potassium = v * 1e-3),
};

/**
 * Salt as printed becomes sodium as stored, and this division is **ours**.
 *
 * ADR-0115 §6.2: asking the model to divide would be a computed number reaching
 * a panel, which rule 3 refuses — so the wire carries `salt_g` exactly as the
 * label prints it and the only arithmetic happens here. ADR-0021's 2026-08-14
 * Amendment fixes the ratio and the direction: *read sodium, never salt; the
 * two differ by roughly the 2.5x conversion.*
 *
 * **It is also the one row the user cannot check.** Every other proposed figure
 * is the printed figure and the review is a comparison; this one is a jar
 * printing `Salt 0,6 g` proposing 0.24 g of sodium, and no amount of looking at
 * the pack confirms that. The confirm step is the whole safety mechanism
 * everywhere else and is not one here, which is why it is worth its own
 * constant and its own paragraph.
 *
 * Related and deliberately not fixed here: `label-form.ts` labels this row
 * `"Salt / sodium"` in mg where every EU label prints salt in grams, and no
 * `÷ 2.5` exists on the hand-typed path at all
 * ([#508](https://github.com/palebluebytes/inventoria/issues/508)). That defect
 * predates this path and is filed against it.
 */
const SALT_TO_SODIUM = 2.5;

/**
 * Which wire bases the app has a type for.
 *
 * A {@link Basis} is a magnitude and a unit since #562, so the wire's two
 * spellings name {@link BASIS_PRESETS} positions rather than being bases
 * themselves. Deliberately not the general case: the wire cannot state a
 * magnitude, so a reading that answers `per_serving`, `null`, or anything else
 * **refuses the whole result** — see {@link normaliseLabelReading}.
 */
const BASES: Record<string, Basis> = {
  per_100g: BASIS_PRESETS.per_100g,
  per_100ml: BASIS_PRESETS.per_100ml,
};

/**
 * Turn one reading off the wire into a panel proposal.
 *
 * Pure, and that is the point: it is exercised against the committed sample
 * labels with no network, no binding and no key.
 *
 * **A basis the app cannot express refuses the whole result**, rather than
 * dropping to `per_100g`. `invertServingSize`'s fallback is defensible because
 * it reads back a panel we already stored; guessing the basis of a label we
 * have just read **relabels every row at once**, turning a per-serving panel
 * into a per-100 g claim with nothing on screen saying so. Untested rather than
 * refuted: all three panel samples answered correctly on every run.
 *
 * **Absence is preserved in both of its spellings.** The prompt asks for the key
 * to be omitted; #482 measured the chosen model answering `"fiber_g": null` for
 * the olive oil, which prints no fibre row, and `"fiber_g": 0` for the Indian
 * paste, which prints fibre *as* zero. It got the distinction that matters
 * exactly right in both directions while disobeying the spelling, and refusing
 * a correct answer over a spelling would be a validator crying wolf. So `null`
 * and omitted both normalise to omitted, and a printed `0` survives as `0`.
 *
 * **A key the contract did not ask for is ignored**, rather than refused. The
 * request is what bounds the fabrication surface (§5.3); a response carrying an
 * extra row is a model being chatty, and dropping it on the floor is the same
 * outcome as never having asked.
 */
export function normaliseLabelReading(reading: LabelReading): AIAutofillResult {
  const basis = reading.basis === null ? undefined : BASES[reading.basis];
  if (basis === undefined) {
    throw new ModelUnusableError(
      "The label's basis is not one this panel can hold"
    );
  }

  const nutrition: Partial<NutritionInfo> = {};
  for (const [wireKey, value] of Object.entries(reading.nutrition ?? {})) {
    if (value === null || typeof value !== "number" || !Number.isFinite(value))
      continue;
    WIRE_TO_PANEL[wireKey]?.(nutrition, value);
  }

  return {
    name: reading.name,
    brand: reading.brand,
    basis,
    nutrition,
  };
}

/**
 * Read a label from the photographs the user just agreed to send.
 *
 * The seam the confirm form calls. It takes **N images** rather than one:
 * `autofillFromPackageImage(imageBase64)` was written against a single-image
 * world that ADR-0115 §3.1 ended, where the request's unit is the capture array
 * at the moment of the tap. A two-sided bottle genuinely needs both shots, and
 * #482 measured the second photograph taking one model's completeness from four
 * printed rows to eight.
 *
 * It **throws**, in the named classes `model-route.ts` declares, and
 * {@link modelOutcomeOf} is what a caller turns those into. Nothing partial is
 * ever returned: ADR-0115 §9.1 makes a failure atomic, so the form is identical
 * to the instant before the press.
 */
export async function autofillFromPackageImage(
  images: string[]
): Promise<AIAutofillResult> {
  return normaliseLabelReading(await askModel("label", images));
}

/**
 * Which of the five outcomes a failure was.
 *
 * `scanOutcomeOfFailure` (`off-retry.ts`) a second time, down to the
 * fallthrough. A discriminated return was refused as a second idiom for a job
 * this repo has solved three times — `OffUnreachableError`,
 * `StoreUnreachableError`, `ArtifactUnreachableError` — and `off-retry.ts`'s
 * own header argues why the distinction belongs in a class: *spelled as that
 * class rather than restated as a second list of statuses, so the two can never
 * say different things.*
 *
 * **The fallthrough to `refused` is load-bearing.** It is what stops an
 * unrecognised failure being mistaken for a readable answer, and `refused` is
 * the right place for one: it is the class the user cannot act on, which is
 * exactly what an unrecognised failure is.
 *
 * The screen branches on what this returns, never on a status, so the log and
 * the screen cannot come to disagree about what happened.
 */
export function modelOutcomeOf(failure: unknown): ModelOutcome {
  if (failure instanceof ModelUnreachableError) return "unreachable";
  if (failure instanceof ModelExhaustedError) return "exhausted";
  if (failure instanceof ModelUnusableError) return "unusable";
  return "refused";
}
