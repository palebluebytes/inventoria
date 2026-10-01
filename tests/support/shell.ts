import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The questions every root-Facet spec asks before it can do anything: **has the
 * ledger opened**, **how do I get to that face**, and — since ADR-0114 §9 — **how
 * do I get off the landing screen the app now opens on**.
 *
 * Both answers used to be written out in every spec that needed them, against
 * the root's `Sidebar`: readiness was the footer badge's words — `.db-badge`
 * containing "DB Ready" — and navigation was `.nav-item` filtered by the tab's
 * text. ADR-0114 §5 deletes that box. A badge that says "ready" and a tab bar
 * are both gone, so fifteen specs would have been fifteen separate migrations
 * and fifteen future ones; they are one file now, which is the shape
 * `tests/support/rations.ts` already had for the Facet that never had a badge.
 */

/**
 * Waits for the shell to report that the ledger has answered.
 *
 * **Read off an attribute rather than off words on the screen.** The old wait
 * matched the string "DB Ready" inside a badge, which coupled every spec to a
 * label that existed to be looked at — and that label is exactly what §9
 * retires, on the grounds that a permanent green tick is a developer's
 * affordance charging the user for it. The state is still real, so the shell
 * publishes it as `data-db` on its own box: `opening`, then `ready` or `error`.
 *
 * It matches either shell, because both write it and a spec should not have to
 * know which Facet it is standing in to ask whether the database is up.
 *
 * `toBeVisible` rather than `toHaveCount(1)`: a selector that has not matched
 * yet and a shell that never mounted are the same count, and #348's reading of
 * that trap is that an absence is only a fact once something present has been
 * seen.
 */
export async function waitForDbReady(page: Page): Promise<void> {
  await expect(page.locator('[data-db="ready"]')).toBeVisible();
}

/**
 * The landing screen's grid, which is the same component the panel holds.
 *
 * Told apart by where it is rather than by a hook of its own: the panel's copy is
 * portalled to the end of `<body>` by bits-ui, so the one inside `.main` is the
 * root's landing screen and there is no width or state at which both are
 * (ADR-0114 §9 — the landing has no trigger, because the grid **is** the
 * switcher).
 */
const LANDING = ".main .face-grid";

/**
 * The tile for one face, inside whichever grid is up.
 *
 * **Matched on the tile's name, not on its label.** `FaceGrid` draws the BETA
 * band inside the tile's `<button>` and says why: ADR-0114 §11 wants a beta face
 * to announce itself where somebody chooses a destination, so the band joins the
 * accessible name on purpose. A beta tile is therefore labelled `BETA Media`,
 * five of the seven faces are beta, and a `getByRole("button", { name, exact:
 * true })` here is the claim that a tile is labelled only by its face — true
 * until #534 and false since, which is what #560 found after four runs had hit
 * the job's 30-minute ceiling and reported it as a cancellation.
 *
 * `.face-name` is the span holding the roster's one spelling, and the hook
 * `tests/unit/support/faces.ts` already reads a face's name through. So this is
 * the two tiers asking the same question rather than a second idiom, and it is
 * the reason the fix is here rather than in the component.
 *
 * `:text-is` keeps the match **exact**, which relaxing the role query to a
 * substring would have given up. The seven names fail to collide today by luck,
 * and vetting the next one is not this file's job.
 */
function tileIn(host: Locator, name: string): Locator {
  return host.locator(".face-tile").filter({
    has: host.page().locator(`.face-name:text-is(${JSON.stringify(name)})`),
  });
}

