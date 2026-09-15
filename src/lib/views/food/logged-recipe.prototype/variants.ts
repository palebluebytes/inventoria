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
 * So: **what should a logged recipe look like in the day, and where does
 * editing one happen?** Three shapes, `?variant=` on the real /food/ screen:
 *
 *   A  the card unfolds        the row keeps its place and grows downward; the
 *                              frozen rows become editable lines inside it.
 *   B  the recipe is a group   no fold by default — the ingredients are logged
 *                              rows, indented under a recipe header, edited the
 *                              way every other row on this screen is edited.
 *   C  expanding takes the meal the meal's list is replaced in place by a full
 *                              editor pane; the day above and below stays put.
 *
 * `now` is what ships today: the row that opens the sheet.
 *
 * **What each one is really claiming.**
 *   A says a logged recipe is a food with more inside it.
 *   B says a logged recipe is a meal inside a meal, and that the app should
 *     have one editing idiom for a logged thing rather than two.
 *   C says the editor needs the room the sheet gave it, and that what the sheet
 *     was actually buying was WIDTH, not a second surface.
 *
 * **Nothing here writes.** Every edit lives in `draft.ts`'s in-memory model and
 * is thrown away on reload; the footer strip under an open editor prints the
 * snapshot that WOULD be appended, because ADR-0022's invariant
 * (`headline == Σrows ÷ yield`) is the part worth watching while you tap. The
 * real commit path (`correctInstantiation`) is deliberately not wired: the
 * question is what this looks like, not whether the ledger works — it already
 * does.
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

export const VARIANTS = ["A", "B", "C", "now"] as const;

export type Variant = (typeof VARIANTS)[number];

export const VARIANT_NAMES: Record<Variant, string> = {
  A: "The card unfolds",
  B: "The recipe is a group",
  C: "Expanding takes the meal",
  now: "The sheet (what ships)",
};

export const VARIANT_NOTES: Record<Variant, string> = {
  A: "One card that grows. The caret is the only new mark; the day flows down around it, and the ingredient lines are editable inside the frame the recipe already had.",
  B: "Open by default, folded on demand. The ingredients ARE logged rows — same Row, same ✕, same tap — under a recipe header that carries the total and the fold.",
  C: "The list steps aside. Tapping the recipe swaps the meal's items for a full-width editor with the sheet's affordances and none of its chrome; Back restores the list.",
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
