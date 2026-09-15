/**
 * THROWAWAY. Branch `prototype/way-in-bar-compact`.
 *
 * **The question.** The shipped Way-in bar (ADR-0101) stands ~150px tall on a
 * 390px phone, which is a fifth of the band, and the user's reading is that
 * almost all of it is chrome rather than control. The sum, measured on the
 * shipped rules:
 *
 *   2     `.way-in-bar` border-top
 *   9.7   its `--space-2xs` top padding
 *   61.6  the groove: 48 tab + two `--space-3xs` paddings + two 2px borders
 *   4.8   `--space-3xs`, the gap between groove and rail
 *   62    a rail cell: 48 floor + 0.75rem for the caption + 2px shadow reach
 *   9.7   its `--space-2xs` bottom padding
 *   ----
 *   ~150  plus `env(safe-area-inset-bottom)`
 *
 * Of that, 96px is control (two 48px rows) and ~54px is chrome. **The floor is
 * not negotiable** — ADR-0093/0098 put every control at `--tap-min`, and
 * `tap-floor.test.ts` proves it — so compactness is not a question of shrinking
 * anything. It is a question of two numbers only: **how many 48px ROWS the bar
 * has, and how much chrome sits between and around them.** That is the axis all
 * three variants below disagree along.
 *
 * Every variant also does the two things the ask names outright: the captions
 * come off the door cells (the mark alone, ADR-0059 §5's marks doing the work
 * `wayInCaption` was invented for), and the rules are BALANCED — one weight for
 * every edge in the block, internal and outer alike, drawn as gaps over an ink
 * ground so nothing is ever a doubled 4px seam.
 *
 * ── MEASURED, in Chrome at a 500px viewport (2026-09-15) ──────────────────
 *
 *   now  154.1px   the groove alone is 62.4 of it
 *   A    100.0px   −35%
 *   B     50.0px   −68%
 *   C     50.0px at the foot — but 52.0 more at the head, and 20.8 of margin
 *                 under it. **102px of band in total, 2px MORE than A.**
 *
 * That last line is the one reading could not have produced, and it is close to
 * fatal for C: the split does not save band, it moves 52px of it from the thumb
 * end to the head, where the week strip and the date already are. What C buys
 * is a thin bar under the hand; what it pays is the same screen budget plus an
 * eye that has to travel the whole page to read its own target.
 *
 * **And B has a width floor.** Its row is a 104.4px chip (the select sizes to
 * "BREAKFAST", its widest option) plus five floored doors plus five 2px seams =
 * 354.4px, so at 320px the plate's `scrollWidth` is 354 against a 320 box and
 * the Search mark hangs 34.4px off the screen. It fits a 360px phone to the
 * pixel (360/360) and everything above. The failure is intermittent rather than
 * flat, because the fifth door is `past` and ADR-0059 §4 only adds it once the
 * meal HAS a past: a 320px phone is fine until the day it is not.
 *
 * Nothing here ships. The winner gets rewritten into `WayInBar.svelte` and
 * `WayInRail.svelte` properly, and the rest stays on this branch.
 */

export const VARIANTS = ["A", "B", "C", "now"] as const;

export type Variant = (typeof VARIANTS)[number];

/** What the switcher bar prints beside the key. */
export const VARIANT_NAMES: Record<Variant, string> = {
  A: "Fused plate — two rows, one block",
  B: "One line — the meal collapses to a chip",
  C: "Split ends — meal at the head, doors at the foot",
  now: "Shipped — ADR-0101 as built",
};

/** A one-line note under the name, so each variant's bill is on screen too. */
export const VARIANT_NOTES: Record<Variant, string> = {
  A: "100px measured, against 154 shipped. Zero outer padding; every rule 2px, drawn as gaps over ink. All nine controls one tap away.",
  B: "50px. One row: a meal chip plus five marks. Costs a second tap, and overflows a 320px phone once the meal has a past.",
  C: "50px at the foot — but 52 more at the head, so 102px of band in total. Moves the space rather than saving it.",
  now: "154px measured. Two 48px rows and 54px of chrome, with the captions.",
};

function isVariant(v: string | null): v is Variant {
  return v !== null && (VARIANTS as readonly string[]).includes(v);
}

/**
 * The variant this page is showing. `null` outside DEV and outside a browser,
 * so a stray merge cannot ship any of this: every call site is behind a
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
