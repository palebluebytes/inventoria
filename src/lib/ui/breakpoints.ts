/**
 * Every width this app changes shape at, in one place.
 *
 * ## Why a roster and not `postcss-custom-media`
 *
 * #337 settled on `postcss-custom-media` for this, and that decision does not
 * survive contact with the build. `svelte.config.js` declares no preprocessor
 * and `vite.config.ts` calls `svelte()` bare, so PostCSS never runs over a
 * component's `<style>` block — it reaches `src/app.css` and the plain `.css`
 * files and nothing else. Sixteen of the nineteen width queries in this app are
 * inside component styles, so the tool would have covered the minority and left
 * the drift it was bought to prevent exactly where it lives.
 *
 * Adding `vitePreprocess` to reach them changes how every component's CSS is
 * compiled, across a thousand files, to buy a shorthand. That is a large lever
 * for a small problem.
 *
 * So: the numbers stay literals where CSS wants them, and a **gate** proves the
 * set is closed (`tests/unit/breakpoints.test.ts`). A literal that is not on
 * this roster fails the suite, which is the failure mode the shorthand was
 * supposed to prevent — two numbers drifting apart — caught directly instead of
 * made unwriteable. It is the same shape as the ADR status vocabulary and the
 * entity-prefix registry: the roster proves the code.
 *
 * ## The rule
 *
 * A number here is a width at which the app is a **different shape**, never a
 * width at which it merely has more room. Room is the Utopia scale's job and it
 * is already fluid; a media query that steps a `clamp()` token up to a bigger
 * one is the scale being distrusted (#337 settled decision, and seven such
 * steps were deleted with it).
 */

/**
 * The two the whole app shares. Both are named because more than one file has
 * to agree with them, which is the only thing that makes a breakpoint app-wide
 * rather than local.
 */
export const BREAKPOINTS = {
  /**
   * The overlay shape changes. Below: a sheet anchored to the visible band's
   * bottom edge, because that edge is where the hand is. Above: a centred card,
   * because a card rising from the far end of a large screen is imitating a
   * device that is not there (ADR-0089 §6, #340).
   *
   * Also where the root Facet's `Sidebar` turns from a bottom bar into a rail,
   * and where `WeekStrip` swaps its narrow day labels for short ones.
   */
  sheet: 768,

  /**
   * Rations' shell splits into two regions: the meal timeline keeps the reading
   * edge, and a rail takes the day's numbers beside it (#342).
   *
   * **Must stay at or below 1280.** That is the `chromium` Playwright project's
   * viewport, and a shell no test viewport ever reaches is a shell nothing
   * defends (#337 Q21). Read from TypeScript as well as CSS, because it decides
   * whether Rations has pages at all and not only how wide its columns are —
   * which is exactly the pair this file exists to keep in step.
   */
  shell: 1180,

  /**
   * Rations' day splits into three: the ways into the day leave the head of the
   * timeline for a flank of their own on the left, opposite the rail
   * (ADR-0101's Amendment), and Rations' column widens to `--measure-wide` to
   * hold all three.
   *
   * **Above the desktop test viewport on purpose, unlike `shell`.** 1280 is the
   * `chromium` project's width and nothing below 1440 may depend on being
   * un-photographed, which is why this shape is additive: at 1439 the day is
   * exactly the two-region screen every baseline was taken against. What
   * defends it is `tests/layout-invariants.spec.ts`, which sweeps Rations at
   * 1920x1080 and therefore stands inside this query.
   *
   * Read from CSS only. Which columns a screen has is a fact about the width
   * and nothing else, so no `matchMedia` reads this one (`watchAtLeast` below
   * says when a width earns a JavaScript reader, and a box being laid out is
   * not it).
   */
  wide: 1440,
} as const;

/**
 * Widths one component decided for itself, with no second file to agree with.
 *
 * They are listed rather than exempted so the gate can prove the whole set is
 * closed: a local breakpoint is still a number somebody chose, and an
 * undeclared one is either a new shape nobody named or a typo. Each is where
 * its own content stops fitting, which is a fact about that component and not
 * about the app.
 *
 * **Each names the files that may use it**, and the gate asserts the actual
 * users are exactly those. That is what keeps "local" honest: `itemsGrid` is
 * already shared by two files, which is how a width ends up app-wide with
 * nobody owning it, and the roster is where that becomes visible instead of
 * being discovered later by whoever changes one of the two.
 *
 * None of these is a good reason to add a sixth. A component that wants to
 * respond to its own width should ask a container query, which is a question
 * about the room it has rather than about the size of the window.
 */
