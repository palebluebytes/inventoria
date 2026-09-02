import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  installVirtualKeyboard,
  setKeyboard,
} from "./support/virtual-keyboard";

// Keyboard invariants for a surface pinned to the visible band (ADR-0089 §9).
//
// **What this proves, and what it does not.** This proves the app reacts
// correctly to a visual-viewport resize. **It does not prove that any browser
// emits one.** That second half is unfalsifiable in CI — no engine Playwright
// drives has a software keyboard, and no CDP command in the pinned Chrome 147
// makes the visual viewport diverge from the layout viewport (the measurements
// are in `support/virtual-keyboard.ts`). It belongs to a manual check on a real
// phone, and #326's three Android screenshots are what stands in for it.
//
// **Invariants, not pixels, and deliberately no screenshot.** A keyboard
// baseline would cost two PNGs per state and a `workflow_dispatch` round-trip to
// rebaseline, and — as `layout-invariants.spec.ts` says of its own subject — a
// baseline can be silently frozen with the bug already in it. What is asserted
// here is what ADR-0089 §8 guarantees, each claim a relation between two boxes,
// so no run can agree with a regression.
//
// **Both height models, because they are two different claims.** An ordinary
// sheet is `bottom: var(--vv-bottom); max-height: var(--vv-h)`; a full-height
// one is `top: var(--vv-top); height: var(--vv-h)`, an over-constrained box
// whose `bottom` is dropped only because the reset leaves its vertical margins
// non-`auto`. The surface #326 actually broke is the second kind, so testing the
// first alone would miss it.
//
// **The vertical twin of `layout-invariants.spec.ts`'s horizontal sweep is
// deliberately absent, and it is not an oversight.** That sweep works because
// nothing may cross the viewport's left or right edge, full stop. There is no
// such rule downwards: ADR-0089 §4 keeps the shell *permanently* out of the band
// (`.app` is `100svh`, and the nav must not chase the keyboard), and §6's seven
// hand-rolled centred cards have not folded onto the primitive yet. So a
// downward sweep can never be a blanket one — it needs a roster of the surfaces
// that are consumers of the band, and that roster is not settled until §6 lands.

// 350px against the Pixel 5's 727px layout viewport, which is the divergence
// measured on the real thing: `visualViewport.height` 727 → 377 while
// `innerHeight` holds at 727.
const KEYBOARD_PX = 350;

// The same 1px slack `layout-invariants.spec.ts` allows, for a box whose edge
// lands on a fractional device pixel.
const TOL = 1;

/** The two height models §5 gives a sheet below 768px, and how to raise each. */
const SHAPES = [
  {
    name: "an ordinary sheet, anchored to the band's bottom edge",
    open: "#demo-open-sheet",
  },
  {
    name: "a full-height sheet, pinned to the band's top edge",
    open: "#demo-open-fill-sheet",
  },
] as const;

interface ViewportReading {
  /** The visible band's height — what a consumer of `--vv-h` is sized by. */
  visual: number;
  /** The layout viewport: what `position: fixed` resolves `bottom` against. */
  layout: number;
  /** The large viewport. It must *not* move, or the fake is not faithful. */
  inner: number;
}

