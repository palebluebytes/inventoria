/**
 * What a list of food candidates shows, and which of its rows it crowns
 * (ADR-0090).
 *
 * The defect the record was written against is that the app had one list and
 * two meanings for it. Search is a ten-key relevance sort (ADR-0055); Recent is
 * `b.time - a.time`, a chronology (ADR-0057). They rendered identically, down
 * to an inverted first row that was never a rank mark at all — it was bits-ui's
 * `highlighted`, the Enter target, force-set to the first candidate on open and
 * on every keystroke. So "this one won" was being painted over a list that
 * claims no order.
 *
 * `searchList` is where the rule that follows from that lives, away from the
 * 3,600-line view: a rank exists only where something ranked. The rest of this
 * file reads the marks themselves off the stylesheet, because a rank mark is a
 * colour and a border width and nothing else — ADR-0090's Consequences say so,
 * and call it thin.
 *
 * The Recent half is rendered server-side, which reaches it: the listbox is
 * `Combobox.ContentStatic`, inline rather than a popover, so its options are in
 * the SSR body. The searched half is not reachable that way — the results are
 * internal async state with no prop behind them — so what proves it here is the
 * pure function plus the stylesheet, and what proves the mark lands on a real
 * ranked row is the browser tier (`tests/food-ui.spec.ts`, "crowns the best
 * match"). The visual catalogue photographs this list too, and its
 * `food-way-in-search.png` baseline is stale until it is recaptured.
 */
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { searchList } from "../../src/lib/food/search-list";
import type { FoodResult } from "../../src/lib/food/food-search";
import FoodStager from "../../src/lib/views/food/FoodStager.svelte";
import { decl, ruleOf, rulesOf, styleOf } from "./support/stylesheet";

const STAGER = "src/lib/views/food/FoodStager.svelte";

const food = (n: number): FoodResult => ({
  entity: `food:usda_mock_${n}`,
  name: `Mock Food ${n}`,
  calories: 100 + n,
  protein: 1,
  fat: 2,
  carbs: 3,
  basis: "100 g",
  payload: {
    entity: `food:usda_mock_${n}`,
    attributes: { "food/name": `Mock Food ${n}` },
  },
});

const foods = (count: number) =>
  Array.from({ length: count }, (_, i) => food(i + 1));

describe("a ranked list says which one won", () => {
  it("gives the winner rank 0 and steps down from there", () => {
    const rows = searchList(foods(4), true);

    expect(rows.map((r) => r.rank)).toEqual([0, 1, 2, 3]);
    expect(rows[0].food.name).toBe("Mock Food 1");
  });

  it("gives a chronology no rank at all", () => {
    // ADR-0090 §4, the rule the defect became: a presentation meaning "this one
    // won" may not appear over a list that has not ranked anything. Rank is
    // absent rather than 0-and-ignored, so a view cannot paint it by accident.
    const rows = searchList(foods(4), false);

    expect(rows.map((r) => r.rank)).toEqual([null, null, null, null]);
  });
});

describe("nothing is held back", () => {
  it("renders every match a search returned, ranked to the last one", () => {
    // §5 originally cut this to six rows and counted the rest. Withdrawn: the
    // count was a display cap on the only surface those rows exist on, so a row
    // ranked seventh was not far away, it was gone — while the research the cap
    // came from is about e-commerce autocomplete, where the dropdown is a
    // shortcut and the full result page is still one Enter away. Every
    // precedent in the note that settled §1 keeps its weak end scrollable;
    // macOS Spotlight documents reaching it that way in as many words.
    const rows = searchList(foods(50), true);

    expect(rows).toHaveLength(50);
    expect(rows.at(-1)?.rank).toBe(49);
  });

  it("renders every food a meal's Recent offered", () => {
    expect(searchList(foods(12), false)).toHaveLength(12);
  });
});

/**
 * The stager's props, cut to what a rendered listbox needs. The eight DOM ids
 * are required of every host, and none of them is what this file looks at.
 */
const stagerProps = (recent: FoodResult[]) => ({
  ids: {
    search: "stager-search",
    barcode: "stager-barcode",
    primary: "stager-primary",
    customName: "stager-custom-name",
    customCal: "stager-cal",
    customProt: "stager-prot",
    customFat: "stager-fat",
    customCarb: "stager-carb",
  },
  onChoose: () => ({ ok: true }) as const,
  primaryLabel: () => "Log",
  initialMethod: "search",
  recent,
});

const listbox = (recent: FoodResult[]) =>
  render(FoodStager, { props: stagerProps(recent) }).body;

