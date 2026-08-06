import type { EntityPayload } from "../ingestion/ingest";
import type { FoodAssessment } from "./open-food-facts";

/**
 * The NOVA read-back selector (ADR-0041 §4) — the first reader of the write-only
 * `food/assessment` blob. Pure and table-testable; the badge (#91) and the
 * explainer (#92) both consume `deriveNovaVerdict`'s output, so this module is
 * the shared spine those tickets build on.
 */

/**
 * Per-product evidence behind an OFF-authoritative verdict (ADR-0041 §6). Both
 * faces are optional and forward-only: `additives` are the E-numbers OFF flagged
 * (`food/assessment.additives`); `debug` is the `nova_group_debug` marker trail
 * that drove OFF's classification. A rated verdict NEVER depends on either being
 * present — foods captured before the mapper widening (adapter v6) show their
 * tier with a thin evidence section (ADR-0041 §7).
 */
export interface NovaEvidence {
  additives?: string[];
  debug?: string;
}

/**
 * A food's NOVA processing verdict, computed on read (ADR-0041 §4) — no written
 * attribute, no migration. Three faces:
 *
 * - **rated / off** — an OFF-authoritative tier 1–4, carrying its evidence.
 * - **rated / inferred** — the reserved NOVA-1 `· est` slot for basic USDA whole
 *   foods. LEFT UNFILLED by this selector; ticket D (#93) fills it from the USDA
 *   category allow-list rule (`docs/research/89-*`). Designed up front so ticket
 *   D is purely additive.
 * - **not-rated** — everything else: the ~75% of OFF products OFF could not
 *   classify, and every non-OFF food (manual, USDA-without-inference, recipe). A
 *   neutral, honest coverage statement — never a warning (ADR-0041 §2).
 */
export type NovaVerdict =
  | {
      state: "rated";
      tier: 1 | 2 | 3 | 4;
      source: "off";
      evidence: NovaEvidence;
    }
  | { state: "rated"; tier: 1; source: "inferred" } // reserved for #93
  | { state: "not-rated" };

// OFF's authoritative NOVA scale is exactly 1–4; anything else in the blob (a 0,
// a stray value) is treated as "not classified" rather than trusted as a tier.
const OFF_TIERS: ReadonlySet<number> = new Set([1, 2, 3, 4]);

/**
 * Reads a food twin's NOVA verdict back off its captured `food/assessment`
 * (ADR-0041 §4). OFF branch: an assessment carrying a NOVA group in 1–4 yields an
 * authoritative `off` verdict, gathering its evidence — the flagged additives and
 * the `nova_group_debug` trail, each included only where present. Everything else
 * — a blank/absent assessment, a non-OFF food, a USDA food (its `· est` inference
 * is ticket D's job) — yields `not-rated`.
 *
 * Accepts the food twin as an {@link EntityPayload} (the shape the food-twin
 * selectors read, e.g. `mapPayloadToFoodResult`), so the `inferred` branch #93
 * adds can reach the `fdc:` entity id and `food/category` from the same value.
 */
export function deriveNovaVerdict(food: EntityPayload): NovaVerdict {
  const assessment = food.attributes["food/assessment"] as
    | FoodAssessment
    | undefined;
  const tier = assessment?.nova_group;
  if (tier != null && OFF_TIERS.has(tier)) {
    const evidence: NovaEvidence = {};
    if (assessment?.additives?.length)
      evidence.additives = assessment.additives;
    if (assessment?.nova_group_debug)
      evidence.debug = assessment.nova_group_debug;
    return {
      state: "rated",
      tier: tier as 1 | 2 | 3 | 4,
      source: "off",
      evidence,
    };
  }
  // The reserved `inferred` NOVA-1 slot for basic USDA whole foods stays UNFILLED
  // here — ticket D (#93) adds it before this fall-through (ADR-0041 §3, §4).
  return { state: "not-rated" };
}
