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
 * - **rated / inferred** — the NOVA-1 `· est` slot for basic USDA whole foods,
 *   filled by ticket D (#93) from the USDA category allow-list rule
 *   (`docs/research/89-*`). The app's ONE constrained client-side inference.
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
 * Reads a food twin's NOVA verdict back off its captured `food/assessment`
 * (ADR-0041 §4). Two branches, in order:
 *
 * 1. **OFF** — an assessment carrying a NOVA group in 1–4 yields an authoritative
 *    `off` verdict, gathering its evidence (the flagged additives and the
 *    `nova_group_debug` trail, each included only where present). Runs first, so
 *    an OFF rating always wins.
 * 2. **inferred** — a basic USDA whole food (`fdc:*` entity, allow-listed
 *    `food/category` or a plain egg, no NOVA-3 deny-substring in its name) yields
 *    `NOVA 1 · est`. See the gate constants above (§89 rule).
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
  // The `inferred` NOVA-1 slot for basic USDA whole foods (#93, rule → #89). Runs
  // only AFTER the OFF branch, so an OFF-authoritative rating always wins. Guarded
  // on three fronts (all must hold): an `fdc:` food (⟹ Foundation/SR Legacy by
  // construction of `searchFdc`), an allow-listed whole-food category OR a plain
  // egg, and no NOVA-3 deny-substring in the name.
  if (food.entity.startsWith("fdc:")) {
    const name = (food.attributes["food/name"] as string | undefined) ?? "";
    const category = food.attributes["food/category"] as string | undefined;
    const lowerName = name.toLowerCase();
    const categoryAllowed =
      (category != null && USDA_WHOLE_FOOD_CATEGORIES.has(category)) ||
      USDA_EGG_HEAD.test(name);
    const denied = USDA_DENY_SUBSTRINGS.some((sub) => lowerName.includes(sub));
    if (categoryAllowed && !denied) {
      return { state: "rated", tier: 1, source: "inferred" };
    }
  }

  return { state: "not-rated" };
}