/**
 * Lands on a face by its canonical name, from wherever the spec is standing.
 *
 * The name is the roster's one spelling (ADR-0114 §3) — the same string the
 * tile, the header's `<h1>` and the trigger's accessible name carry — so a spec
 * that says `goToFace(page, "Items")` is naming the face rather than a tab's
 * label that happened to match it.
 *
 * **Two hosts, one act.** On a face, the grid is behind the header's logo and has
 * to be opened. On the root's landing screen it is the screen, so there is
 * nothing to open and nothing to dismiss. Which one is up is read rather than
 * assumed, because the answer changes over the life of a spec: a reload or a
 * `page.goto("/")` puts it back on the landing, and the fifteen specs that used
 * to open on food now open on the grid.
 *
 * The tile is looked for **inside whichever grid is up**, never on the page. A
 * face's screen may well hold a control with the same word on it, and so may the
 * header — since #538 the title is a button on a page, though it is named for
 * where it goes rather than for the face — so a bare
 * `getByRole("button", { name })` would be ambiguous the first time one was.
 * Which tile that is, within the grid, is {@link tileIn}.
 */
export async function goToFace(page: Page, name: string): Promise<void> {
  const trigger = page.locator('button[aria-controls="face-switcher-panel"]');
  const landing = page.locator(LANDING);
  // One of the two, and the wait is what makes the branch below a reading rather
  // than a race: immediately after a navigation neither exists yet, and a
  // `count()` asked then would take the landing screen for a face.
  await expect(landing.or(trigger)).toBeVisible();

  if ((await landing.count()) > 0) {
    await tileIn(landing, name).click();
    // The grid leaving is what says the tap landed, and it is the same reading
    // as the panel closing below.
    await expect(landing).toHaveCount(0);
    return;
  }

  await trigger.click();
  const panel = page.locator("#face-switcher-panel");
  await expect(panel).toBeVisible();
  await tileIn(panel, name).click();
  // The panel is modal and closing it is what says the tap landed. Waiting here
  // rather than in each caller is what keeps a spec from racing the dim: bits-ui
  // puts `inert` on everything behind an open dialog, so a click issued at the
  // screen underneath while it is still up does nothing at all and the failure
  // arrives several assertions later.
  await expect(panel).toHaveCount(0);
}

/**
 * Opens the root Facet and lands on one of its faces, ledger up.
 *
 * **The three lines almost every root spec now starts with.** The root stopped
 * landing on food (ADR-0114 §9), so a spec that wants a face has to say which
 * one — and saying it in sixty places was the shape this file exists to refuse.
 *
 * The ledger wait comes **last**, and the order is the claim rather than a
 * convenience: the landing screen and its tiles are drawn from a build-time
 * roster, so the face is reached before the database has answered. A spec that
 * needs the un-ready state (`food-ui.spec.ts`'s skeleton) reaches for
 * {@link goToFace} directly instead of this.
 *
 * `query` is the search string, `?mem=1` by default — the in-memory ledger every
 * UI spec asks for. The two specs that want a real one pass `""`.
 */
export async function openRootFace(
  page: Page,
  name: string,
  query = "?mem=1"
): Promise<void> {
  await page.goto(`/${query}`);
  await goToFace(page, name);
  await waitForDbReady(page);
}

/**
 * The face you are standing on, read off the shell's pinned header.
 *
 * **One `<h1>`, and it is the shell's** (ADR-0114 §3, §5). Until #533 each face
 * drew a title of its own inside its `.page-header`, so a spec asking which
 * screen it was on matched `header.page-header h1` and got a string the face
 * spelled for itself — `Physical Digital Twins` where the tile said `Items`.
 * Those rows are deleted and the name is the roster's, so this reads the same
 * string the tile, the trigger's accessible name and `goToFace` use.
 *
 * Scoped to `.face-header` rather than to a bare heading role, because a face's
 * screen may hold a heading with the same word on it. Rations' food screen drew
 * an `<h1>` of its own under this one until #538, which is why `level: 1` was
 * once enough to tell them apart and is not what this reads.
 *
 * It is also the way back off a page (ADR-0091 §5), so what it holds is a
 * `<button>` there and a bare word on the day. `toHaveText` reads through
 * either; a spec that wants the control asks for the button by its accessible
 * name — "Rations, back to the day".
 */
export function faceTitle(page: Page) {
  return page.locator(".face-header h1");
}
