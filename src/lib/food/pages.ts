import { facetOf } from "../facets/registry";
import { watchAtLeast } from "../ui/breakpoints";

/**
 * Rations' pages (ADR-0091 §5) — see *Page* in `CONTEXT.md`.
 *
 * A page is a whole-screen surface the food screen shows **instead of the day**,
 * and it exists only above the shell breakpoint, in a shell that has pages at
 * all. Below that width the same controls open sheets, exactly as they always
 * have, and there are no pages anywhere.
 *
 * This module is the food screen's control vocabulary rather than a fold over
 * the ledger, which is the shelf `ways-in.ts` already stands on: the roster and
 * its order, what each control is called, what a legend says it does, and the
 * width the whole idea exists at. Its subject is a page, and everything here is
 * about one.
 *
 * **The word is "page", and only "page".** Not a door — `CONTEXT.md` spends
 * that on ADR-0034's four routes into the label form and lists it under _Avoid_
 * twice — and not a way in, which is a control in a meal's header. A page is
 * also not a route: nothing navigates, there is no router, and no URL moves.
 *
 * The roster is closed at two, and **one of them exists at only one width.**
 * Settings has a sheet below the shell breakpoint and a page above it; Reports
 * has no sheet at all and therefore no control down there (ADR-0091 §7), which
 * is why {@link pagesShownAt} exists and why nothing here reads `PAGES`
 * directly to draw with.
 *
 * **Recipes left, and it left upwards** (ADR-0114 §4). It was a page here and a
 * face at the same time, which is a surface with two controls — the switcher
 * tile and the header's pot — where ADR-0091 §1 allows an action one. The face
 * is the one that survived, because a tile is the same control at every width
 * and the pot was a page above the shell breakpoint and a sheet below it. What
 * the removal costs is the recipe library's phone shape: it is a screen you
 * switch to now rather than a sheet over the day, which is the same trade the
 * other four faces already made.
 */

/**
 * The pages, in the order the header shows their controls, left to right.
 *
 * Settled by hand and kept as the header already drew it, like `WAYS_IN`'s. It
 * is the order for the legend too, which is what looping this rather than
 * listing them twice buys: a third page appears in both places, in one place,
 * or in neither. Settings stays last, where it has always been, and Reports
 * leads because the page it used to follow became a face (ADR-0114 §4).
 */
export const PAGES = ["reports", "settings"] as const;

export type Page = (typeof PAGES)[number];

/**
 * The id of the header control that opens a page.
 *
 * Settings' id predates the pages — it was the sheet opener — and it is kept
 * rather than renamed because the same control does the same job either side of
 * the breakpoint; only what it opens changes. Reports' is newer and follows the
 * pattern rather than inventing one, even though it will never open a sheet.
 *
 * **No spec names either string.** The two that reach these controls
 * (`tests/layout-invariants.spec.ts`, `tests/visual-catalog.spec.ts`) read them
 * off this function inside a loop over the roster, which is what let #536 take
 * Recipes out of `PAGES` and have both stop visiting the recipe library with no
 * edit — and is why each of them now reaches that face by name instead.
 */
export function iconIdOf(page: Page): string {
  switch (page) {
    case "reports":
      return "food-reports-btn";
    case "settings":
      return "food-settings-btn";
  }
}

/**
 * What a page's control is called — its accessible name in the header, and the
 * name the legend gives the same mark.
 *
 * **The one name that exists on a roster is read off it**, which is where its
 * surface reads its own title. Settings (ADR-0080 §7, §8): the control and the
 * screen it opens were two hand-typed copies of one Facet's name, and one string
 * is correct in both. It is qualified rather than plain "Settings" because the
 * same surface opens from the root's Rations face, a tile away from the root's
 * own Settings, so the qualifier is this call site's and not the roster's.
 *
 * Recipes was read off the **face** roster from #528 until #536, when it stopped
 * being a page at all. Reports is on no roster — it is one of Rations' pages and
 * nothing else — so it stays spelled here.
 */
