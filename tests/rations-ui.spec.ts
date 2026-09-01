import { test, expect } from "@playwright/test";

// #309, ADR-0083 §9. One spec, no config change: `food/index.html` sits at the
// repo root, so the dev server the suite already starts serves `/food/`, and
// `baseURL` is only a prefix — this is collected by the existing `chromium` and
// `Mobile Chrome` projects and gets both device profiles for nothing.
//
// The root suite is untouched and keeps covering food. Moving `food-ui.spec.ts`'s
// 45 `/?mem=1` navigations to `/food/` would stop proving the root, and running
// them against both URLs would duplicate 34 tests to exercise the same
// components at a different path. What is here is only what is true at `/food/`
// and nowhere else.

test.describe("Rations, the food Facet's own entry point", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/food/?mem=1");
  });

  test("the shell boots, with its own name on it", async ({ page }) => {
    // `Rations.svelte` writes the title from the Facet it was handed, so this is
    // also the assertion that `food-main.ts` mounted the right one rather than
    // the root's shell at a different path.
    await expect(page).toHaveTitle("Rations");
    await expect(page.locator(".rations")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Food", level: 1 })
    ).toBeVisible();
  });

  test("there is no tab bar, because there is nowhere else to go", async ({
    page,
  }) => {
    // ADR-0078 §2 as a test rather than only as a build rule. Rations is one
    // Tracked Domain, so it is one screen, and the sidebar is the only place a
    // cross-Facet link would ever get authored — six tabs minus five is not a
    // tab bar.
    await expect(page.locator(".nav-item")).toHaveCount(0);
    await expect(page.locator(".sidebar")).toHaveCount(0);
  });

  test("the gear opens the food screen's own settings, not the root's", async ({
    page,
  }) => {
    // The root reaches its Settings tab through `.nav-item`; there is none here.
    // What a Rations user has instead is the sheet the food screen already
    // carried (ADR-0078 §2).
    //
    // `SettingsView` being absent from the Rations build is **not** asserted by
    // `pnpm check:facets`: it is the jar-wide surface, which no domain owns, and
    // whether a block of it belongs inside a Facet is the judgement ADR-0083 §10
    // declined to gate. What is observable is this — the gear opens Rations
    // settings, titled off the registry (ADR-0080 §7), and there is no other
    // door.
    await page.locator("#food-settings-btn").click();
    await expect(
      page.getByRole("heading", { name: "Rations settings" })
    ).toBeVisible();
  });

  test("no anchor leaves the Facet", async ({ page }) => {
    // ADR-0078 §1: a Facet's entry mounts its own screens and nothing else, so a
    // link out of `/food/` is unexpressible rather than forbidden. This asserts
    // the artifact anyway, because "unexpressible" is a property of the build
    // and a hand-authored `<a href="/">` would be neither caught by the bundler
    // nor visible to the containment check.
    //
    // **Same-origin anchors only.** An outward link to somebody else's site is
    // an ordinary link; the crossing this record is about is the one that
    // navigates in place inside a `display: standalone` install and drops the
    // user into Inventoria with no door back.
    const crossings = await page.evaluate(() =>
      [...document.querySelectorAll("a[href]")]
        .map((a) => new URL((a as HTMLAnchorElement).href, location.href))
        .filter((url) => url.origin === location.origin)
        .map((url) => url.pathname)
        .filter((path) => !path.startsWith("/food/"))
    );
    expect(crossings).toEqual([]);
  });
});
