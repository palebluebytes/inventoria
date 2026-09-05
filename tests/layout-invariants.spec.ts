import { test, expect } from "@playwright/test";
import {
  PAGES,
  iconIdOf,
  pageLabel,
  pagesShownAt,
} from "../src/lib/food/pages";
import { hasPagesAt, openRationsDay } from "./support/rations";

// General CSS/layout guard: sweeps every screen and asserts no visible element
// escapes the viewport horizontally. This is the generalized version of the
// per-component bounding-box checks — it catches the whole class of "an element
// breaks out of its container" bugs (e.g. the settings eye-toggle overflow and
// the mobile Database Ledger buttons) on every page, at both the desktop and
// mobile viewports the Playwright projects run. Unlike a screenshot baseline it
// encodes the invariant directly, so it can't be silently frozen with a bug in
// it.
//
// **Both Facets, and one width above either project's** (#348). Until now this
// file swept the root app alone: `/?mem=1`, six tabs behind a Sidebar, at 1280
// and at the Pixel 5. Rations renders the same food screen into a different
// shell — no sidebar, the full measure, and two regions above the shell
// breakpoint (ADR-0091 §2) — and none of it was ever swept. Nor did anything
// here run above 1280, which is where the defect ADR-0091 was written about
// only becomes visible.

const TABS = ["Food", "Media", "Items", "Agenda", "Notes", "Settings"];

/**
 * The width the defect was reported at (#337): a 1920px monitor, where Rations
 * drew an ~864px column hugging the left edge with roughly a thousand pixels of
 * dead grey beside it.
 *
 * One wide viewport rather than a third Playwright project. The `chromium`
 * project's 1280×720 is load-bearing — it is what bounds the shell breakpoint
 * (ADR-0091 §8), so widening *it* would rebaseline 26 screenshots for no
 * invariant gained, and a whole project would run every spec in the suite a
 * third time to answer a question about layout.
 */
const WIDE_DESKTOP = { width: 1920, height: 1080 };

async function waitForDbReady(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => {
    const badge = document.querySelector(".db-badge");
    return badge?.textContent?.includes("DB Ready");
  });
}

/**
 * Returns visible elements whose box extends past the viewport's left/right
 * edges, ignoring anything inside a horizontally scrollable container (e.g. the
 * raw-ledger table wrap), where overflow is intentional.
 */
async function horizontalOverflowOffenders(
  page: import("@playwright/test").Page
) {
  return page.evaluate(() => {
    const TOL = 1;
    const vw = window.innerWidth;

    const scrollableX = (el: Element) => {
      const ox = getComputedStyle(el).overflowX;
      return ox === "auto" || ox === "scroll";
    };
    const hasScrollableAncestor = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (scrollableX(p)) return true;
      }
      return false;
    };

    /**
     * Clipped to nothing, which is a fifth way of not being on screen.
     *
     * The four tests below — `display`, `visibility`, `opacity`, a zero-area
     * rect — are an enumeration, and an enumeration is only as good as its last
     * entry. A screen-reader-only element is none of those four: it is a 1px box
     * with real geometry, parked off the left edge on purpose, painting nothing
     * because a clip collapses it. `getBoundingClientRect` cannot see a clip, so
     * the sweep read one as a layout defect on every surface of both Facets
     * (#348).
     *
     * Both recipes, because both are in the tree. `clip-path: inset(50%)` is
     * this repo's own — `ManualEntryFlow`'s `.hidden-file-input`, `FoodStager`'s
     * `.segmented-label`. `clip: rect(0, 0, 0, 0)` is the legacy one bits-ui
     * ships as `srOnlyStyles`, which its date components insert as
     * `document.body`'s first child and never remove: mount one calendar and
     * every screen after it carries the element, which is why one cause failed
     * 29 tests across three viewports.
     *
     * **The tolerance was standing in for this argument, by coincidence.** The
     * repo's own recipe carries `margin: -1px` and no transform, so it lands at
     * `left: -1` and clears `TOL` by exactly zero pixels. bits-ui's adds
     * `transform: translateX(-100%)` to a 1px box and lands at `left: -2` — one
     * pixel further, and that pixel is the whole difference between a sweep that
     * had never fired and 29 that did. A hidden element is skipped here because
     * it is hidden, not because it stopped one pixel short.
     */
    const clippedAway = (s: CSSStyleDeclaration) =>
      /^rect\(0px(?:,\s*0px){3}\)$/.test(s.clip) ||
      /^inset\((?:50%\s*){1,4}\)$/.test(s.clipPath);

    /**
     * ...and neither is anything inside one, which is the same rule the
     * scrollable exemption above already follows.
     *
     * Not hypothetical: the announcer's two `role="log"` children carry no clip
     * of their own and sit at the same `left: -2`. They are empty between
     * announcements, so the zero-area test catches them today — but `announce()`
     * holds text in one for 7.5 seconds, and a sweep that ran inside that window
     * would report a child the exemption above does not cover. Reading the
     * ancestors is what makes the exemption about the box rather than about the
     * moment the sweep happened to run.
     */
    const hasClippedAncestor = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (clippedAway(getComputedStyle(p))) return true;
      }
      return false;
    };

    const offenders: {
      tag: string;
      cls: string;
      left: number;
      right: number;
    }[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const s = getComputedStyle(el);
      if (
        s.display === "none" ||
        s.visibility === "hidden" ||
        s.opacity === "0" ||
        clippedAway(s)
      )
        continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (
        (r.right > vw + TOL || r.left < -TOL) &&
        !hasScrollableAncestor(el) &&
        !hasClippedAncestor(el)
      ) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls:
            typeof el.className === "string"
              ? el.className
              : (el.getAttribute("class") ?? ""),
          left: Math.round(r.left),
          right: Math.round(r.right),
        });
      }
    }
    return { vw, offenders };
  });
}

