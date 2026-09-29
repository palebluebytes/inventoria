/// <reference types="node" />
import { test, expect, type Page } from "@playwright/test";
import { openWayIn } from "./support/ways-in";

/**
 * **The Pack pairing act, driven** (ADR-0113, map #240).
 *
 * `pack-pairing-surface.test.ts` covers these same surfaces, and 20 of its 33
 * statements are `readCode` assertions — a regex over the component's own text.
 * Those say the wiring was WRITTEN a certain way; they cannot say a person can
 * reach the act, or that what comes back on screen is what the modules computed.
 * This is that half: search, accept, read the marks, clear, and the one question
 * that decides which set is searched at all.
 *
 * It is not a second copy of the module suites. The rule about which silences may
 * be filled is `marked-panel.test.ts`'s and the freeze is
 * `frozen-pairing.test.ts`'s; what is asserted here is only what a browser can
 * disprove and a unit test cannot: that the affordance appears on the foods §15
 * allows and on no others, that the marks land on the rows the pairing actually
 * supplied, and that moving the declaration moves the corpus underneath.
 *
 * **Note the name.** `pairing-sync.spec.ts` beside this file is the P2P act that
 * makes two of your own devices Paired Devices (ADR-0096 §8) and has nothing to do
 * with food — the collision ADR-0113 §16 refuses to spend the bare word on.
 */

/** A pack with a four-figure panel and nothing else: silent on every micronutrient
 *  a reference food may lawfully fill, which is what makes a pairing visible. */
const PACK_CODE = "3017620422003";

/** `fdc:171705` in the fixture below, carrying the calcium and iron the pack is
 *  silent on. Paired, those two rows and only those two wear the mark. */
const REFERENCE = "fdc:171705";
const REFERENCE_NAME = "Mock Banana";

