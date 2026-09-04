import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { decl, ruleOf, rulesOf, styleOf } from "./support/stylesheet";
import {
  atLeast,
  BREAKPOINTS,
  watchAtLeast,
} from "../../src/lib/ui/breakpoints";
import {
  PAGES,
  hasSheetForm,
  iconIdOf,
  pageLabel,
  pageLegend,
  pagesShownAt,
  watchPageWidth,
} from "../../src/lib/food/pages";

/**
 * Rations' pages (ADR-0091 §5, #345).
 *
 * Two tiers, and the split is not arbitrary. `watchAtLeast` is ordinary logic
 * with a lifecycle — it is exercised against a fake `matchMedia` and asserted
 * on directly. Everything else here is a claim about **what is written**: which
 * control opens which surface, that the title is the only way off a page, and
 * that the current page's icon inverts. Those are properties of the source in
 * the same way `shell.test.ts`'s are properties of the stylesheet, and for the
 * same reason — a screenshot baseline can be frozen with a bug in it, and no
 * baseline of Rations' own shell exists yet at all.
 *
 * What is deliberately NOT here: that a page renders. The unit tier has no DOM,
 * both shells are server-rendered under a stubbed `window` with no `matchMedia`,
 * and `watchAtLeast` reports nothing there by design — so every SSR render of
 * this screen is the day, which is the safe default rather than a coverage gap
 * to paper over with a stub that would only be asserting itself.
 */

const FOOD_VIEW = "src/lib/views/FoodView.svelte";
const SHEET = "src/lib/ui/BottomSheet.svelte";
const RATIONS_SHELL = "src/Rations.svelte";
const ROOT_SHELL = "src/App.svelte";

const source = (file: string) => readFileSync(file, "utf8");

/**
 * The one rule in `file` whose selector list is exactly `[selector]`.
 *
 * `ruleOf` wants a selector to appear in exactly one rule, and `.title-back`
 * appears in two on purpose: the shared type block it is in with `h1`, and its
 * own. Asking for the rule that is *only* about it is what separates "the type
 * they share" from "the box the button gives up".
 */
function ownRule(file: string, selector: string) {
  const found = rulesOf(styleOf(file)).filter(
    (r) =>
      r.at === null && r.selectors.length === 1 && r.selectors[0] === selector
  );
  if (found.length !== 1) {
    throw new Error(
      `${file} has ${found.length} rules for "${selector}" alone, expected 1`
    );
  }
  return found[0];
}

