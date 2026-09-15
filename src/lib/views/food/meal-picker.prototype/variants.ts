/**
 * THROWAWAY. Branch `prototype/meal-picker-skin`, issue #453.
 *
 * **The question.** The meal chip is `ui/Select` — a native `<select>` — and a
 * native select's list is drawn by the operating system. On the device it opens
 * Android's Material dialog: rounded corners, blue radio buttons, system font,
 * inside an app that is otherwise square corners, hard rules and ink. On iPhone
 * it opens Safari's own menu. Nothing but the `option` colours is stylable, and
 * those are already set.
 *
 * So this is not a CSS question. Matching the app means **replacing the picker
 * for this one control on both platforms**, which reopens ADR-0095 §2 — whose
 * argument was *for* the native control: full-width rows above the tap floor,
 * correct with every assistive technology, on every platform, for zero code.
 * Three shapes, and what each one costs:
 *
 *   A  the plate grows a row   no new surface, no portal; the bar changes height
 *   B  a bottom sheet          an existing primitive; a whole sheet for four words
 *   C  a popover from the chip closest to "the same picker, styled"; a new surface
 *
 * `now` is the native select, for comparison on the same screen.
 *
 * **Judge this one on the phone, not in a desktop window.** The complaint is
 * about a platform dialog, and two of the three answers put a surface exactly
 * where the thumb already is. This branch also carries #452's bottom clearance,
 * so one device sitting answers both of the day's questions.
 *
 * Nothing here ships. The winner gets rewritten into `WayInBar.svelte` properly,
 * and it owes ADR-0095 §2 an amendment stating what the look cost in
 * accessibility — plus, for C, an ADR-0100 argument for a new surface shape.
 */

export const VARIANTS = ["A", "B", "C", "now"] as const;

export type Variant = (typeof VARIANTS)[number];

export const VARIANT_NAMES: Record<Variant, string> = {
  A: "The plate grows a row",
  B: "A bottom sheet",
  C: "A popover from the chip",
  now: "The native picker",
};

export const VARIANT_NOTES: Record<Variant, string> = {
  A: "Four tiles rise above the marks, on the fold the bar already has. No portal, no second surface; the bar is two rows while you choose.",
  B: "ui/BottomSheet, four rows. The primitive already handles the band, the keyboard and the safe area, and it is how every other choice here is made.",
  C: "bits-ui Popover anchored over the chip. The same shape as the thing it replaces, in the app's ink — and a surface shape the app does not otherwise have.",
  now: "Android's Material dialog, Safari's menu. The control that decides where every tap lands, drawn by somebody else.",
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
