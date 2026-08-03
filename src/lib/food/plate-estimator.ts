// ---------------------------------------------------------------------------
// DEFERRED SEAM: plate-photo calorie estimation (ADR-0035 §5)
// ---------------------------------------------------------------------------
//
// Estimating an unknown restaurant plate's calories from a photo is a DIFFERENT
// task from OCR-ing a printed nutrition label — so it is a SIBLING extractor to
// the label `autofillFromPackageImage` seam (ai-autofill.ts), not a reuse of it.
//
// v1 fabricates NOTHING. Mirroring ADR-0034 §4 (label AI-autofill deferred behind
// the empty `AIAutofillResult`, v1 uses the empty result and calls no model), the
// plate flow in v1 is: capture/pick a plate photo -> a BLANK menu-style review
// form opens with the photo attached -> the user fills it -> save. The flow uses
// {@link emptyPlateEstimate}; it never calls {@link estimatePlate} (the stub).
//
// The deferred real path: when a real estimator lands it returns a PROPOSAL
// `{ name, calories, ingredients[] }` that prefills the same menu-style review
// form, under the same CONFIRM-BEFORE-SAVE contract as ADR-0034 §3/§4 — the
// proposal is never written un-reviewed. Its natural transport is the Workers-AI
// provider seam + Settings API-key gate being stood up for label AI-autofill
// (map #62), but v1 does NOT depend on that landing — this seam is independent.

/**
 * A proposed reading of a plate photo, for the user to confirm/edit — never a
 * stored food. The shape is exactly the menu review form's fields minus "Place":
 * a dish name, an estimated calorie count, and the identified foods.
 *
 * Every field is nullable/empty because absence is honest: `null` calories means
 * "not estimated" (the v1 empty case, and any future row the model could not
 * read), never a fabricated 0. `ingredients` is descriptive free-text pieces the
 * form joins into the single `food/ingredients` string — it NEVER computes
 * calories (ADR-0035 §4).
 */
export interface PlateEstimate {
  /** Dish name as identified from the plate; `null` when not estimated. */
  name: string | null;
  /** Estimated calories (kcal); `null` when not estimated — never a bogus 0. */
  calories: number | null;
  /** The foods identified on the plate, descriptive only; empty when none. */
  ingredients: string[];
}

/**
 * The v1 starting point (ADR-0035 §5): an empty {@link PlateEstimate} — no name,
 * no calories, no ingredients. The plate flow opens the menu-style review form
 * initialised from THIS, so the form is blank with only the captured photo
 * attached and the user fills every field. No model call, no fabricated numbers.
 */
export function emptyPlateEstimate(): PlateEstimate {
  return { name: null, calories: null, ingredients: [] };
}

/**
 * DEFERRED (see module header, ADR-0035 §5): reads a base64 plate photo into a
 * proposed {@link PlateEstimate} for the user to confirm. This is a STUB — it
 * makes **no model call** and, unlike a mock, fabricates **no numbers** (a mock
 * returning invented calories is rejected outright, ADR-0035 Alternatives). It
 * returns the same empty estimate v1 uses, so wiring it in changes nothing until
 * a real estimator replaces the body; the signature and confirm-before-save
 * contract stay. The v1 flow does NOT call this — it uses
 * {@link emptyPlateEstimate} directly.
 */
export async function estimatePlate(
  imageBase64: string
): Promise<PlateEstimate> {
  console.info(
    "[DEFERRED STUB] estimatePlate called with image size:",
    imageBase64.length
  );
  return emptyPlateEstimate();
}
