import type { AllergenVerdict } from "./off-signals";

/**
 * The allergen safety block's render-layer view model (ADR-0043 §3, #104). The
 * static block below the quantity row is a dumb renderer of the already-ordered
 * {@link AllergenVerdict} — `deriveAllergenVerdict` has imposed the Contains ›
 * May-contain › Free-from precedence, the `no-gluten` de-dup, and returns `en:`
 * tags (never display names). This helper adds the ONE display decision the ADR
 * and #101's author left to the render layer, so the pure selector stays
 * untouched:
 *
 * - **Narrow the Free-from line to declared allergen free-from claims.** OFF's
 *   `labels_tags` carries non-allergen `en:no-*` claims too (`en:no-added-sugar`,
 *   `en:no-preservatives`, …). Those are not allergen statements, so they'd be
 *   noise in a safety block; they're dropped here at display time (the selector's
 *   all-`en:no-*` list is intentionally left as-is). Contains / May-contain are
 *   never narrowed — a positively-present allergen is always surfaced.
 *
 * Still returns `en:` tags; the component resolves them to human names via the
 * taxonomy resolver (`resolveTag`). Pure and table-testable, mirroring
 * `dietaryTagsView`. NEVER synthesises a claim from absence: if narrowing leaves
 * all three lists empty, the block degrades to `"absent"` (silent), never a bare
 * header (research/95 §6).
 */

/**
 * The declared **allergen** free-from claims we surface on the Free-from line —
 * OFF `en:no-<allergen>` labels for the EU-14 allergens (plus the common
 * `en:no-lactose` / `en:no-soy` / `en:no-sesame` variants). Any other `en:no-*`
 * label (non-allergen claims like added sugar or preservatives) is filtered out.
 * Under-showing a real claim here is safe — Free-from is positive reassurance, so
 * a dropped claim just means no reassurance, never a false all-clear.
 */
const ALLERGEN_FREE_FROM: ReadonlySet<string> = new Set([
  "en:no-gluten",
  "en:no-milk",
  "en:no-lactose",
  "en:no-eggs",
  "en:no-nuts",
  "en:no-peanuts",
  "en:no-soybeans",
  "en:no-soy",
  "en:no-sesame-seeds",
  "en:no-sesame",
  "en:no-celery",
  "en:no-mustard",
  "en:no-lupin",
  "en:no-fish",
  "en:no-crustaceans",
  "en:no-molluscs",
  "en:no-sulphur-dioxide-and-sulphites",
  "en:no-sulphites",
]);

/**
 * The render-ready allergen block, computed from a {@link AllergenVerdict}. Two
 * faces mirror the verdict's, but the "present" face reflects the Free-from
 * narrowing above:
 *
 * - **present** — at least one of the three precedence-ordered `en:` tag lists
 *   carries data after narrowing.
 * - **absent** — no positively-present allergen/traces and no declared allergen
 *   free-from claim; the block renders nothing (silent, never "not rated").
 */
export type AllergenBlockView =
  | {
      state: "present";
      contains: string[];
      mayContain: string[];
      freeFrom: string[];
    }
  | { state: "absent" };

/**
 * Map an {@link AllergenVerdict} to its render-ready block view (ADR-0043 §3).
 * Contains and May-contain pass through in the selector's order; Free-from is
 * narrowed to declared allergen claims (see {@link ALLERGEN_FREE_FROM}). If
 * narrowing empties every line, the block degrades to `"absent"` — never
 * synthesised from an empty allergens list.
 */
export function allergenBlockView(verdict: AllergenVerdict): AllergenBlockView {
  if (verdict.state !== "present") return { state: "absent" };

  const freeFrom = verdict.freeFrom.filter((tag) =>
    ALLERGEN_FREE_FROM.has(tag)
  );

  if (
    verdict.contains.length === 0 &&
    verdict.mayContain.length === 0 &&
    freeFrom.length === 0
  ) {
    return { state: "absent" };
  }

  return {
    state: "present",
    contains: verdict.contains,
    mayContain: verdict.mayContain,
    freeFrom,
  };
}
