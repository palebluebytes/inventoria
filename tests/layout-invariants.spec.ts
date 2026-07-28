import { test, expect } from "@playwright/test";

// General CSS/layout guard: sweeps every screen and asserts no visible element
// escapes the viewport horizontally. This is the generalized version of the
// per-component bounding-box checks — it catches the whole class of "an element
// breaks out of its container" bugs (e.g. the settings eye-toggle overflow and
// the mobile Database Ledger buttons) on every page, at both the desktop and
// mobile viewports the Playwright projects run. Unlike a screenshot baseline it
// encodes the invariant directly, so it can't be silently frozen with a bug in
// it.

const TABS = ["Food", "Media", "Items", "Agenda", "Notes", "Settings"];

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
        s.opacity === "0"
      )
        continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if ((r.right > vw + TOL || r.left < -TOL) && !hasScrollableAncestor(el)) {
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

test.describe("Layout invariants — no horizontal overflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
  });

  for (const tab of TABS) {
    test(`${tab} keeps all content within the viewport`, async ({ page }) => {
      await page.locator(".nav-item", { hasText: tab }).click();
      // Let the view settle (fade-in animation + any async first render).
      await page.waitForTimeout(250);

      const { vw, offenders } = await horizontalOverflowOffenders(page);
      expect(
        offenders,
        `Elements overflow the ${vw}px viewport on "${tab}":\n` +
          JSON.stringify(offenders, null, 2)
      ).toEqual([]);
    });
  }
});