export const LOCAL_BREAKPOINTS = {
  /** `ItemsView` — the item grid goes two-up, and the inspector beside it. */
  itemsGrid: {
    px: 800,
    files: [
      "src/lib/views/ItemsView.svelte",
      "src/lib/views/items/ItemInspector.svelte",
    ],
  },
  /** `NotesView` — the note list gains its second column. */
  notesList: { px: 640, files: ["src/lib/views/NotesView.svelte"] },
  /** `ItemsView` — the item card's own two-column form. */
  itemForm: { px: 600, files: ["src/lib/views/ItemsView.svelte"] },
  /** `ScheduleRuleEditor` — the recurrence fields stop stacking. */
  scheduleFields: {
    px: 480,
    files: ["src/lib/views/habits/ScheduleRuleEditor.svelte"],
  },
} as const;

/** Every width the gate will accept in a media query, app-wide and local. */
export const ALL_BREAKPOINTS: readonly number[] = [
  ...Object.values(BREAKPOINTS),
  ...Object.values(LOCAL_BREAKPOINTS).map((b) => b.px),
];

/**
 * The media query `matchMedia` should be handed for an app-wide breakpoint, so
 * a caller never writes the number or the query syntax itself.
 */
export function atLeast(bp: keyof typeof BREAKPOINTS): string {
  return `(min-width: ${BREAKPOINTS[bp]}px)`;
}

/**
 * Reports whether the window is at or above an app-wide breakpoint, now and
 * whenever it changes, and hands back a disposer.
 *
 * **A width is read from JavaScript only where it decides more than its own
 * layout.** Everything that is purely a shape belongs in a media query, where
 * the stylesheet is the single source and nothing has to be told twice —
 * `DailyDashboard` swaps the week strip for the month calendar that way, and
 * says so. This exists for the one case that cannot: above the shell breakpoint
 * Rations shows a **page** instead of the day (ADR-0091 §5), and which
 * component is mounted is not something CSS decides. `display: none` on a page
 * would leave the day's stores subscribed, its sheets in the tree, and a dialog
 * announcing itself to a screen reader from behind a screen nobody can see.
 *
 * The query comes from {@link atLeast}, so the number is still this file's and a
 * caller never writes one. That pair — `matchMedia` here, `@media` in the
 * stylesheet — is what `breakpoints.test.ts` holds together: disagree, and a
 * full-page settings screen renders into a column that never split.
 *
 * `onChange` fires **immediately** with the current answer, so a caller has one
 * path rather than an initial read and a subscription that can disagree. Every
 * report after that one is coalesced to a frame and carries the width the
 * window settled at, for the reason written on the coalescing itself. Without
 * a `window` (both shells are server-rendered in the unit tier) or without
 * `matchMedia` (the offline-boot driver stubs a bare one, and the shell harness
 * stubs none at all) it reports nothing and the caller keeps its initial value —
 * which must therefore be the narrow one, since a screen that renders the day
 * and then widens into a page is right, and one that renders a page it cannot
 * leave is not.
 */
export function watchAtLeast(
  bp: keyof typeof BREAKPOINTS,
  onChange: (matches: boolean) => void
): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => {};
  }
  const query = window.matchMedia(atLeast(bp));
  let reported = query.matches;
  onChange(reported);

  // **A change is reported at the width the window settled at, not at every
  // width it passed through (#409).** A report here unmounts a whole surface
  // and the caller discards the reader's page with it, which is a walk-back
  // nothing walks forward again — so a width that existed for less than a
  // frame must not spend it.
  //
  // The transient is real and this repo has measured one. Chromium answers
  // `Page.captureScreenshot` with `captureBeyondViewport` — which Playwright
  // asks for whenever a full-page shot does not fit the viewport
  // (`crPage.js:222`) — by resizing the widget, and the page observes a
  // **one-pixel** viewport on the way: `innerWidth` 1280 → 1 → 1280, with a
  // `change` at each end 26-186ms apart. Reported straight through, all nine
  // blips seen across a 20-run sweep unmounted the page and `FoodView`
  // discarded the reader's `page` with it; with the coalescing, none of nine
  // did.
  //
  // **The window is a frame boundary, not a stopwatch, which is why those
  // wall-clock figures do not threaten it.** A callback asked for from inside a
  // `change` handler does not run in the frame that dispatched it, and by the
  // next frame's callback phase the query has been re-evaluated — so `settle`
  // reads what is true now rather than what an event said then, and a pair that
  // cancels out reports nothing. The gaps measure long only because the capture
  // starves the renderer of frames; in frames, the blip is one. A genuine
  // resize outlives the boundary and is reported once. Without
  // `requestAnimationFrame` — the unit tier's stubbed windows — this reports
  // synchronously, which is what it always did.
  const frame =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : null;
  let pending: number | null = null;
  const settle = () => {
    pending = null;
    if (query.matches === reported) return;
    reported = query.matches;
    onChange(reported);
  };
  const report = () => {
    if (!frame) return settle();
    if (pending === null) pending = frame(settle);
  };
  query.addEventListener("change", report);
  return () => {
    query.removeEventListener("change", report);
    if (pending !== null && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(pending);
    }
  };
}
