import type { NutritionInfo } from "./nutrition";

// ---------------------------------------------------------------------------
// DEFERRED SEAM: AI package-image autofill (label-photo capture, map #47)
// ---------------------------------------------------------------------------
//
// The real implementation — a multimodal-LLM call that reads a nutrition-label
// photo into a structured panel — is deferred to future work. #49 (research,
// closed) settled that cost is a non-issue (~$0.006-0.02/label) and recommends
// AI-autofill-then-human-confirm (Haiku 4.5 default, Sonnet 5 escalation for
// dense/multilingual labels); the extraction mechanism is still being decided
// against the real sample labels in #51 (prototype). This module is only the
// TYPED SEAM future work drops the model into: the shape the confirm/edit form
// (#52) consumes, wired to a mock so the flow can be built and exercised before
// any model call exists.
//
// Two contracts locked here, both grounded in the closed decisions:
//   * FULL PANEL, not four macros — the result targets the whole
//     `nutrition/info` panel (macros + sat/fibre/sugar/salt + the twelve micros)
//     via {@link NutritionInfo}, so a captured food matches an OFF-sourced twin
//     (map decision 3). We reuse the panel type rather than a parallel shape.
//   * CONFIRM BEFORE SAVE — structured output guarantees the panel's *shape*,
//     never its *value truth* (#49), so an `AIAutofillResult` is a PROPOSAL for
//     the user to verify in the confirm form (#52), never written un-reviewed.

/**
 * Which basis a label printed its values against — the choice the confirm form
 * (#52) resolves before the panel is stored. Labels print per 100 g or per
 * serving; the panel stores against a `serving_size` string (`PER_100G` /
 * `PER_SERVING`), so this maps straight onto that field once confirmed.
 */
export type NutritionBasis = "per_100g" | "per_serving";

/**
 * A proposed reading of a nutrition label, for the user to confirm/edit (#52) —
 * never a stored panel. Every nutrition row is optional and **absent means "not
 * present / unreadable on the label", never 0**: the same absent-not-zero
 * discipline the panel itself keeps (ADR-0030 / #28), so the form can tell a row
 * the label omitted from a genuine zero and the model is never forced to
 * fabricate a value for a row it could not read.
 */
export interface AIAutofillResult {
  /** Product name as read from the label; `null` when the label showed none or it was unreadable. */
  name: string | null;
  /** Brand as read from the label; `null` when absent/unreadable. */
  brand: string | null;
  /** The basis the extracted values were printed against; resolved to a `serving_size` by the confirm form. */
  basis: NutritionBasis;
  /**
   * The extracted panel keyed by {@link NutritionInfo} field, so it maps straight
   * onto a stored panel once confirmed. `serving_size` is omitted — {@link basis}
   * carries it, and the form sets the final string — hence `Partial`.
   */
  nutrition: Partial<NutritionInfo>;
}

/**
 * DEFERRED (see module header, #51, #49): reads a base64 label photo into a
 * proposed {@link AIAutofillResult}. This is a stub — it makes **no model call**
 * and returns fixed mock data of the real full-panel shape so the capture flow
 * (#53) and confirm form (#52) can be built against a stable contract. Future
 * work replaces the body with the multimodal-LLM call; the signature stays.
 */
export async function autofillFromPackageImage(
  imageBase64: string
): Promise<AIAutofillResult> {
  console.info(
    "[DEFERRED STUB] autofillFromPackageImage called with image size:",
    imageBase64.length
  );

  // Simulate the model round-trip so the flow's loading state is exercised.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Mock of the real full-panel shape. Labels print per 100 g, so `basis` is
  // per_100g. Some rows are deliberately absent (no cholesterol, most micros) to
  // demonstrate absent-not-zero: a real label rarely prints every row, and the
  // confirm form must render "not measured", not "0 g", for those.
  return {
    name: "AI Guessed Product (Stub)",
    brand: null,
    basis: "per_100g",
    nutrition: {
      calories: 250,
      protein_content: 15,
      fat_content: 8,
      saturated_fat_content: 2.5,
      carbohydrate_content: 30,
      sugar_content: 12,
      fiber_content: 3,
      sodium_content: 0.4,
      calcium: 0.12,
      iron: 0.0026,
    },
  };
}
