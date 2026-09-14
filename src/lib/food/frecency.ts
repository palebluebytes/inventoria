import type { ConsumptionEvent } from "./consumption-state";

/**
 * How recently and how often a food has actually been logged (#165).
 *
 * The ordering key a prediction wants, where recency alone is the key a
 * chronology wants. A breakfast default ordered newest-first offers the sardines
 * logged once yesterday above the banana logged forty times, and #165 is that
 * defect stated as a ticket.
 *
 * **Modelled on `prescient.el`**, the Emacs completion sorter, because its shape
 * is already this codebase's shape. Three things are borrowed and one is
 * deliberately not:
 *
 * - **Two keys, never one blended score.** Prescient sorts by recency, then by
 *   frequency, then by length, and never combines them into a number. That is
 *   `compareRelevance`'s own rule — the keys are ordinal and read in sequence so
 *   an earlier one is never traded against a later one (ADR-0042) — so the two
 *   models compose instead of fighting.
 * - **Exponential decay rather than a window.** A food logged forty times last
 *   year should not outrank one logged five times this week, and a hard window
 *   makes the fortieth log worth exactly as much as the first until the day it
 *   is worth nothing.
 * - **A bounded recency ring.** Past {@link FRECENCY_HISTORY} distinct foods,
 *   recency stops discriminating and frequency takes over. Without the bound,
 *   recency is a total order over every food ever logged and frequency never
 *   gets to speak.
 *
 * **Where the second key is reachable, and where it is not.** {@link
 * Frecency.recent} is a ring position, so over any candidate set drawn entirely
 * from the ring it is injective: no two candidates tie on it, and {@link
 * byFrecency} never reaches `frequent`. That is fine for a corpus search, where
 * almost every row was never logged and ties at 0 — and it is why the meal
 * default, whose candidates are by construction ALL logged, still comes out in
 * pure newest-first order. Prescient does not meet this because its candidate
 * lists are mostly things it has never seen. This surface is different and
 * [#165](https://github.com/palebluebytes/inventoria/issues/165) is open on it;
 * do not read the model below as a claim about what the meal default does.
 *
 * What is NOT borrowed is prescient's **store**. It keeps two hash tables and
 * rewrites them on every selection; this app already has an append-only ledger
 * holding every log with its target and its time, so frecency is DERIVED and
 * there is nothing to persist, nothing to migrate, and no second copy of the
 * truth to drift from the meals themselves. A retraction removes a log from the
 * count by construction, which a counter would have had to remember to do.
 */

/**
 * How many distinct foods the recency ring holds, newest first.
 *
 * `prescient-history-length`'s default, unchanged, and the number is less
 * arbitrary than it looks for this app: at three or four logged foods a day it
 * is about a month of eating, which is the span over which "I have been eating
 * this lately" is a claim worth making.
 */
export const FRECENCY_HISTORY = 100;

/**
 * What one log is multiplied by for each log that follows it.
 *
 * `prescient-frequency-decay`'s default. Prescient applies it to every stored
 * frequency each time a candidate is chosen, so a log k selections ago is worth
 * `decay ** k`; deriving from a history instead, the same weight falls out of
 * raising it to the log's own age. The two are the same model read from opposite
 * ends, which is why this file can drop the store and keep the behaviour.
 *
 * Per LOG, not per day. A month away from the app does not decay anything,
 * because nothing was chosen in between — which is right: your habits are where
 * you left them.
 */
export const FRECENCY_DECAY = 0.997;

/**
 * The weight below which a food is treated as never logged.
 *
 * `prescient-frequency-threshold`'s default. At {@link FRECENCY_DECAY} a single
 * log falls under it after about a thousand later logs, so it is an effective
 * horizon rather than a cliff anybody meets. It exists here for the reason it
 * exists there — to stop a tail of one-off foods from outranking nothing at all
 * on a key that cannot tell them apart.
 */
export const FRECENCY_THRESHOLD = 0.05;

/**
 * One food's standing, as two ordinal keys.
 *
 * Both are larger-is-better and both are 0 for a food never logged, which is the
 * property every caller leans on: over an empty ledger every candidate scores 0,
 * the keys tie uniformly, and the order is exactly what it was without them.
 * That self-gating is what lets these sit high in `compareRelevance` without
 * touching a single measured lead on a device that has logged nothing
 * (ADR-0055 §4).
 */
export interface Frecency {
  /**
   * Position in the recency ring, counted from the far end: {@link
   * FRECENCY_HISTORY} for the food logged most recently, 1 for the oldest food
   * still in the ring, 0 for everything beyond it.
   *
   * Counted in DISTINCT FOODS rather than in logs, so eating the same thing
   * fifty times running does not push everything else out of the ring.
   */
  recent: number;
  /** The decayed log count, or 0 below {@link FRECENCY_THRESHOLD}. */
  frequent: number;
}

/** A food never logged: both keys silent. */
export const NEVER_LOGGED: Frecency = { recent: 0, frequent: 0 };

/**
 * Every food the ledger has logged, keyed by the entity it was logged against.
 *
 * Retracted events are skipped, which is the whole of how an undone log stops
 * counting: the projection is the truth and there is no tally to correct.
 * Events with no target — a manual calorie entry naming no food — contribute
 * nothing and are not an error.
 *
 * One pass over the history after one sort, which is the same cost
 * `recentCandidatesForMeal` already pays beside it. The caller recomputes when
 * the store CHANGES, not on render.
 */
export function frecencyOf(
  events: readonly ConsumptionEvent[]
): Map<string, Frecency> {
  const frequency = new Map<string, number>();
  const order: string[] = [];

  // Newest first, so a log's index IS its age in logs and the decay can be read
  // straight off it.
  const history = [...events]
    .filter((event) => event.status !== "retracted" && event.target)
    .sort((a, b) => b.time - a.time);

  history.forEach((event, age) => {
    const target = event.target as string;
    if (!frequency.has(target)) order.push(target);
    frequency.set(target, (frequency.get(target) ?? 0) + FRECENCY_DECAY ** age);
  });

  const frecency = new Map<string, Frecency>();
  order.forEach((target, at) => {
    const weight = frequency.get(target) ?? 0;
    frecency.set(target, {
      recent: at < FRECENCY_HISTORY ? FRECENCY_HISTORY - at : 0,
      frequent: weight < FRECENCY_THRESHOLD ? 0 : weight,
    });
  });
  return frecency;
}

/**
 * Orders foods best-first on the two keys, recency before frequency.
 *
 * Prescient's order exactly, and the argument for recency winning is the one it
 * does not make in its own README: the food you ate this morning is evidence
 * about today, where the food you ate forty times is evidence about you. When
 * they disagree, today is the better guess at what you are about to type.
 *
 * Generic over the row so the same comparator orders a Recent candidate, a
 * ledger food and anything else that can name its target.
 */
export function byFrecency<T>(
  frecency: ReadonlyMap<string, Frecency>,
  targetOf: (row: T) => string
): (a: T, b: T) => number {
  return (a, b) => {
    const left = frecency.get(targetOf(a)) ?? NEVER_LOGGED;
    const right = frecency.get(targetOf(b)) ?? NEVER_LOGGED;
    return right.recent - left.recent || right.frequent - left.frequent;
  };
}
