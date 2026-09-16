/**
 * THROWAWAY. Branch `prototype/logged-recipe-inline`.
 *
 * **The question.** A logged recipe is a Recipe Instantiation — a frozen
 * snapshot of five or ten ingredients and what each contributed (ADR-0022) —
 * and the day draws it as a single `FoodItemRow`, indistinguishable from a
 * banana. Everything it actually records is behind a tap that opens
 * `InstantiationSheet`: a full bottom sheet over the day, the recipe re-seeded
 * against each ref's current twin, a docked "Log" that retract-and-replaces.
 * Changing 60 g of avocado to 80 g costs the whole day's screen.
 *
 * **Round one** offered three shapes: the card grows into an editor (A), the
 * recipe becomes a group header over ordinary logged rows (B), the meal's list
 * steps aside for a full pane (C). The verdict was B's arrangement — a parent
 * with its ingredients under it — but **not B's parent**: a recipe is an entry
 * on the day and has to keep looking like one, rather than turning into a
 * heading when it is the only row in a meal.
 *
 * **Round two's guide, therefore, and all three obey it:** the recipe's own row
 * stays the app's `FoodItemRow logged` — same card, same ✕, same two lines —
 * and its ingredients are indented slightly underneath. What is left to decide
 * is the pair of questions the guide does not settle:
 *
 *   • **Where is the children's box?** Inside the parent's frame, or their own
 *     frames beside it, or no frame at all?
 *   • **How is a child edited?** In place on the line, through the app's amount
 *     picker, or by every line being a field the moment the recipe is open?
 *
 *   D  one card               children are LINES inside the parent's frame; the
 *                             card loses its bottom edge and they sit in it. Tap
 *                             a line → a field in place, ✓ writes.
 *   E  a list within the list children are the same `FoodItemRow logged`, a card
 *                             each, inset one step. Tap → the app's amount
 *                             picker, Done writes. Open by default.
 *   F  hanging from the parent children are lines on a rule dropped from the
 *                             parent's left edge, and every amount is already a
 *                             field. One Save at the foot, for the whole set.
 *                             **This is the one that was chosen**, then
 *                             tightened: no per-row kcal, and a smaller amount
 *                             box — an open recipe is where an amount is fixed,
 *                             not a second nutrition panel.
 *
 * `B` is round one's group header, kept for contrast — the arrangement that was
 * close with the parent that was not. `now` is what ships.
 *
 * **Nothing here writes.** Every edit lives in `draft.ts`'s in-memory model and
 * is thrown away on reload; the footer strip under an open recipe prints the
 * snapshot that WOULD be appended, because ADR-0022's invariant
 * (`headline == Σrows ÷ yield`) is the part worth watching while you tap. The
 * real commit path (`correctInstantiation`) is deliberately not wired: the
 * question is what this looks like, not whether the ledger works — it already
 * does.
 *
 * **What the three really disagree about** is how many ledger writes a
 * correction costs. D and E write per line, which is what the day's own amount
 * picker does; F batches the set behind one Save, which is what the sheet does
 * today. Every one of those writes is a retract-and-replace, so the choice is
 * visible in the strip under each open recipe.
 *
 * **The day may have no logged recipe on it.** When it doesn't, `draft.ts`
 * injects one demo instantiation into lunch so there is always something to
 * judge. It is marked on screen and it never reaches the ledger.
 *
 * Neighbouring tickets: #424 (every instantiation's row reads "1 serving", and
 * a logged recipe routes past the amount sheet) and #428/#432 (what a recipe
 * occasion weighs). A winner here does not settle either, but all three are
 * arguments about the same row.
 */

export const VARIANTS = ["D", "E", "F", "B", "now"] as const;

export type Variant = (typeof VARIANTS)[number];

export const VARIANT_NAMES: Record<Variant, string> = {
  D: "One card",
  E: "A list within the list",
  F: "Hanging from the parent",
  B: "Round one's group header",
  now: "The sheet (what ships)",
};

export const VARIANT_NOTES: Record<Variant, string> = {
  D: "The children are lines INSIDE the parent's frame — one card, one ✕, one place in the list. Tap a line and its amount becomes a field in place; ✓ writes.",
  E: "The children are the same logged card, one size down, inset a step. Tapping one opens the app's amount picker, exactly as a banana does. Open by default.",
  F: "Chosen. Lines on a rule dropped from the parent's left edge; every amount is already a field and one Save at the foot commits the set. No per-row kcal — the occasion's figure is on the parent.",
  B: "Round one: the recipe becomes a header line over its rows. The arrangement that was close, with the parent that was not.",
  now: "A bottom sheet over the whole day, re-seeded from the current twins, committing by retract-and-replace.",
};

function isVariant(v: string | null): v is Variant {
  return v !== null && (VARIANTS as readonly string[]).includes(v);
}

/**
 * The variant this page is showing. `null` outside DEV and outside a browser, so
 * a stray merge cannot ship any of this: every call site is behind a
 * `{#if variant}` and Rollup drops the branch.
 */
export function readVariant(): Variant | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("variant");
  return isVariant(v) ? v : null;
}

/** Moves the param without a reload, so a variant is shareable and F5-stable. */
export function setVariant(v: Variant): void {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", v);
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new CustomEvent("prototype-variant", { detail: v }));
}

export function step(current: Variant, by: 1 | -1): Variant {
  const i = VARIANTS.indexOf(current);
  return VARIANTS[(i + by + VARIANTS.length) % VARIANTS.length];
}
