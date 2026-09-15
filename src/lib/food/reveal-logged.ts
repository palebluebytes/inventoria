/**
 * Where the day has to scroll so that a row you have just logged is on screen —
 * `docs/adr/0107-a-row-you-have-just-logged-is-revealed-in-three-rules.md`,
 * [#440](https://github.com/palebluebytes/inventoria/issues/440).
 *
 * Logging a food writes a row into a long scrolling day with a bar pinned over
 * its foot, and the row can land anywhere: under the bar, below the fold, three
 * meals down. Three rules, in order, and the order is the whole specification —
 *
 * 1. the row is already wholly visible, so **nothing moves**;
 * 2. it is not, but it would be with its meal's heading at the top of the band,
 *    so **the meal goes to the top** and the row arrives in context;
 * 3. neither, so **the row goes to the bottom of the band** — the least travel
 *    that puts it on screen, and it lands where the eye already is, next to the
 *    bar that has the doors on it.
 *
 * Rule 2 is the one that earns the module. Scrolling straight to a new row is
 * the obvious behaviour and it is the wrong one in the common case: a food
 * logged into a meal that is only just off screen would land alone at the foot
 * of the page with its heading and its siblings above the fold, which reads as
 * a new list rather than as a row joining one. Where the whole meal fits, the
 * meal is the thing to show.
 *
 * ## What this module is and is not
 *
 * It is arithmetic over three boxes, in one coordinate space, with no DOM and no
 * clock. The caller measures, calls this, and scrolls by what comes back; every
 * case is then a table rather than a screen someone has to reproduce.
 */

/**
 * A box, on the scroll axis only, in whatever space the caller is working in —
 * viewport coordinates from `getBoundingClientRect()` are the obvious one, and
 * what {@link revealScroll} returns is then a delta to add to `scrollTop`.
 *
 * Both edges, never a height: the arithmetic is about where edges land, and a
 * height plus one edge is the same two numbers with a subtraction waiting to be
 * got wrong.
 */
export interface Span {
  top: number;
  bottom: number;
}

/**
 * How far to scroll — positive is down the page — or `null` for rule 1, which
 * is not a scroll of zero.
 *
 * `null` and `0` are different answers and the difference matters to a caller
 * that animates: a row already on screen must not start a smooth scroll that
 * travels nowhere, because the gesture says "something moved" when nothing did.
 *
 * @param row   the newly logged row
 * @param meal  the meal section the row is in, from the top of its heading
 * @param band  the free part of the scrollport: what is left after whatever is
 *              pinned over it (the Way-in bar) is taken off. Not the viewport,
 *              and not the scroll container's own box — a row that lands under
 *              the pinned bar is exactly what these rules exist to prevent, so
 *              the band has to be the part nothing is standing on.
 */
export function revealScroll(row: Span, meal: Span, band: Span): number | null {
  // Rule 1. **Wholly** visible: a row half under the pinned bar is the case
  // these rules exist for, so partial is not visible. A row taller than the band
  // can never satisfy this, which is why rule 3 below is written to be the
  // answer that always terminates.
  if (row.top >= band.top && row.bottom <= band.bottom) return null;

  // Rule 2. Would it be visible with the meal's heading at the top of the band?
  // Asked as a distance rather than by simulating the scroll: the row's bottom
  // measured from the meal's top is what has to fit in the band, and that
  // quantity is the same before and after any scroll — which is the reason this
  // is arithmetic and not a trial move.
  //
  // The row cannot escape upwards under this move: it is inside its own meal, so
  // its top is at or below the meal's top, which is where the band's top now is.
  if (row.bottom - meal.top <= band.bottom - band.top)
    return meal.top - band.top;

  // Rule 3. The row's bottom edge to the band's bottom edge.
  //
  // A row taller than the whole band lands with its top cut off rather than its
  // bottom, and that is the rule as asked for rather than an oversight: what you
  // have just logged ends with its own figures, and a row that tall is one whose
  // name has wrapped several times above them.
  return row.bottom - band.bottom;
}
