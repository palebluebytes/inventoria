import { test, expect } from "@playwright/test";
import { faceTitle, goToFace } from "./support/shell";

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
    // And the face's one spelling in the pinned header (ADR-0114 §3). This read
    // `Food` at `level: 1` until #538, which is the shape that told two `<h1>`s
    // apart — the shell's and the food screen's own.
    await expect(faceTitle(page)).toHaveText("Rations");
  });

  test("the switcher offers three faces, and every one is inside this Facet", async ({
    page,
  }) => {
    // **ADR-0078 §2 is overturned and §1 is not**, which is the whole of what
    // this test now says. It used to assert an empty tab bar — "there is no tab
    // bar, because there is nowhere else to go" — on the strength of a sidebar
    // being the only place a cross-Facet link would ever get authored.
    // ADR-0114 §8 gives Rations a switcher and keeps §1 as the *mechanism*: the
    // roster is a build-time declaration held to what this bundle reaches, so a
    // face whose screens are absent cannot be offered, and nothing is suppressed
    // at runtime.
    //
    // So the assertion is the roster's membership rather than its absence. Three
    // tiles — Rations, Recipes and Settings — and no fourth: a Media tile here
    // would mean a screen from another Facet had been pulled into this build,
    // which is the regression ADR-0077's 4.23 MB saving rests on.
    //
    // Read off `.face-name` rather than off the tile, because a tile holds more
    // than its name: #534 put the BETA band inside the button, so Recipes' tile
    // reads `BETARecipes` and the two that ship do not. Membership is a question
    // about the roster's spelling, and maturity is `face-maturity.test.ts`'s.
    await page.locator('button[aria-controls="face-switcher-panel"]').click();
    const panel = page.locator("#face-switcher-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".face-tile .face-name")).toHaveText([
      "Rations",
      "Recipes",
      "Settings",
    ]);

    // The app's own mark is a drawing here and a control on the root (§6): home
    // is the root's landing grid, which is at `/` and outside this Facet's
    // scope, so a link to it would eject an install into a browser tab.
    await expect(panel.locator("button.face-masthead")).toHaveCount(0);
    await expect(panel.locator(".face-masthead")).toHaveCount(1);
  });

  test("the gear opens the food screen's own settings, not the root's", async ({
    page,
  }) => {
    // **Two surfaces, one control each** (ADR-0114's #555 amendment). Both
    // shells reach the jar's Settings face through the switcher; the gear is not
    // a second way to it, it is the way to a different surface — Rations' own
    // settings, which is the food config the food screen has always carried
    // (ADR-0078 §2). The duplication this comment used to write down — "the gear
    // is the *other* way in" — was a shipped violation of ADR-0091 §1 with no
    // record behind it, and the cut is what retires it: §1's subject is an
    // action, and a reader cannot see which box a mark is published from.
    //
    // **The surface, not its shape.** This project's viewport is above the shell
    // breakpoint, so what the gear opens here is the settings *page*; the
    // `Mobile Chrome` project collects the same test and gets the sheet. That is
    // the point of ADR-0091 §5 reusing the sheet through `inline` rather than
    // growing a second copy — the heading below is the same heading, so this
    // assertion is width-blind without being told about widths at all.
    //
    // `SettingsView` being absent from the Rations build is **not** asserted by
    // `pnpm check:facets`: it is the jar-wide surface, which no domain owns, and
    // whether a block of it belongs inside a Facet is the judgement ADR-0083 §10
    // declined to gate. What is observable is this — the gear opens Rations
    // settings, titled off the registry (ADR-0080 §7), and it is the only door
    // to that surface.
    await page.locator("#food-settings-btn").click();
    await expect(
      page.getByRole("heading", { name: "Rations settings" })
    ).toBeVisible();
  });

  test("the Settings tile opens the jar's face, and it is a screen", async ({
    page,
  }) => {
    // The other half of the cut (ADR-0114's #555 amendment). The tile opens the
    // jar-wide surface — the pairing card and the face-visibility toggles — and
    // it carries none of the food config the gear opens, which is what makes the
    // two controls two actions rather than one duplicated.
    await goToFace(page, "Settings");
    await expect(
      page.getByRole("heading", { name: "Paired devices" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Faces" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Rations settings" })
    ).toHaveCount(0);

    // **A screen at every width**, which is the defect this cut removed and the
    // reason the assertion is width-blind: until #555 the tile wrote the food
    // screen's page, so below the shell breakpoint the face drew as a modal
    // sheet over the day, under a header saying Settings, with the day's own
    // controls in it and no way back. A face that is not a screen is what #536
    // spent a control to refuse, so the day must be gone rather than behind it.
    // The food screen is unmounted, so its four header controls are gone with
    // it — the gear among them, which is the one that would still be standing if
    // this face were drawn over the day.
    await expect(page.locator("#food-settings-btn")).toHaveCount(0);
    // And nothing is portalled over anything: below the breakpoint the old shape
    // was a `BottomSheet`, which is a dialog wherever `Modal` puts it. Above the
    // breakpoint it was an inline page and this was green either way, which is
    // why the `Mobile Chrome` project is the one that carries this line.
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the scan's own numbers are on the Facet that writes them (#207)", async ({
    page,
  }) => {
    // ADR-0071 §6's view. It is not what makes the channel legal any more —
    // ADR-0092 retired that rule — so what this asserts is the placement
    // decision: the reading of a channel belongs to the domain that writes it,
    // which is the same clause (b) that puts the log card's export switch here
    // rather than on the root's Settings screen (ADR-0080 §1).
    //
    // The wiring half only. What the card renders from the counters is a pure
    // fold, held in `tests/unit/scan-log.test.ts`.
    await page.locator("#food-settings-btn").click();
    await expect(
      page.getByRole("heading", { name: "Barcode scans", exact: true })
    ).toBeVisible();
  });

  test("Your data offers the way back in, not just the way out (#335)", async ({
    page,
  }) => {
    // ADR-0080 §2 carries the Ledger import into Rations whole and §3 argues
    // why: an export with no import is a file format rather than a restore
    // path, and ADR-0078 §7 gives this user no route to the root's copy of it.
    // The badge beside it is the only place the app says data may be evicted;
    // the per-origin usage figure stays at the root, where it is not a claim
    // about food.
    //
    // This is the wiring half. That the import is *un-narrowed* is pinned in
    // `tests/unit/rations-settings.test.ts`, and what it does with a whole-Jar
    // file in `tests/unit/db-ledger-import.test.ts`.
    await page.locator("#food-settings-btn").click();
    await expect(
      page.getByRole("heading", { name: "Your data", exact: true })
    ).toBeVisible();
    await expect(page.locator("#food-import-ledger-btn")).toBeVisible();
    await expect(page.locator("#food-storage-persistence")).toBeVisible();
    // The delete keeps ADR-0079 §5's wording, which is about food alone even
    // though the group over it no longer is.
    await expect(page.locator("#delete-food-data-btn")).toHaveText(
      "Delete all my food data"
    );
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