describe("the Recent list carries no rank mark", () => {
  // The assertion ADR-0090's Consequences ask for by name. Decoupling the
  // highlight is a real change to library behaviour rather than a skin, so a
  // bits-ui upgrade can silently restore the old conflation — and this is what
  // would catch it, because the mark it restores lands on row one of a list
  // that has ranked nothing.
  const body = listbox(foods(3));

  it("renders the chronology it was handed", () => {
    // Proving an absence is worth nothing if the list never rendered.
    expect(body.match(/class="result-item/g)).toHaveLength(3);
    expect(body).toContain("Recent");
  });

  it("crowns none of them", () => {
    expect(body).not.toMatch(/class="[^"]*\bbest\b/);
  });

  it("numbers none of them", () => {
    expect(body).not.toContain("data-rank");
  });

  it("shows all twelve of a full meal's default", () => {
    const full = listbox(foods(12));

    expect(full.match(/class="result-item/g)).toHaveLength(12);
  });
});

describe("a row is its name", () => {
  it("prints no macros line", () => {
    // §6, the clause most likely to be argued with: ~18px of a ~69px row, which
    // at this density is the difference between two visible rows and three.
    const body = listbox([food(1)]);

    expect(body).toContain("Mock Food 1");
    expect(body).not.toContain("result-macros");
    expect(body).not.toContain("kcal");
  });
});

describe("the two marks, read off the stylesheet", () => {
  it("inverts the winner, and only the winner", () => {
    const best = ruleOf(STAGER, ".result-item.best");

    expect(decl(best, "background")).toBe("var(--ink)");
    expect(decl(best, "color")).toBe("var(--paper)");
  });

  it("steps the runners-up down two edge weights onto the resting one", () => {
    // §2: three tokens that already exist, and a staircase that ends at the
    // third row — which is where the list stops making a claim worth reading.
    expect(
      decl(ruleOf(STAGER, '.result-item[data-rank="1"]'), "border-left")
    ).toBe("var(--edge-thick)");
    expect(
      decl(ruleOf(STAGER, '.result-item[data-rank="2"]'), "border-left")
    ).toBe("var(--edge)");
    expect(decl(ruleOf(STAGER, ".result-item"), "border")).toBe(
      "var(--edge-thin)"
    );
    expect(
      rulesOf(styleOf(STAGER)).filter((r) =>
        r.selectors.some((sel) => sel.startsWith(".result-item[data-rank="))
      )
    ).toHaveLength(2);
  });

  it("keeps the moving highlight a ring, and off the rank channel", () => {
    // §3. The one that regresses silently: a highlight that goes back to
    // inverting would be indistinguishable from the winner's mark again.
    const hl = ruleOf(STAGER, ".result-item.hl");

    expect(decl(hl, "outline")).toBe("var(--edge)");
    expect(decl(hl, "background")).toBeUndefined();
    expect(decl(hl, "color")).toBeUndefined();
  });

  it("lets the winner's mark survive a finger resting on it", () => {
    // `.result-item:hover` and `.result-item.best` are the same specificity, so
    // source order is the whole of the rule: crowned last, crowned.
    const sheet = rulesOf(styleOf(STAGER));
    const at = (selector: string) =>
      sheet.findIndex((r) => r.selectors.includes(selector));

    expect(at(".result-item.best")).toBeGreaterThan(at(".result-item:hover"));
  });
});

describe("the whole ranking is drawn lazily, not cut", () => {
  it("defers the paint of an off-screen row without leaving the DOM", () => {
    // The withdrawn cap and this are answers to the same question, and only one
    // of them keeps the row reachable. bits-ui collects its candidates with
    // `querySelectorAll`, so a row held out of the DOM is a row ArrowDown, End
    // and Enter cannot reach — `content-visibility` skips the drawing and keeps
    // the element, which is the difference the Amendment turns on.
    const row = ruleOf(STAGER, ".result-item");

    expect(decl(row, "content-visibility")).toBe("auto");
    expect(decl(row, "contain-intrinsic-size")).toBe(
      "auto var(--result-row-est)"
    );
  });

  it("names the row height it guesses with, on the list that owns it", () => {
    // A px is a measurement and belongs on a component that names its own
    // (CODING_STANDARDS §7) — no step of the space scale means "one row of this
    // list", the way no step means one cell of `HabitHeatmap`.
    expect(decl(ruleOf(STAGER, ".results-list"), "--result-row-est")).toBe(
      "51px"
    );
  });
});

describe("the food surface tokens say what they are", () => {
  /** Every stylesheet under `src/`, component or global — the same source-level
   *  sweep `field-size.test.ts` runs, and for the same reason: one call site
   *  left behind is one surface still drawing from a token that isn't there. */
  function stylesheets(dir = "src"): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? stylesheets(join(dir, e.name))
        : /\.(svelte|css)$/.test(e.name)
          ? [join(dir, e.name)]
          : []
    );
  }

  it("names four tokens nothing declares, nowhere", () => {
    // `--food-surface-bg`, `--food-surface-border`, `--food-item-radius` and
    // `--food-surface-hover` were read at twelve call sites across the food
    // views and declared at none, so every one of them had always resolved to
    // its fallback. A var() that can only ever miss is not a token, it is a
    // longer way to write the value — and the rank edge steps down from one of
    // them, which is why this is the change that finally wrote them out.
    const undeclared = [
      "--food-surface-bg",
      "--food-surface-border",
      "--food-item-radius",
      "--food-surface-hover",
    ];
    const guilty = stylesheets().filter((path) => {
      const text = readFileSync(path, "utf8");
      return undeclared.some((token) => text.includes(`var(${token}`));
    });

    expect(guilty).toEqual([]);
  });
});
