import type { EntityPayload } from "../ingestion/ingest";
import type { FoodAssessment } from "./open-food-facts";
import type { RawProvenance } from "./provenance";

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
 * - **rated / inferred** — a basic USDA whole food (banana, egg, raw chicken)
 *   reads as NOVA 1 unprocessed, our own constrained client-side inference from
 *   the USDA category allow-list (`docs/research/89-*`). Rendered plainly, exactly
 *   like an OFF NOVA-1; the `inferred` source only keeps the explainer honest
 *   (no false OFF attribution). NOVA-1 is the ONLY value the app ever infers.
 * - **not-rated** — everything else: the ~75% of OFF products OFF could not
 *   classify, and every other non-OFF food (manual, recipe). A neutral, honest
 *   coverage statement — never a warning (ADR-0041 §2).
 */
export type NovaVerdict =
  | {
      state: "rated";
      tier: 1 | 2 | 3 | 4;
      source: "off";
      evidence: NovaEvidence;
    }
  | { state: "rated"; tier: 1; source: "inferred" }
  | { state: "not-rated" };

// OFF's authoritative NOVA scale is exactly 1–4; anything else in the blob (a 0,
// a stray value) is treated as "not classified" rather than trusted as a tier.
const OFF_TIERS: ReadonlySet<number> = new Set([1, 2, 3, 4]);

/**
 * The USDA NOVA-1 inference gate (rule settled in
 * `docs/research/89-usda-nova1-whole-food-rule.md`; ADR-0041 §3). This is the
 * ONE client-side inference the app allows — NOVA-1-only, basic whole foods,
 * erring toward under-claiming. Every guard below is deliberately conservative:
 * a missed banana harmlessly reads "not rated"; a prepared dish never reaches
 * NOVA 1.
 */

// The FDC `foodCategory` groups whose SR/Foundation contents are overwhelmingly
// raw / whole single foods (§4a). Matched by EXACT, case-sensitive equality —
// the FDC description strings are historically stable. Deliberately EXCLUDED:
// Dairy and Egg Products (cheese = NOVA 3) and Cereal Grains and Pasta (dry
// pasta = NOVA 3), among others; plain eggs are rescued separately below.
// NB: if USDA ever renames a group, an allow-listed food silently drops to
// "not rated" — a safe failure mode (§6, string-drift).
const USDA_WHOLE_FOOD_CATEGORIES: ReadonlySet<string> = new Set([
  "Fruits and Fruit Juices",
  "Vegetables and Vegetable Products",
  "Legumes and Legume Products",
  "Nut and Seed Products",
  "Spices and Herbs",
  "Beef Products",
  "Poultry Products",
  "Lamb, Veal, and Game Products",
  "Finfish and Shellfish Products",
  "Pork Products",
]);

// Belt-and-braces name guard (§4b + §4c): even inside an allow-listed group a
// minority of items cross into NOVA 3 by added salt/oil/sugar or preservation.
// A case-insensitive substring hit on `food/name` suppresses the inference. The
// trailing four (`nog`/`roll`/`substitute`/`powder`) are the egg-specific denials
// that keep egg-nog, egg rolls, egg substitute and egg powder out of the plain-egg
// rescue. Applied to ALL candidates — over-long deny-lists breed false negatives,
// so this stays short and documented.
const USDA_DENY_SUBSTRINGS: readonly string[] = [
  "canned",
  "in syrup",
  "cured",
  "smoked",
  "pickled",
  "sauce",
  "breaded",
  "fried",
  "creamed",
  "cheese",
  "tofu",
  "nog",
  "roll",
  "substitute",
  "powder",
];

// The targeted egg include (§4c): a plain egg is an iconic NOVA-1 food but lives
// in the excluded Dairy-and-Egg group, so it is rescued by a name head match
// (`Egg,` / `Eggs,`) rather than by category. The deny guard above still applies,
// keeping egg-nog / -roll / -substitute / -powder out.
const USDA_EGG_HEAD = /^eggs?,/i;

/**
 * USDA's own description for a bundled food, or undefined for every other twin
 * AND for an `fdc:` payload that does not carry the record it came from.
 *
 * The inference below is a claim about the food USDA described, so it has to read
 * USDA's words. It cannot read `food/name`: that is a DISPLAY name, and a
 * vocabulary-expanded search widens it with the word that reached the food
 * (ADR-0049's #140 Amendment). Nineteen of the 433 keys carry one of the
 * deny-substrings below, so `Ginger, ground` displayed as
 * "Ginger, ground, ginger powder" would lose its NOVA 1 to its own alias.
 *
 * Undefined means NO INFERENCE, never a looser one. Falling back to the display
 * name would reinstate exactly that miscall, and falling back to an empty string
 * would be worse still — it skips the deny-substring guard altogether while the
 * category allow-list happily passes. A twin without its source record is one we
 * cannot judge, and "not rated" is the neutral, never-a-warning answer ADR-0041
 * §2 reserves for that. `seedRowFromRef`'s placeholder for a dangling recipe
 * reference is the payload that reaches here without one.
 *
 * Every real `fdc:` twin carries the blob — `mapIndexRowToPayload` writes it
 * (ADR-0047 §7) and so did the retired `mapFdcFoodToPayload`, which spells the
 * field the same way — so the one `?` is on the envelope, which can genuinely be
 * absent, and not on the description, which cannot.
 */
function usdaDescriptionOf(food: EntityPayload): string | undefined {
  if (!food.entity.startsWith("fdc:")) return undefined;
  const provenance = food.attributes["provenance/raw"] as
    | RawProvenance<{ description: string }>
    | undefined;
  return provenance?.raw_data.description;
}

/**
 * Reads a food twin's NOVA verdict back off its captured `food/assessment`
 * (ADR-0041 §4). Two branches, in order:
 *
 * 1. **OFF** — an assessment carrying a NOVA group in 1–4 yields an authoritative
 *    `off` verdict, gathering its evidence (the flagged additives and the
 *    `nova_group_debug` trail, each included only where present). Runs first, so
 *    an OFF rating always wins.
 * 2. **inferred** — a basic USDA whole food (`fdc:*` entity, allow-listed
 *    `food/category` or a plain egg, no NOVA-3 deny-substring in its name) yields
 *    an inferred NOVA 1. See the gate constants above (§89 rule).
 *
 * Everything else — a blank/absent assessment, a non-OFF non-inferable food —
 * yields `not-rated`.
 *
 * Accepts the food twin as an {@link EntityPayload} (the shape the food-twin
 * selectors read, e.g. `mapPayloadToFoodResult`), so the `inferred` branch can
 * reach the `fdc:` entity id and `food/category` from the same value.
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
  // The inferred NOVA-1 branch for basic USDA whole foods (rule → #89). Runs only
  // AFTER the OFF branch, so an OFF-authoritative rating always wins. Guarded on
  // three fronts (all must hold): a USDA record we can read the description of,
  // an allow-listed whole-food category OR a plain egg, and no NOVA-3
  // deny-substring in that description.
  const description = usdaDescriptionOf(food);
  if (description !== undefined) {
    const category = food.attributes["food/category"] as string | undefined;
    const lowerName = description.toLowerCase();
    const categoryAllowed =
      (category != null && USDA_WHOLE_FOOD_CATEGORIES.has(category)) ||
      USDA_EGG_HEAD.test(description);
    const denied = USDA_DENY_SUBSTRINGS.some((sub) => lowerName.includes(sub));
    if (categoryAllowed && !denied) {
      return { state: "rated", tier: 1, source: "inferred" };
    }
  }

  return { state: "not-rated" };
}
