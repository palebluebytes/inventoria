import type { FoodResult } from "./food-search";

/**
 * Which row of a list of food candidates, if any, is entitled to be crowned
 * (ADR-0090 §4).
 *
 * The record's subject is display, never ranking: `SEARCH_RESULT_LIMIT` is
 * still what a search returns and `compareRelevance`'s ten keys still decide
 * the order (ADR-0055). What is decided here is whether the list is entitled to
 * claim an order at all.
 *
 * It is a module rather than two lines in the view because the rule is about
 * the *kind* of list — and the view had been unable to tell its two kinds
 * apart, which is the whole of the defect ADR-0090 was written against.
 */

/** One rendered candidate, and where it placed. */
export interface SearchListRow {
  food: FoodResult;
  /**
   * Its place in the ranking, best first, or **null** in a list that ranks
   * nothing. Absent rather than zero-and-ignored, so no view can paint a rank
   * mark over a chronology by mistake — which is exactly what happened.
   */
  rank: number | null;
}

/**
 * The rows to render, in the order they were given.
 *
 * `ranked` is the distinction the app never drew. The search branch is a
 * relevance sort; the Recent branch is `b.time - a.time`, a chronology whose
 * newest entry won nothing (ADR-0057). A chronology gets no rank, so the marks
 * §2 defines have nothing to attach to there.
 *
 * **Nothing is held back.** §5 originally cut a ranking to six rows and counted
 * the rest; that cap was withdrawn before this branch merged, because it made
 * the weak end of a ranking unreachable rather than merely far — see the record's
 * 2026-09-03 Amendment. Every candidate the search returns is rendered, and the
 * worst of them are reached the way Spotlight's are: by scrolling.
 */
export function searchList(
  foods: readonly FoodResult[],
  ranked: boolean
): SearchListRow[] {
  return foods.map((food, index) => ({
    food,
    rank: ranked ? index : null,
  }));
}
