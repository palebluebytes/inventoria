import type { EntityPayload } from "../ingestion/ingest";
import type { FoodAssessment } from "./open-food-facts";

/**
 * The OFF assessment read-back selectors (ADR-0043 §4) — the second and third
 * readers of the write-only `food/assessment` blob, after the NOVA badge's
 * `deriveNovaVerdict` (ADR-0041) whose shape they mirror. Both are PURE and
 * table-testable; the dietary tags row (#103) and the allergen safety block
 * (#104) consume their output.
 *
 * Two hard rules the ADR bakes in here, so the UI is a dumb renderer:
 *
 * - **present-only / silent-on-empty** — each returns an `"absent"` value (NOT a
 *   "not-rated" chip) when OFF carries no data. The signals are sparse and
 *   positive-only; the block simply does not render (ADR-0043 §3).
 * - both return **`en:` tags**, never display names — resolving a tag to a human
 *   name is the taxonomy resolver's job (`off-taxonomy.ts`), kept out so these
 *   stay pure and synchronous (ADR-0043 §4).
 */

// ---------------------------------------------------------------------------
// Dietary verdict — vegan / vegetarian / organic (ADR-0043 §2)
// ---------------------------------------------------------------------------

/**
 * A food's dietary-labels verdict, computed on read. Two faces:
 *
 * - **present** — one or more recognised dietary claims, as an ORDERED `en:` tag
 *   list (canonical order: vegan, vegetarian, organic), plus the additives count
 *   the NOVA tag's circular disc renders (ADR-0043 §2).
 * - **absent** — OFF declared no dietary label. Rendered silent — NO "not rated"
 *   chip (ADR-0043 §3). `additivesCount` still rides along (it drives a mark on
 *   the NOVA tag, which has its own presence).
 *
 * NB: **gluten-free is deliberately NOT a dietary tag here.** Its only OFF source
 * is `en:no-gluten` (research/95 §5 — `en:gluten-free` does not exist), which is
 * de-duped onto the allergen block's Free-from line (ADR-0043 §3); see
 * {@link deriveAllergenVerdict}.
 */
export type DietaryVerdict =
  | { state: "present"; tags: string[]; additivesCount: number }
  | { state: "absent"; additivesCount: number };

// The dietary claims we surface as tags, in canonical render order (ADR-0043 §2).
// `en:no-gluten` is intentionally absent — it belongs to the allergen Free-from
// line, not here (the de-dup). `en:vegetarian` is dropped when `en:vegan` is
// present (vegan ⟹ vegetarian) below.
const DIETARY_TAG_ORDER: readonly string[] = [
  "en:vegan",
  "en:vegetarian",
  "en:organic",
];

/**
 * Reads a food twin's dietary verdict off its captured `food/assessment.labels`
 * (ADR-0043 §4). Present-only: recognises `en:vegan` / `en:vegetarian` /
 * `en:organic`, ordered canonically, with **`vegan ⟹ suppress vegetarian`** baked
 * in (a vegan food is trivially vegetarian, so the redundant pair is dropped).
 * Carries the additives count (`assessment.additives.length`) for the NOVA tag's
 * disc. Returns `"absent"` — silent, never "not rated" — when no recognised
 * dietary label is present.
 */
export function deriveDietaryVerdict(food: EntityPayload): DietaryVerdict {
  const assessment = food.attributes["food/assessment"] as
    | FoodAssessment
    | undefined;
  const additivesCount = assessment?.additives?.length ?? 0;
  const labels = new Set(assessment?.labels ?? []);

  let tags = DIETARY_TAG_ORDER.filter((tag) => labels.has(tag));
  // vegan ⟹ suppress vegetarian: a vegan food is trivially vegetarian, so drop
  // the redundant vegetarian tag rather than showing the pair (ADR-0043 §4).
  if (tags.includes("en:vegan")) {
    tags = tags.filter((tag) => tag !== "en:vegetarian");
  }

  if (tags.length === 0) return { state: "absent", additivesCount };
  return { state: "present", tags, additivesCount };
}

// ---------------------------------------------------------------------------
// Allergen verdict — a present-only safety structure (ADR-0043 §3)
// ---------------------------------------------------------------------------

/**
 * A food's allergen safety verdict, computed on read. Two faces:
 *
 * - **present** — three ORDERED, precedence-ranked `en:` tag lists:
 *   `contains` (present allergens) › `mayContain` (cross-contamination /
 *   traces) › `freeFrom` (declared free-from claims). Any face may be empty as
 *   long as at least one carries data.
 * - **absent** — OFF carries no allergen / traces / free-from data at all, so the
 *   safety block renders silent (ADR-0043 §3). NEVER inferred from an empty
 *   `allergens_tags` — that means "none found in the parsed ingredients", not
 *   "allergen-free" (research/95 §6).
 */
export type AllergenVerdict =
  | {
      state: "present";
      contains: string[];
      mayContain: string[];
      freeFrom: string[];
    }
  | { state: "absent" };

/**
 * Reads a food twin's allergen verdict off its captured `food/assessment`
 * (ADR-0043 §3). Assembles three precedence-ordered `en:` tag lists:
 *
 * 1. **Contains** — `assessment.allergens` (present allergens).
 * 2. **May contain** — `assessment.traces` (cross-contamination; a DISTINCT list,
 *    adapter v7), minus any tag already in Contains (precedence de-dup — a
 *    positively-present allergen never also reads "may contain").
 * 3. **Free from** — the `en:no-*` claims from `assessment.labels` (e.g.
 *    `en:no-gluten`), the ONLY honest source of a free-from statement; never
 *    synthesised from an empty allergens list.
 *
 * `en:no-gluten` lives ONLY here (de-duped out of the dietary gluten-free tag,
 * ADR-0043 §3 / {@link deriveDietaryVerdict}). Returns `"absent"` — silent — when
 * none of the three sources carry data.
 */
export function deriveAllergenVerdict(food: EntityPayload): AllergenVerdict {
  const assessment = food.attributes["food/assessment"] as
    | FoodAssessment
    | undefined;

  const contains = assessment?.allergens ?? [];
  const containsSet = new Set(contains);
  // Precedence: a tag already in Contains outranks a "may contain" — drop it from
  // the traces line so an allergen is never shown twice (Contains › May-contain).
  const mayContain = (assessment?.traces ?? []).filter(
    (tag) => !containsSet.has(tag)
  );
  // Free-from is declared claims ONLY — the `en:no-*` labels; never inferred from
  // an empty allergens list (research/95 §6). This is where `en:no-gluten` lives.
  // NB: the ADR/ticket scope this line as ALL `en:no-*` labels; OFF also carries
  // non-allergen `en:no-*` claims (e.g. en:no-added-sugar), so #104 (the safety
  // block renderer) may choose to narrow this to allergen claims at display time.
  const freeFrom = (assessment?.labels ?? []).filter((tag) =>
    tag.startsWith("en:no-")
  );

  if (
    contains.length === 0 &&
    mayContain.length === 0 &&
    freeFrom.length === 0
  ) {
    return { state: "absent" };
  }
  return { state: "present", contains, mayContain, freeFrom };
}
