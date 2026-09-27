/**
 * How much of the visible band's **top** edge the shell's own chrome occupies,
 * published as a CSS custom property (ADR-0114 §5).
 *
 * It replaces `--shell-floor`, which `Sidebar` published and which went with it.
 * The two are the same idea at opposite edges and neither is a geometry: a
 * surface pinned over the page reads the band from `ui/viewport-inset.ts` and
 * subtracts whatever the shell already holds, so `--vv-top` plus this is where a
 * top-anchored overlay may start without landing behind the pinned header.
 *
 * **Measured, never restated.** The header's height is a tap floor plus two
 * paddings plus a safe-area inset the device picks, and ADR-0089 §2's reason for
 * measuring the old nav is unchanged by which edge it is: a sum of those written
 * anywhere else is the copy that goes stale.
 *
 * **It is written on `<html>` rather than on the shell's own box, and that is
 * forced rather than tidy.** The switcher panel is portalled to the end of
 * `<body>` by bits-ui, so it is not a descendant of the shell and a property set
 * there would not reach it. `ui/viewport-inset.ts` publishes the band the same
 * way and for the same reason; `src/app.css` declares the `0` a shell that never
 * measures one keeps, so a consumer writes a bare `var(--shell-ceiling)` and is
 * correct before any measurement has run.
 */

/** The property both this module and `src/app.css` name. */
export const SHELL_CEILING = "--shell-ceiling";

/**
 * Publish a measured header height, in CSS pixels.
 *
 * A no-op without a document, which is not defensive: both shells are rendered
 * under a stubbed `window` in the unit tier, and `0` is what a shell reports
 * before its header has been laid out — so the pre-measurement value is the
 * stylesheet's declared `0` either way.
 *
 * It takes the number rather than the element, so the measurement stays
 * `bind:offsetHeight` in the component that owns the box and this stays a pure
 * function of it.
 */
export function publishShellCeiling(height: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(SHELL_CEILING, `${height}px`);
}

/**
 * Give the property back to `src/app.css`'s declared `0`.
 *
 * The shell calls this when its header unmounts. Without it a torn-down shell
 * leaves an inline `--shell-ceiling` on `<html>` naming a box that is gone, and
 * the next overlay to open starts that far down a screen with nothing above it.
 */
export function clearShellCeiling(): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.removeProperty(SHELL_CEILING);
}