export function pageLabel(page: Page): string {
  switch (page) {
    case "reports":
      return "Reports";
    case "settings":
      return `${facetOf("food").name} settings`;
  }
}

/**
 * What a page holds, for the legend the food screen's ⓘ unfolds.
 *
 * A second gloss rather than a reuse of the name, for `wayInLegend`'s reason: a
 * legend is read by somebody who has not decided to press the control yet and
 * wants to know where it goes first.
 */
export function pageLegend(page: Page): string {
  switch (page) {
    case "reports":
      return "Three readings of what you have logged over a week, a month, a year, or a range you pick: the energy on each day, where that energy came from, and the foods you log most often. It reads the ledger and changes nothing in it.";
    case "settings":
      return "Nutrition targets and what the day's totals show, the Open Food Facts account used for scanning, and the local logs this app keeps.";
  }
}

/**
 * Whether this page also exists as a **sheet**, which is the only form it can
 * take below the shell breakpoint.
 *
 * Settings does, and its control therefore stands in the header at every width
 * — the same one control opening a sheet down there and a page up here, which is
 * ADR-0091 §1's one way in per action.
 *
 * Reports does not, and that is a decision about the product rather than about
 * layout (ADR-0091 §7). A report is a reading surface — dense, comparative, and
 * about a period rather than a moment — and no phone form for one has been
 * designed or measured; a control that opened a phone-sized sheet of bar charts
 * would be offering something the surface cannot carry, and ADR-0059 §4 says a
 * control that can only disappoint is absent rather than disabled. It is the
 * weakest clause in that record, and the thing to revisit first: §6 makes a
 * report a function of the ledger, so a phone form costs a drawing and no
 * stored fact.
 */
export function hasSheetForm(page: Page): boolean {
  switch (page) {
    case "settings":
      return true;
    case "reports":
      return false;
  }
}

/**
 * The pages whose control the header draws at the width it is being drawn at,
 * in {@link PAGES} order.
 *
 * **This is the roster the screen loops, and `PAGES` is not.** The header and
 * the legend both read it, so the legend can neither describe a mark that is
 * not on screen nor miss one that is — including at the one width where the two
 * would otherwise disagree, which is every width below the shell breakpoint and
 * every width at all in the root Facet's Rations face.
 *
 * `canShowPage` is {@link watchPageWidth}'s answer, so "no pages here" and "not
 * wide enough for one" arrive as the same `false` and neither has to be asked
 * about separately.
 */
export function pagesShownAt(canShowPage: boolean): readonly Page[] {
  return canShowPage ? PAGES : PAGES.filter(hasSheetForm);
}

/**
 * Reports whether a page may be shown right now — the shell has pages **and**
 * the window is wide enough for one — and keeps reporting as the width changes.
 * Hands back a disposer.
 *
 * **Both halves live here, and that is the point.** A shell with no pages never
 * reads the width at all, so nothing about a resize can reach a screen that has
 * only ever shown sheets. Written the other way — watch the width always, gate
 * the drawing later — the root Facet's Rations face is mounted at 1280, somebody
 * drags the window under the breakpoint, and the settings **sheet** they had
 * open closes underneath them. The root has no pages at any width; a width it
 * does not have pages at is not a width it has anything to walk back from.
 *
 * The other half of the walk-back is the caller's, because what it clears is the
 * caller's state: a page that outlived its width is a screen whose only way off
 * — the title — is no longer a control (ADR-0091 §5). A caller that clears on a
 * `false` from this cannot fire on anything but a width report, which is what
 * keeps it from reaching in and closing a sheet a phone just opened.
 */
export function watchPageWidth(
  hasPages: boolean,
  onChange: (canShowPage: boolean) => void
): () => void {
  if (!hasPages) return () => {};
  return watchAtLeast("shell", onChange);
}
