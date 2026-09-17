/**
 * THROWAWAY. Branch `prototype/244-estimate-beside-measurement`.
 *
 * #244 asks what an estimate looks like sitting next to a measurement, on two
 * surfaces: a food's panel, and the day's meter. "Alongside, never mixed" is a
 * claim about a screen, so three structurally different answers are drawn
 * against four real pairings and looked at.
 *
 * The three disagree about **where the seam goes**:
 *
 * - **A — two columns.** The panel splits. One column is what the pack printed,
 *   one is what the reference food says. Every nutrient is one row across both.
 *   It is the only variant that shows a CONTESTED row, so it is the one that
 *   answers #244's "is the silence honest or suspicious" question: on maple
 *   syrup the label prints sodium 0 and the reference reports 12 mg, and here
 *   you see both.
 * - **B — a block below the rule.** The shipped panel is untouched, byte for
 *   byte. Underneath it, a separate bordered block with its own head naming the
 *   reference food, holding only the rows the label is silent on. This is
 *   #240's rule rendered literally: annotate, never fill.
 * - **C — one list, marked.** One panel, one list, the app's existing
 *   single-column breakdown shape. Reference rows sit in normal nutrient order
 *   beside measured ones, separated only by a mark. The most compact, and the
 *   one that stakes everything on a mark being enough.
 *
 * Each carries its own meter treatment, because the seam has to survive the
 * shrink from a panel row to a 6px bar:
 *
 * - A — one track, two segments: measured solid, estimated hatched.
 * - B — two tracks stacked, the estimate its own thinner bar with its own read.
 * - C — one track, one fill, the estimate drawn as an outlined extension.
 *
 * Nothing here ships. The winner gets rewritten properly; the rest stays here.
 */

export const VARIANTS = ["A", "B", "C", "now"] as const;

export type Variant = (typeof VARIANTS)[number];

export const VARIANT_NAMES: Record<Variant, string> = {
  A: "Two columns — label | reference",
  B: "A block below the rule",
  C: "One list, marked",
  now: "Shipped — no pairing at all",
};

export const VARIANT_NOTES: Record<Variant, string> = {
  A: "The only one that shows a contested row. Meter: one track, two segments.",
  B: "#240's rule drawn literally; the shipped panel is untouched. Meter: two tracks.",
  C: "Reference rows in nutrient order, told apart by a mark. Meter: one track, outlined extension.",
  now: "What a packaged food's panel and the day's meters read today.",
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
  const params = new URLSearchParams(window.location.search);
  if (!params.has("pairing")) return null;
  const v = params.get("pairing");
  return isVariant(v) ? v : "A";
}

/** The food the panel is showing — the prototype has four subjects, not one. */
export function readSubject(): string {
  if (typeof window === "undefined") return "kefir";
  return new URLSearchParams(window.location.search).get("food") ?? "kefir";
}

function push(key: string, value: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new CustomEvent("prototype-variant"));
}

/** Moves the param without a reload, so a variant is shareable and F5-stable. */
export function setVariant(v: Variant): void {
  push("pairing", v);
}

export function setSubject(id: string): void {
  push("food", id);
}

export function step(current: Variant, by: 1 | -1): Variant {
  const i = VARIANTS.indexOf(current);
  return VARIANTS[(i + by + VARIANTS.length) % VARIANTS.length];
}