/** A `matchMedia` that answers `matches` and records what it was asked. */
function fakeMatchMedia(matches: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const asked: string[] = [];
  const query = {
    matches,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) =>
      listeners.add(fn),
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) =>
      listeners.delete(fn),
  };
  return {
    asked,
    /** How many listeners are still attached — a disposer that lied shows here. */
    get attached() {
      return listeners.size;
    },
    resize: (to: boolean) => listeners.forEach((fn) => fn({ matches: to })),
    matchMedia: (q: string) => {
      asked.push(q);
      return query;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("a width is read from JavaScript only where it decides more than layout", () => {
  it("asks for the roster's query rather than a number the caller wrote", () => {
    const media = fakeMatchMedia(true);
    vi.stubGlobal("window", { matchMedia: media.matchMedia });
    watchAtLeast("shell", () => {});
    // The pair `breakpoints.test.ts` exists to hold, from the other end: the
    // stylesheet's `@media` and this read have to name one number, or a page
    // renders into a column that never split.
    expect(media.asked).toEqual([atLeast("shell")]);
    expect(media.asked[0]).toContain(`${BREAKPOINTS.shell}px`);
  });

  it("reports the current answer immediately, so a caller has one path", () => {
    const media = fakeMatchMedia(true);
    vi.stubGlobal("window", { matchMedia: media.matchMedia });
    const seen: boolean[] = [];
    watchAtLeast("shell", (m) => seen.push(m));
    // Not "subscribe, then also read once" — two paths that can disagree, and
    // the disagreement would be a screen drawn as the day and immediately
    // replaced by a page, or worse the other way round.
    expect(seen).toEqual([true]);
  });

  it("reports every change after it, and stops when disposed", () => {
    const media = fakeMatchMedia(false);
    vi.stubGlobal("window", { matchMedia: media.matchMedia });
    const seen: boolean[] = [];
    const stop = watchAtLeast("shell", (m) => seen.push(m));
    media.resize(true);
    media.resize(false);
    expect(seen).toEqual([false, true, false]);

    stop();
    expect(media.attached).toBe(0);
    media.resize(true);
    expect(seen).toEqual([false, true, false]);
  });

  it("reports nothing at all where there is no `matchMedia` to ask", () => {
    // Three real hosts: a server render with no `window`, the shell harness's
    // stubbed `window` carrying only a navigator and a location, and the
    // offline-boot driver's stubs. None may throw, and none may leave the
    // caller believing the window is wide — the day is the safe default and a
    // page nobody can leave is not.
    const seen: boolean[] = [];
    expect(() => watchAtLeast("shell", (m) => seen.push(m))()).not.toThrow();
    vi.stubGlobal("window", { navigator: {}, location: {} });
    expect(() => watchAtLeast("shell", (m) => seen.push(m))()).not.toThrow();
    expect(seen).toEqual([]);
  });
});

describe("a page is only shown where a shell has one and the width allows", () => {
  it("never reads the width in a shell with no pages", () => {
    // The defect this function exists to make unwriteable. The root Facet
    // mounts the food screen in its Food tab and has pages at no width; gate the
    // *drawing* instead of the *watching*, and a reader with the root's settings
    // sheet open at 1280 who drags the window under the breakpoint has it close
    // underneath them. A width the root has no pages at is not a width it has
    // anything to walk back from.
    const media = fakeMatchMedia(true);
    vi.stubGlobal("window", { matchMedia: media.matchMedia });
    const seen: boolean[] = [];
    const stop = watchPageWidth(false, (can) => seen.push(can));
    expect(media.asked).toEqual([]);
    expect(seen).toEqual([]);
    media.resize(false);
    expect(seen).toEqual([]);
    expect(() => stop()).not.toThrow();
  });

  it("reports the width, now and on every change, where there are pages", () => {
    const media = fakeMatchMedia(true);
    vi.stubGlobal("window", { matchMedia: media.matchMedia });
    const seen: boolean[] = [];
    watchPageWidth(true, (can) => seen.push(can));
    media.resize(false);
    // The `false` is the walk back: the caller clears its opening on it, and
    // gets one only from a width report, so it can never close a sheet somebody
    // just opened.
    expect(seen).toEqual([true, false]);
  });
});

describe("a page has exactly one control, and it is in the header", () => {
  it("holds the roster the app can actually reach, in the header's order", () => {
    // All three now have a surface behind them (#346 built Reports). The order
    // is the order the controls are drawn in, left to right, because the header
    // and the legend both loop it — and Settings stays last, where it has
    // always been.
    expect([...PAGES]).toEqual(["recipes", "reports", "settings"]);
  });

  it("draws the controls and the legend from the roster, not from a list", () => {
    // Written out twice, a fourth page reaches one of the two and the legend
    // starts describing a header it no longer matches — which is the drift the
    // ways in were looped to prevent.
    const view = source(FOOD_VIEW);
    // The width-filtered roster, never `PAGES`: at this width the two disagree
    // by exactly one member, and looping the raw roster would draw a Reports
    // control on a phone that has no Reports to open.
    expect(view.match(/\{#each shownPages as p \(p\)\}/g)).toHaveLength(2);
    expect(view).not.toContain("{#each PAGES as p (p)}");
    expect(view).toContain("id={iconIdOf(p)}");
    expect(view).toContain("aria-label={pageLabel(p)}");
    expect(view).toContain("<dd>{pageLegend(p)}</dd>");
    // One way in per action (ADR-0091 §1), at every width: the same control
    // opens the sheet below the breakpoint and the page above it.
    expect(view.match(/onclick=\{\(\) => \(page = p\)\}/g)).toHaveLength(1);
  });

  it("names an id and a label nothing hard-codes beside it", () => {
    // `iconIdOf` and `pageLabel` are live code rather than test fixtures — the
    // markup reads both — so this is what stops a second copy appearing.
    const view = source(FOOD_VIEW);
    const ids = PAGES.map(iconIdOf);
    expect(new Set(ids).size).toBe(ids.length);
    for (const page of PAGES) {
      expect(view).not.toContain(`id="${iconIdOf(page)}"`);
      expect(view).not.toContain(`aria-label="${pageLabel(page)}"`);
      expect(view).not.toContain(pageLegend(page));
    }
  });

  it("holds the roster in its header order at every width", () => {
    // The filtered roster is the header's roster minus what the width cannot
    // hold, in the same order — never a re-ordering, because the controls do
    // not move about as a window resizes.
    expect([...pagesShownAt(true)]).toEqual([...PAGES]);
    expect([...pagesShownAt(false)]).toEqual(["recipes", "settings"]);
  });

  it("reads the settings name off the registry, where its surface does", () => {
    // Two hand-typed copies of one Facet's name was the drift: the control said
    // "Rations settings" and the surface it opens builds the same string from
    // the roster (ADR-0080 §7, §8).
    expect(pageLabel("settings")).toBe("Rations settings");
    expect(pageLabel("recipes")).toBe("Recipes");
  });

  it("opens a page with a click that goes somewhere, never a toggle", () => {
    // "The icon that opened one is a toggle to nowhere on its own" (#345): the
    // control sets the page it names and nothing else, so pressing the icon of
    // the page you are already on is a no-op and the title carries the return.
    const view = source(FOOD_VIEW);
    expect(view).not.toMatch(/page === p \? null :/);
    expect(view).toContain("onclick={() => (page = null)}");
  });
});

describe("the title is the way back, and the only way off a page", () => {
  it("is the title itself, inside the heading and not beside it", () => {
    // A back arrow in the header actions would be a second control saying what
    // the word already says, and it would move the word by taking its place in
    // the row.
    const view = source(FOOD_VIEW);
    expect(view).toMatch(/<h1>[\s\S]*?class="title-back"[\s\S]*?<\/h1>/);
  });

  it("does not move the word by making it a control", () => {
    // ADR-0091 §5. Every type declaration the title has is written for both, in
    // one rule, so the two cannot be changed apart — and the trim that makes the
    // box the letters is among them, which is what keeps the word on the icons'
    // centre line either way.
    const shared = ruleOf(FOOD_VIEW, "h1");
    expect(shared.selectors).toContain(".title-back");
    for (const prop of [
      "font-size",
      "font-weight",
      "letter-spacing",
      "text-transform",
      "text-box-trim",
      "text-box-edge",
    ]) {
      expect(decl(shared, prop)).toBeDefined();
    }

    // And the button's own box, given up rather than styled: a UA button brings
    // padding, a border and a background, and any of the three would shift the
    // word or draw a box around it. Looked up by its whole selector list, since
    // `.title-back` appears in two rules and the shared one above is the other.
    const back = ownRule(FOOD_VIEW, ".title-back");
    expect(decl(back, "padding")).toBe("0");
    expect(decl(back, "margin")).toBe("0");
    expect(decl(back, "border")).toBe("none");
    expect(decl(back, "background")).toBe("none");
    // The two a button does not inherit, so they have to be asked for.
    expect(decl(back, "font-family")).toBe("inherit");
    expect(decl(back, "line-height")).toBe("inherit");
  });

  it("leaves the surface no way off of its own", () => {
    // #341's rules, asserted by the screen that depends on them: an ✕ that
    // unmounted the page would leave the screen with no content, and a page is
    // not a Back stop because it is not a thing the gesture dismisses.
    const sheet = source(SHEET);
    expect(sheet).toMatch(/\{#if !inline\}[\s\S]*?class="close-btn"/);
    expect(sheet).toContain("if (!isOpen || inline) return;");
  });
});

describe("a page with no sheet has no control at a width that only has sheets", () => {
  it("says which pages have a second shape, and Reports is not one", () => {
    // ADR-0091 §7, and it is a fact about the *page* rather than about the
    // width: Settings and Recipes are a sheet below the shell breakpoint and a
    // page above it, and Reports is a page or nothing. A report is a reading
    // surface — dense, comparative, about a period rather than a moment — and
    // no phone form for one has been designed, so ADR-0059 §4 makes the control
    // absent rather than disabled.
    expect(PAGES.filter(hasSheetForm)).toEqual(["recipes", "settings"]);
    expect(hasSheetForm("reports")).toBe(false);
  });

  it("takes the control away below the breakpoint, and in a shell with no pages", () => {
    // `canShowPage` is one answer to two questions — "this shell has pages" and
    // "the window is wide enough" — so the root Facet's Food tab loses the
    // Reports control at every width, on the same line that loses it on a phone.
    expect(pagesShownAt(false)).not.toContain("reports");
    expect(pagesShownAt(true)).toContain("reports");
  });

  it("keeps the legend describing exactly the marks that are on screen", () => {
    // Both loops read the filtered roster, so the legend can neither gloss a
    // mark that is not there nor miss one that is. That property used to be
    // free — the two rosters were the same list — and stops being free the
    // moment one page exists at only one width.
    const view = source(FOOD_VIEW);
    expect(view.match(/\{#each shownPages as p \(p\)\}/g)).toHaveLength(2);
    expect(view).toMatch(
      /let shownPages = \$derived\(pagesShownAt\(canShowPage\)\)/
    );
  });

  it("renders the report as a page and gives it no second shape", () => {
    // The two surfaces that are both a sheet and a page take `inline`; this one
    // takes nothing, because there is no shape for it to be told to be. A prop
    // here would be a sheet form claimed in the markup and absent everywhere
    // else.
    const view = source(FOOD_VIEW);
    expect(view.match(/<ReportsPage/g)).toHaveLength(1);
    expect(view.match(/inline=\{onPage\}/g)).toHaveLength(2);
    expect(view).not.toMatch(/<ReportsPage[^>]*inline/);
  });

  it("will not draw it at a width that cannot hold a page", () => {
    // The header cannot reach that state and the walk-back clears the opening
    // on a narrowing, so this guard is the two of them agreeing written down
    // where the surface is. What it costs to leave out is the one screen
    // ADR-0091 §5 says must not exist: a page on a phone, whose only way off —
    // the title — is not a control down there.
    const view = source(FOOD_VIEW);
    expect(view).toContain('{:else if page === "reports" && onPage}');
  });
});

describe("the header's icons are navigation above the breakpoint", () => {
  it("inverts the icon of the page you are on", () => {
    // Ink and paper, which is how this frame states selection — the same mark
    // the month calendar's chosen day wears.
    const current = ruleOf(FOOD_VIEW, '.header-icon-btn[aria-current="page"]');
    expect(decl(current, "background")).toBe("var(--ink)");
    expect(decl(current, "color")).toBe("var(--paper)");
  });

  it("says it once, where a screen reader and the eye read the same fact", () => {
    // Keyed on `aria-current` rather than on a class of its own: two writings of
    // one fact is two things that can disagree, and the one that would go
    // unnoticed is the one nobody can see.
    const view = source(FOOD_VIEW);
    expect(view).not.toMatch(/class:current|class="header-icon-btn current"/);
    expect(view.match(/aria-current=\{onPage && page === p /g)).toHaveLength(1);
  });

  it("marks nothing current where there are no pages", () => {
    // On a phone, and in the root's Food tab at every width, these open sheets.
    // A sheet is not a place you are, so there is nothing to be current, and the
    // attribute is absent rather than `false` — `aria-current="false"` is a
    // string a screen reader reads as a state that exists.
    const view = source(FOOD_VIEW);
    expect(view.match(/\? "page" : undefined/g)).toHaveLength(1);
    expect(view).not.toMatch(/aria-current=\{[^}]*"false"/);
  });
});

describe("a page is Rations' and the width's, and both are required", () => {
  it("is offered by the shell that holds one, and by no other", () => {
    // ADR-0091 §5, and the JavaScript half of `DailyDashboard`'s
    // `:global(.rations)`. The root renders this whole screen in its Food tab,
    // behind a navigation sidebar and one tab from its own Settings — a page
    // there would be a second door to a surface that already has one.
    expect(source(RATIONS_SHELL)).toMatch(/<FoodView[\s\S]*?hasPages/);
    expect(source(ROOT_SHELL)).not.toContain("hasPages");
  });

  it("walks a narrowing window back to the day", () => {
    // #345: a page below the breakpoint is a screen that cannot exist — the
    // title is not a control down there, so the only way off it is no longer
    // rendered. The clear is written inside the width report, which is the one
    // place it can fire on a resize and nowhere else; as an effect keyed on the
    // width it would run again the moment anything else it read changed, and
    // close a sheet a phone had just opened. That the report never arrives in a
    // shell with no pages is `watchPageWidth`'s half, asserted above.
    const view = source(FOOD_VIEW);
    expect(view).toMatch(
      /watchPageWidth\(hasPages, \(available\) => \{[\s\S]*?if \(!available\) page = null;/
    );
  });

  it("unmounts the day rather than hiding it", () => {
    // A day left in the tree keeps its ledger subscriptions live and its sheets
    // openable behind a screen nobody can see. `display: none` is right for the
    // week strip and the month calendar, which are two drawings of one part;
    // it is wrong for two screens.
    const view = source(FOOD_VIEW);
    expect(view).toMatch(/\{#if !onPage\}\s*<DailyDashboard/);
    expect(view.match(/<DailyDashboard/g)).toHaveLength(1);
  });

  it("renders each surface once, a page or a sheet by one prop", () => {
    // #341 one level up: two call sites, one per shape, is the same two props
    // written twice and changed once. `inline` is the whole of the difference.
    const view = source(FOOD_VIEW);
    for (const tag of ["FoodSettingsSheet", "RecipeLibrarySheet"]) {
      expect(view.match(new RegExp(`<${tag}`, "g"))).toHaveLength(1);
    }
    expect(view.match(/inline=\{onPage\}/g)).toHaveLength(2);
  });

  it("writes no width of its own, anywhere in the screen", () => {
    // The number is `breakpoints.ts`'s, in the query it hands `matchMedia` and
    // in the media queries the day screen writes. This file names neither: the
    // seven step-change queries were deleted with #342 and nothing replaced
    // them, so a width literal appearing here is a shape decision made in the
    // wrong place.
    const view = source(FOOD_VIEW);
    expect(view).not.toMatch(/@media[^{]*width/);
    expect(view).not.toContain("watchAtLeast");
    expect(view.match(/watchPageWidth\(/g)).toHaveLength(1);
    const conditional = rulesOf(styleOf(FOOD_VIEW))
      .filter((r) => r.at?.startsWith("@media"))
      .map((r) => `${r.at} { ${r.selectors.join(", ")} }`);
    expect(conditional).toEqual([]);
  });
});
