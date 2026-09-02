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
// here is the four guarantees ADR-0089 §8 makes, each as a relation between two
// boxes, so no run can agree with a regression.
//
// **The vertical twin of `layout-invariants.spec.ts`'s horizontal sweep is
// deliberately absent, and it is not an oversight.** That sweep works because
// nothing may cross the viewport's left or right edge, full stop. There is no
// such rule downwards: ADR-0089 §4 keeps the shell *out* of the band on purpose
// (`.app` is `100svh` and the nav does not chase the keyboard), and §6's seven
// hand-rolled centred cards have not folded onto the primitive yet. A blanket
// "no pinned box leaves the band" sweep would therefore fail on two populations
// that are behaving as designed or as scheduled. It becomes writable once §6
// lands, against the surfaces that are actually consumers of the band.

// 350px against the Pixel 5's 727px layout viewport, which is the divergence
// measured on the real thing: `visualViewport.height` 727 → 377 while
// `innerHeight` holds at 727.
const KEYBOARD_PX = 350;

// The same 1px slack `layout-invariants.spec.ts` allows, for a box whose edge
// lands on a fractional device pixel.
const TOL = 1;

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
    await page.locator("#demo-open-sheet").click();
    await expect(page.locator(".bottom-sheet-content")).toBeVisible();
    await settled(page.locator(".bottom-sheet-content"));
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

  test("the sheet, its header and its docked field stay inside the band", async ({
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
    // `--vv-h` — otherwise this would be checking the mechanism against itself.
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

    // #326 itself: the header — title, handle and *the way out* — was pushed off
    // the top of the screen. Both edges, because a header wholly inside the
    // sheet can still be outside the band.
    const headerBox = await boxOf(header, "the header");
    expect(headerBox.y).toBeGreaterThanOrEqual(band.top - TOL);
    expect(headerBox.y + headerBox.height).toBeLessThanOrEqual(
      band.bottom + TOL
    );

    // "The header and the dock's field are always visible" (ADR-0089 §8) — the
    // field is the half that a keyboard is raised *by*, so a geometry that hides
    // it hides the thing being typed into.
    const fieldBox = await boxOf(field, "the docked field");
    expect(fieldBox.y).toBeGreaterThanOrEqual(band.top - TOL);
    expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(band.bottom + TOL);

    // The other half of #326: the list was clipped mid-row because it had run up
    // under the header. Only the scrolling region gives up space, and it gives
    // it up by scrolling, never by sliding beneath its own chrome.
    const firstRowBox = await boxOf(firstRow, "the first body row");
    expect(firstRowBox.y).toBeGreaterThanOrEqual(
      headerBox.y + headerBox.height - TOL
    );
  });

  test("dismissing the keyboard restores the sheet exactly", async ({
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
    // shrunken after the keyboard closes — the failure a tolerance would hide,
    // and the reason the fake delegates to the real visual viewport instead of
    // substituting numbers of its own.
    expect(await sheet.boundingBox()).toEqual(before);
  });
});