test.describe("Pack pairing (ADR-0113)", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));

    // The shipped Search index, which is also the corpus an "as you bought it"
    // pairing search reads (§11). Three reference foods; Mock Banana is the only
    // one carrying micronutrients, so it is the only one whose pairing shows.
    await page.route("**/usda/search-index.json", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          artifact: "usda-search-index",
          schema_version: 2,
          generated_from: [],
          vocabulary_off: {
            licence: "ODbL",
            source: "Open Food Facts",
            url: "https://static.openfoodfacts.org/data/taxonomies/ingredients.full.json",
            sha256: "fixture",
            expansions: {},
          },
          vocabulary_local: {
            source: "Inventoria, hand-written",
            expansions: {},
          },
          state_qualifiers: [],
          foods: [
            {
              fdcId: 171705,
              description: REFERENCE_NAME,
              dataType: "Foundation",
              macros: {
                calories: 89,
                protein_content: 1.1,
                fat_content: 0.3,
                carbohydrate_content: 22.8,
              },
            },
            {
              fdcId: 1102706,
              description: "Mock Oats",
              dataType: "Foundation",
              macros: {
                calories: 379,
                protein_content: 13.1,
                fat_content: 6.5,
                carbohydrate_content: 67.7,
              },
            },
          ],
        }),
      });
    });

    // The shipped Nutrient store: where a pairing's figures actually come from.
    // Mock Banana's calcium and iron are the two the pack's label is silent on.
    await page.route("**/usda/nutrient-store.json", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          artifact: "usda-nutrient-store",
          schema_version: 2,
          generated_from: [],
          nutrients: {
            1003: { name: "Protein", unit: "g" },
            1004: { name: "Total lipid (fat)", unit: "g" },
            1005: { name: "Carbohydrate, by difference", unit: "g" },
            1008: { name: "Energy", unit: "kcal" },
            1087: { name: "Calcium, Ca", unit: "mg" },
            1089: { name: "Iron, Fe", unit: "mg" },
          },
          foods: {
            171705: {
              1003: 1.1,
              1004: 0.3,
              1005: 22.8,
              1008: 89,
              1087: 5,
              1089: 0.26,
            },
            1102706: { 1003: 13.1, 1004: 6.5, 1005: 67.7, 1008: 379 },
          },
        }),
      });
    });

    // **The cooked set, which is a second pair of artifacts and not a section of
    // the first** (§11). Neither Facet precaches these, so they are fetched only
    // once somebody declares a pack cooked — which is the whole of what the
    // declaration does, and what the last test here drives.
    await page.route("**/usda/pairing-index.json", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          artifact: "usda-pairing-index",
          schema_version: 10,
          generated_from: [],
          foods: [
            {
              fdcId: 167605,
              description: "Mock Banana, boiled",
              dataType: "SR Legacy",
              macros: {
                calories: 116,
                protein_content: 1.4,
                fat_content: 0.4,
                carbohydrate_content: 30,
              },
            },
          ],
        }),
      });
    });

    await page.route("**/usda/pairing-nutrient-store.json", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          artifact: "usda-pairing-nutrient-store",
          schema_version: 10,
          generated_from: [],
          nutrients: {
            1008: { name: "Energy", unit: "kcal" },
            1087: { name: "Calcium, Ca", unit: "mg" },
            1089: { name: "Iron, Fe", unit: "mg" },
          },
          foods: { 167605: { 1008: 116, 1087: 9, 1089: 0.41 } },
        }),
      });
    });

    // The pack itself. Four figures, per 100 g, and silent on everything else.
    await page.route(`**/api/v3/product/${PACK_CODE}.json`, async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          code: PACK_CODE,
          status: "success",
          product: {
            product_name: "Mock Hazelnut Spread",
            nutriments: {
              "energy-kcal_100g": 539,
              proteins_100g: 6.3,
              fat_100g: 30.9,
              carbohydrates_100g: 57.5,
            },
          },
        }),
      });
    });
  });

  async function waitForDbReady(page: Page) {
    await page.waitForFunction(
      () => {
        const badge = document.querySelector(".db-badge");
        return badge?.textContent?.includes("DB Ready");
      },
      { timeout: 10_000 }
    );
  }

  /** Scans the pack and leaves its staged card on screen, which is the host that
   *  can persist a pairing and therefore the one that offers the act. */
  async function stageThePack(page: Page) {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await openWayIn(page, "breakfast", "scan");
    await page.locator("#barcode-input").fill(PACK_CODE);
    await page.locator("#barcode-input").press("Enter");
    await expect(page.locator(".staged h3")).toHaveText("Mock Hazelnut Spread");
  }

  /** Opens the pairing sheet and waits for the act's own button, so nothing below
   *  races the sheet's mount. A locator that is merely absent is true of an
   *  unmounted sheet as well as of a closed one. */
  async function openPairingSheet(page: Page) {
    await page.locator('[data-testid="pair-food"]').click();
    await expect(page.locator('[data-testid="pairing-accept"]')).toBeVisible();
  }

  /** Every nutrient row of the staged card's full-nutrition disclosure, opened.
   *  It is a `<details>`, so its rows are in the DOM but not readable until it is. */
  async function openTheFullPanel(page: Page) {
    const panel = page.locator('[data-testid="food-nutrient-breakdown"]');
    await panel.locator("summary").click();
    return panel;
  }

  test("offers the act on a pack, and on none of the foods §15 refuses", async ({
    page,
  }) => {
    await stageThePack(page);
    // A pack whose twin can hold the assertion: the affordance is there.
    await expect(page.locator('[data-testid="pair-food"]')).toBeVisible();

    // A reference food is refused BY THE FOOD rather than by the screen (§15):
    // pairing `fdc:` with `fdc:` would assert that one USDA record stands in for
    // another, which is not what a pairing says. Same screen, same card
    // component, no affordance.
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await openWayIn(page, "breakfast", "search");
    await page.locator("#food-search-input").fill(REFERENCE_NAME);
    await page.locator(".result-item", { hasText: REFERENCE_NAME }).click();
    await expect(page.locator(".staged h3")).toHaveText(REFERENCE_NAME);
    await expect(page.locator('[data-testid="pack-pairing"]')).toHaveCount(0);
  });

  test("searches, accepts, and names the reference food on the pack's card", async ({
    page,
  }) => {
    await stageThePack(page);
    await openPairingSheet(page);

    // Nothing is armed before a person picks: the act's own button is dead, which
    // is §2 — no model proposes and no mechanical offer arrives in front of it.
    const accept = page.locator('[data-testid="pairing-accept"]');
    await expect(accept).toBeDisabled();
    await expect(accept).toHaveText("Pick a reference food");

    await page.locator('[data-testid="pairing-search"]').fill("banana");
    const rows = page.locator('[data-testid="pairing-result"]');
    await expect(rows.first()).toBeVisible();
    // Each candidate carries its own description, which is the whole of what makes
    // a wrong pairing rejectable (§9).
    await expect(rows.first()).toContainText(REFERENCE_NAME);

    // Tapping a row arms the button and writes nothing.
    await rows.first().click();
    await expect(accept).toBeEnabled();
    await expect(accept).toHaveText(`Pair with ${REFERENCE_NAME}`);
    await expect(page.locator('[data-testid="paired-with"]')).toHaveCount(0);

    // The button is the act.
    await accept.click();
    const paired = page.locator('[data-testid="paired-with"]');
    await expect(paired).toBeVisible();
    await expect(paired).toHaveAttribute("data-reference", REFERENCE);
    // Shown beside the pack and named, never merged into it (§1).
    await expect(paired).toContainText(REFERENCE_NAME);
    await expect(page.locator(".staged h3")).toHaveText("Mock Hazelnut Spread");
  });

  test("marks the figures the pairing supplied, and only those", async ({
    page,
  }) => {
    await stageThePack(page);
    await openPairingSheet(page);
    await page.locator('[data-testid="pairing-search"]').fill("banana");
    await page.locator('[data-testid="pairing-result"]').first().click();
    await page.locator('[data-testid="pairing-accept"]').click();
    await expect(page.locator('[data-testid="paired-with"]')).toBeVisible();

    // **One panel, two halves** (§5, and the 2026-09-29 Amendment): the nutrients
    // this person tracks are promoted into the pill grid and the rest sit behind
    // the disclosure, with the grid's keys excluded from it. So the claim has to
    // be read off both, and reading only one is how a leak into the other would
    // go unseen.
    const panel = await openTheFullPanel(page);
    const grid = page.locator(".staged .nutrients");

    // The disclosure: exactly the two rows the label was silent on and the
    // reference food carries. The mark is the sole carrier of provenance on
    // screen, so its presence here is the whole of what tells a reader these came
    // from somewhere else.
    await expect(panel.locator("dd.est")).toHaveCount(2);
    await expect(panel.locator('[data-testid="est-mark"]')).toHaveCount(2);
    await expect(panel).toContainText("Calcium");
    await expect(panel).toContainText("Iron");

    // The grid: the pack's own four figures, and not one of them marked. Where
    // both sources carry a value the label's is shown and the reference's is not
    // shown at all (§4) — 539 kcal is the pack's, never Mock Banana's 89 — and a
    // printed figure wears no mark. This is the half that would catch `estimated`
    // leaking onto a row nothing was borrowed for.
    await expect(grid).toContainText("539");
    await expect(grid).not.toContainText("89");
    await expect(grid.locator('[data-testid="est-mark"]')).toHaveCount(0);
  });

  test("unpairs on one tap, and the marks go with the pairing", async ({
    page,
  }) => {
    await stageThePack(page);
    await openPairingSheet(page);
    await page.locator('[data-testid="pairing-search"]').fill("banana");
    await page.locator('[data-testid="pairing-result"]').first().click();
    await page.locator('[data-testid="pairing-accept"]').click();

    const panel = await openTheFullPanel(page);
    await expect(panel.locator("dd.est")).toHaveCount(2);

    // Clearing is not a deletion — it appends an assertion naming nobody (§7) —
    // and what a reader sees is the pack's own label back, entire.
    await page.locator('[data-testid="clear-pairing"]').click();
    await expect(page.locator('[data-testid="paired-with"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="pair-food"]')).toBeVisible();

    // **Counted over the whole card rather than inside the disclosure**, because
    // the disclosure itself goes: the pack's four printed figures all sit in the
    // pill grid, so with nothing borrowed there are no extras left and
    // `NutrientBreakdown` draws nothing at all. A `toHaveCount(0)` scoped inside
    // it would pass for that reason rather than for the one being asserted, which
    // is how a cleared pairing that kept its marks would have gone unnoticed.
    const card = page.locator(".staged");
    await expect(card.locator('[data-testid="est-mark"]')).toHaveCount(0);
    await expect(card).not.toContainText("Calcium");
    await expect(
      page.locator('[data-testid="food-nutrient-breakdown"]')
    ).toHaveCount(0);
  });

  test("searches the set the declaration names, and only that set", async ({
    page,
  }) => {
    // §11's partition, driven rather than read off the source. The cooked records
    // are a second pair of artifacts reached ONLY by declaring a pack cooked, so
    // the two searches must not be able to see each other's rows — a cooked row
    // reaching the food search is the leak the record puts out of scope.
    const fetched: string[] = [];
    page.on("request", (r) => {
      const url = r.url();
      if (url.includes("/usda/")) fetched.push(url.split("/usda/")[1]);
    });

    await stageThePack(page);
    await openPairingSheet(page);

    // As bought, which is where a person already stands: the shipped index
    // answers and the cooked one has not been fetched at all.
    await page.locator('[data-testid="pairing-search"]').fill("banana");
    await expect(
      page.locator('[data-testid="pairing-result"]').first()
    ).toContainText(REFERENCE_NAME);
    await expect(
      page.locator('[data-testid="pairing-results"]')
    ).not.toContainText("boiled");
    expect(fetched.some((f) => f.startsWith("pairing-index"))).toBe(false);

    // Declaring it cooked moves the corpus under the same box, and takes the rows
    // with it rather than leaving the last set's answers standing under the new
    // question.
    await page
      .locator('[data-testid="declared-state"]')
      .getByText("Cooked")
      .click();
    await expect(page.locator('[data-testid="pairing-result"]')).toHaveCount(0);

    await page.locator('[data-testid="pairing-search"]').fill("banana");
    const cooked = page.locator('[data-testid="pairing-result"]');
    await expect(cooked).toHaveCount(1);
    await expect(cooked.first()).toContainText("boiled");
    // Asserted on the id rather than on the description, because the cooked row's
    // name CONTAINS the shipped row's — "Mock Banana, boiled" — so a substring
    // check here would pass whichever set answered. The two sets share no
    // `fdcId`, which is what makes the id the discriminant (§11).
    await expect(cooked.first()).toHaveAttribute(
      "data-reference",
      "fdc:167605"
    );
    await expect(
      page.locator(
        `[data-testid="pairing-result"][data-reference="${REFERENCE}"]`
      )
    ).toHaveCount(0);
    expect(fetched.some((f) => f.startsWith("pairing-index"))).toBe(true);
  });
});