async function readViewport(page: Page): Promise<ViewportReading> {
  return page.evaluate(() => {
    const vv = window.visualViewport;
    if (!vv) throw new Error("This browser has no visualViewport.");
    return {
      visual: vv.height,
      layout: document.documentElement.clientHeight,
      inner: window.innerHeight,
    };
  });
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The element's box, or a failure naming the element rather than `null`. */
async function boxOf(locator: Locator, what: string): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${what} has no box — is it visible?`);
  return box;
}

/**
 * Wait out the sheet's `slideUp`. Its box is mid-transform until the animation
 * finishes, and every assertion here is a box comparison. A cancelled animation
 * rejects `finished`, which is not a failure — it means the sheet is already
 * where it is going.
 */
async function settled(sheet: Locator): Promise<void> {
  await sheet.evaluate((el) =>
    Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {})))
  );
}

test.describe("Keyboard invariants — a sheet stays inside the visible band", () => {
  test.beforeEach(async ({ context, page, isMobile }) => {
    // A phone claim. Above 768px the peek returns and there is no software
    // keyboard behind which to hide (ADR-0089 §5), so the desktop project has
    // nothing to say about it.
    test.skip(!isMobile, "The visible band is a phone geometry (ADR-0089 §5).");

    // Before the goto, not after: `startViewportInset` reads
    // `window.visualViewport` once at startup and holds what it was handed.
    await installVirtualKeyboard(context);

    // The primitive in isolation — no ledger, no relay, and the sheet's own
    // dock rather than a screen's (issue #17's harness).
    await page.goto("/?mem=1&demo=bottomsheet");
    await page.locator("#demo-open-parent").click();
  });

  test("the fake shrinks the visual viewport and leaves the layout viewport alone", async ({
    page,
  }) => {
    const before = await readViewport(page);
    expect(before.visual).toBe(before.layout);

    await setKeyboard(page, KEYBOARD_PX);
    const raised = await readViewport(page);

    // The signature of a real keyboard under `interactive-widget=resizes-visual`,
    // and the one thing no CDP lever reproduces: the band shrinks, and every
    // viewport unit — which resolves against the layout viewport, and so against
    // `inner` here — does not move at all.
    expect(raised.visual).toBe(before.visual - KEYBOARD_PX);
    expect(raised.layout).toBe(before.layout);
    expect(raised.inner).toBe(before.inner);
  });

  for (const shape of SHAPES) {
    test.describe(shape.name, () => {
      test.beforeEach(async ({ page }) => {
        await page.locator(shape.open).click();
        const sheet = page.locator(".bottom-sheet-content");
        await expect(sheet).toBeVisible();
        await settled(sheet);
      });

      test("keeps the sheet, its header and its docked field inside the band", async ({
        page,
      }) => {
        const sheet = page.locator(".bottom-sheet-content");
        const header = page.locator(".bottom-sheet-header");
        const field = page.locator("#demo-dock-field");
        const firstRow = page.locator(".body-list li").first();

        const { layout } = await readViewport(page);
        await setKeyboard(page, KEYBOARD_PX);
        await settled(sheet);

        // The band, derived from what the test drove rather than read back off
        // `--vv-h` — otherwise this would check the mechanism against itself.
        const band = { top: 0, bottom: layout - KEYBOARD_PX };

        const sheetBox = await boxOf(sheet, "the sheet");
        expect(
          sheetBox.y + sheetBox.height,
          "the sheet runs under the keyboard"
        ).toBeLessThanOrEqual(band.bottom + TOL);
        expect(
          sheetBox.y,
          "the sheet's top edge is off the top of the screen"
        ).toBeGreaterThanOrEqual(band.top - TOL);

        // #326 itself: the header — title, handle and *the way out* — was pushed
        // off the top of the screen. Both edges, because a header wholly inside
        // the sheet can still be outside the band.
        const headerBox = await boxOf(header, "the header");
        expect(headerBox.y).toBeGreaterThanOrEqual(band.top - TOL);
        expect(headerBox.y + headerBox.height).toBeLessThanOrEqual(
          band.bottom + TOL
        );

        // "The header and the dock's field are always visible" (ADR-0089 §8) —
        // the field is the half a keyboard is raised *by*, so a geometry that
        // hides it hides the thing being typed into.
        const fieldBox = await boxOf(field, "the docked field");
        expect(fieldBox.y).toBeGreaterThanOrEqual(band.top - TOL);
        expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(
          band.bottom + TOL
        );

        // A weak guard, and named as one: header and body are siblings in a flex
        // column, so this holds unless the sheet stops being a flex column at
        // all. It is here because the list running up under the header is the
        // other half of what #326 showed; the load-bearing version of "only the
        // scrolling region gives up space" is the next test.
        const firstRowBox = await boxOf(firstRow, "the first body row");
        expect(firstRowBox.y).toBeGreaterThanOrEqual(
          headerBox.y + headerBox.height - TOL
        );
      });

      test("takes the space out of the scrolling region and nothing else", async ({
        page,
      }) => {
        const sheet = page.locator(".bottom-sheet-content");
        const header = page.locator(".bottom-sheet-header");
        const body = page.locator(".bottom-sheet-body");
        const dock = page.locator(".bottom-sheet-footer");

        const before = {
          header: await boxOf(header, "the header"),
          body: await boxOf(body, "the body"),
          dock: await boxOf(dock, "the dock"),
        };

        await setKeyboard(page, KEYBOARD_PX);
        await settled(sheet);

        // ADR-0089 §8, stated as the only thing that may move. A sheet that
        // squeezed its header or its dock to fit would satisfy every containment
        // assertion above and still be the bug.
        expect((await boxOf(header, "the header")).height).toBe(
          before.header.height
        );
        expect((await boxOf(dock, "the dock")).height).toBe(before.dock.height);
        expect(
          (await boxOf(body, "the body")).height,
          "the scrolling region did not give up the keyboard's space"
        ).toBeLessThan(before.body.height);
      });

      test("restores exactly when the keyboard is dismissed", async ({
        page,
      }) => {
        const sheet = page.locator(".bottom-sheet-content");
        const before = await boxOf(sheet, "the sheet");

        await setKeyboard(page, KEYBOARD_PX);
        await settled(sheet);
        const raised = await boxOf(sheet, "the sheet");

        // It moved out of the keyboard's way. Asserted on the bottom edge rather
        // than the height, because a sheet shorter than the band rises without
        // shrinking and is equally correct.
        expect(raised.y + raised.height).toBeLessThan(before.y + before.height);

        await setKeyboard(page, 0);
        await settled(sheet);

        // Exactly, not approximately. This is what catches a surface that stays
        // shrunken after the keyboard closes — the failure a tolerance would
        // hide, and the reason the fake delegates to the real visual viewport
        // instead of substituting numbers of its own.
        expect(await sheet.boundingBox()).toEqual(before);
      });
    });
  }
});
