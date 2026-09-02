/**
 * The visible band, published as CSS custom properties (ADR-0089 §1).
 *
 * A `position: fixed` element's containing block is the **layout** viewport.
 * When a software keyboard opens, the default `interactive-widget=resizes-visual`
 * shrinks only the **visual** viewport, so the layout viewport — and with it
 * every `vh`, `svh`, `dvh` and `lvh` unit, all four measured inert in that state
 * — keeps naming a box that is now partly behind the keyboard. That is the whole
 * of #326: `BottomSheet` was `bottom: 0; max-height: 85vh`, so it stayed its
 * full height, the browser scrolled the visual viewport to reveal the focused
 * field, and the sheet's header — title, handle, and the way out — left the top
 * of the screen. Since #328 that sheet is a consumer of the three properties
 * below instead.
 *
 * **Do not add `interactive-widget` to either `index.html`.** The one-key fix,
 * `resizes-content`, was refused on the floor platform and on testability;
 * ADR-0089 §1 carries the argument and is the place to reopen it.
 *
 * Three properties on `:root`, rather than a height inside `BottomSheet`, so any
 * surface pinned over the page is a *consumer of one rule* instead of a special
 * case — `SelectionBar` holds a text input in a `position: fixed; bottom: 0` bar
 * with no dialog around it, and needs exactly this and nothing else:
 *
 * - `--vv-h`      the visible band's height
 * - `--vv-top`    its top edge, in fixed-position coordinates
 * - `--vv-bottom` the gap below it — the keyboard, in practice
 *
 * so a full-height surface is `top: var(--vv-top); height: var(--vv-h)`, and a
 * bottom-anchored one is `bottom: var(--vv-bottom)`. `src/app.css` declares all
 * three; what is written here are inline properties on `<html>`, which beat a
 * `:root` rule, so the declarations there are the pre-keyboard defaults and a
 * consumer may write a bare `var(--vv-h)` with no fallback of its own (§3).
 *
 * The shell is **not** a consumer (§4). `.app` stays at `100svh` — the nav is
 * not something you use while typing, and making it chase the keyboard means it
 * competes with every focused field on the page for space.
 */

/** Cleared by the returned disposer; module-level so a double `start` is inert. */
let stop: (() => void) | null = null;

/**
 * Begin publishing the visible band. Idempotent, and a no-op without a DOM —
 * both shells are server-rendered under a stubbed `window` in the unit tier, so
 * this must survive being reached there.
 *
 * **There is one band, and one disposer.** A second caller is handed the first
 * caller's, so calling it stops publishing for everybody — which is why the app
 * drops it rather than tying it to a screen's lifecycle. The band belongs to the
 * document and dies with it. The disposer exists so a test can undo a start.
 */
export function startViewportInset(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }
  if (stop) return stop;

  const root = document.documentElement;
  const vv = window.visualViewport;

  const publish = () => {
    // `documentElement.clientHeight`, never `window.innerHeight` (§1). They are
    // not the same number on a phone: `innerHeight` reports the **large**
    // viewport — the height the page would have with the URL bar collapsed —
    // while `position: fixed` resolves `bottom` against the layout viewport,
    // which is `clientHeight`. With the URL bar showing, `innerHeight`
    // over-counts by its height, and a sheet anchored on that number stops
    // short of the keyboard by exactly that much, leaving a band of dimmed page
    // below it.
    const layout = root.clientHeight;

    // Without the API — no browser this app targets, but the fallback keeps the
    // properties defined so no consumer has to carry a second code path — the
    // layout viewport *is* the visible band, which is the pre-keyboard truth.
    const height = vv ? vv.height : layout;
    const top = vv ? vv.offsetTop : 0;
    // Clamped, and the direction matters: a browser that under-reports the band
    // must make a surface too short, never push one off the screen. That is the
    // failure mode measured on Vivaldi for Android and recorded in the
    // Consequences.
    const bottom = Math.max(0, layout - top - height);

    root.style.setProperty("--vv-h", `${height}px`);
    root.style.setProperty("--vv-top", `${top}px`);
    root.style.setProperty("--vv-bottom", `${bottom}px`);
  };

  publish();

  if (!vv) {
    // `resize` alone: with no visual viewport, nothing else can move the band.
    window.addEventListener("resize", publish);
    stop = () => {
      window.removeEventListener("resize", publish);
      stop = null;
    };
    return stop;
  }

  // `scroll` matters as much as `resize` (§1): the browser scrolls the visual
  // viewport to reveal a focused field, which moves `offsetTop` without changing
  // `height`. A listener reading only `resize` leaves a full-height surface
  // correctly sized and in the wrong place.
  vv.addEventListener("resize", publish);
  vv.addEventListener("scroll", publish);
  window.addEventListener("orientationchange", publish);

  stop = () => {
    vv.removeEventListener("resize", publish);
    vv.removeEventListener("scroll", publish);
    window.removeEventListener("orientationchange", publish);
    stop = null;
  };
  return stop;
}
