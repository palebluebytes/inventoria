import type { ConsumptionEvent } from "./consumption-state";
import { stemOf, wordsOf } from "./reference-food-ranking";

/**
 * Finding a food you have already logged by typing its name (#320).
 *
 * The hole this closes, stated by `recent-foods.ts` without noticing it was one:
 *
 * > everything else is reached by typing into the search box already on screen
 *
 * True of USDA foods. False of yours. A scanned product or a hand-typed panel
 * was reachable from one meal's Recent list until twelve newer foods pushed it
 * out, and after that only by scrolling to the day it was logged. Typing its
 * name found nothing, because search read the corpus and Open Food Facts and
 * never the ledger.
 *
 * **This is not OFF text search**, which the #186 map ruled out of scope and
 * which stays out: nothing here reaches the network, and a product that has
 * never been scanned on this device is not findable. The population is the foods
 * already in your own ledger, which is a different table with a different
 * argument — you put them there.
 *
 * **A `fdc:` twin is deliberately excluded.** A USDA food you have logged is
 * already in the corpus under the same entity, so admitting it here would show
 * the same food twice, once with a shipped name and once with whatever name was
 * frozen into the log. It still gets its due: the ranking's frecency keys lift
 * it where it sits, in the corpus results (#165).
 */

/** One food the ledger holds, ready to be matched against what was typed. */
export interface LedgerFood {
  /** The entity the food was logged against — `gtin:`, a local twin, a recipe. */
  target: string;
  /** The name it was logged under, latest wins. */
  name: string;
  /** When it was last logged, so a caller can order without a second fold. */
  time: number;
}

/**
 * Every distinct food in the ledger that the corpus does not already carry,
 * newest first.
 *
 * The name is the one frozen into the LOG rather than fetched from the twin, and
 * that is a deliberate departure from how Recent resolves a candidate. Recent
 * fetches the twin because it needs the panel to stage the food; this needs only
 * a name to match against, and fetching 400 twins to answer a keystroke is I/O a
 * fold must not do (`CODING_STANDARDS.md` §2.1). The cost of reading the frozen
 * name is that a food renamed after it was logged answers to the old name until
 * it is logged again — acceptable, because the old name is what the person who
 * typed it will type.
 *
 * Retracted events are skipped: an undone log is not a food you have.
 */
export function ledgerFoodsFromEvents(
  events: readonly ConsumptionEvent[]
): LedgerFood[] {
  const seen = new Set<string>();
  const foods: LedgerFood[] = [];
  for (const event of [...events].sort((a, b) => b.time - a.time)) {
    const target = event.target;
    if (!target || event.status === "retracted") continue;
    if (target.startsWith("fdc:")) continue;
    if (seen.has(target)) continue;
    const name = event.foodName?.trim();
    if (!name) continue;
    seen.add(target);
    foods.push({ target, name, time: event.time });
  }
  return foods;
}

/**
 * Whether a typed phrase reaches this food's name.
 *
 * Every typed word must land, the same demand the reference-food search makes:
 * a query is a conjunction, so `oat granola` may not match a granola with no oats
 * in its name. A word lands when it starts some word of the name or shares its
 * stem, which is `curatedMatches`' partial tier and is deliberately
 * POSITION-FREE — a product name is not `Food, qualifier` shaped, so there is no
 * head phrase to be nearer or further from, and asking for one would rank
 * "Nocciolata cocoa spread" against a grammar it does not have.
 *
 * Tokenised with `wordsOf`/`stemOf` and never with a regex of its own. Two paths
 * reading one typed query must not disagree about what was typed — the defect
 * #136 fixed, where a typed hyphen produced a token no word could equal.
 */
const reaches = (name: string, phrase: string): boolean => {
  const typed = wordsOf(phrase.toLowerCase());
  if (typed.length === 0) return false;
  const words = wordsOf(name.toLowerCase());
  return typed.every((token) =>
    words.some(
      (word) => word.startsWith(token) || stemOf(word) === stemOf(token)
    )
  );
};

/**
 * The ledger foods any of `phrases` reaches, in the order given.
 *
 * PHRASES rather than one query, for ADR-0049 §6's reason: the reference-food
 * search hands its callers what was typed plus the vocabulary's expansions of
 * it, and two tables reading one typed query must see the same phrases. So
 * `aubergine` reaches a hand-typed aubergine twin on the same expansion that
 * reaches the corpus row.
 *
 * Ordering is the caller's. This says which foods answer, never which answers
 * best, because the key that decides that is frecency and it belongs to the
 * caller that holds the ledger.
 */
export function matchLedgerFoods(
  foods: readonly LedgerFood[],
  phrases: readonly string[]
): LedgerFood[] {
  return foods.filter((food) =>
    phrases.some((phrase) => reaches(food.name, phrase))
  );
}