/** The sweep itself, over whatever is currently on screen. */
async function expectNoOverflow(
  page: import("@playwright/test").Page,
  surface: string
) {
  // Let the view settle (fade-in animation + any async first render).
  await page.waitForTimeout(250);

  const { vw, offenders } = await horizontalOverflowOffenders(page);
  expect(
    offenders,
    `Elements overflow the ${vw}px viewport on "${surface}":\n` +
      JSON.stringify(offenders, null, 2)
  ).toEqual([]);
}

/**
 * The root Facet's six tabs.
 *
 * A function rather than a `describe` of its own, because the same sweep runs at
 * two widths and the only difference between the runs is the viewport the
 * enclosing block declares.
 */
function sweepTheRoot() {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
  });

  for (const tab of TABS) {
    test(`${tab} keeps all content within the viewport`, async ({ page }) => {
      await page.locator(".nav-item", { hasText: tab }).click();
      await expectNoOverflow(page, tab);
    });
  }
}

/** Rations at `/food/`: the day, and every surface its header opens. */
function sweepRations() {
  test.beforeEach(async ({ page }) => {
    // Readiness is the day's, not a badge's, and the wait is shared with the
    // catalogue that photographs this same screen — including the positive
    // marker it takes first, without which "no skeleton rows" is also true of a
    // document Svelte never mounted into and the sweep below finds nothing
    // because there is nothing there.
    await openRationsDay(page);
  });

  test("the day keeps all content within the viewport", async ({ page }) => {
    await expectNoOverflow(page, "the day");
  });

  for (const p of PAGES) {
    test(`${pageLabel(p)} keeps all content within the viewport`, async ({
      page,
      viewport,
    }) => {
      // Which controls the header offers is a fact about the width, and it is
      // read off the roster rather than restated here (`lib/food/pages.ts`).
      // Above the shell breakpoint all three open a page; below it Recipes and
      // Settings open the same surfaces as sheets and Reports has no control at
      // all, because it has no sheet form (ADR-0091 §7). So this loop sweeps
      // both shapes of the two that have two, and skips the one that is not on
      // screen rather than inventing a way to reach it.
      const shown = pagesShownAt(hasPagesAt(viewport));
      test.skip(
        !shown.includes(p),
        `${pageLabel(p)} has no control below the shell breakpoint (ADR-0091 §7).`
      );

      await page.locator(`#${iconIdOf(p)}`).click();
      // One heading either side of the breakpoint. `inline` renders the same
      // surface into a page's flow or into a sheet (#341), so this wait is
      // width-blind without being told about widths.
      await expect(
        page.getByRole("heading", { name: pageLabel(p) })
      ).toBeVisible();
      await expectNoOverflow(page, pageLabel(p));
    });
  }
}

test.describe("Layout invariants — no horizontal overflow", () => {
  sweepTheRoot();
});

test.describe("Layout invariants — Rations' own shell", () => {
  sweepRations();
});

test.describe("Layout invariants — a 1920px desktop", () => {
  test.use({ viewport: WIDE_DESKTOP });

  test.beforeEach(({ isMobile }) => {
    // The `Mobile Chrome` project would collect these too, and a Pixel 5 with a
    // 1920px viewport is a device that does not exist: emulation keeps the touch
    // flags and the mobile user agent, so what it would prove is nothing about
    // either shape. The width belongs to the desktop project.
    test.skip(isMobile, "A phone is not 1920px wide.");
  });

  test.describe("the root Facet", () => {
    // Both Facets up here, not only the one the ticket was written about. The
    // `.main` that centres and caps is now **one rule shared by both shells**
    // (ADR-0091 §2), so the root's six screens were moved by this work as much
    // as Rations' day was, and 1920 is the first width at which a cap with no
    // `margin-inline` looks like anything at all.
    sweepTheRoot();
  });

  test.describe("Rations", () => {
    sweepRations();
  });
});
