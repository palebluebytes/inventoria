/**
 * Every class name worn in `src/` markup, against every rule that could reach
 * it — ADR-0097, #376.
 *
 * `ui-primitives.test.ts` runs this comparison for one prefix — the `retro-*`
 * family — and `tap-floor.test.ts` runs the *converse*, asking what a rule that
 * lands says about a box. Neither can find the failure this file is for: a
 * skin's **name** copied without the skin, which draws nothing and says nothing.
 * `AddHabitScreen`'s and `ScheduleRuleEditor`'s `class="input-brutal …"` was the
 * trail in; `grep -rn '\.input-brutal' src/` returned nothing, in either file or
 * anywhere else, and had done since the class was written.
 *
 * **A name is reached four ways, and only four.**
 *
 * 1. **A rule in the file's own `<style>`.** Svelte scopes it to that file, so
 *    it reaches boxes written there and nowhere else.
 * 2. **A rule in `src/app.css`**, which is scoped to nothing.
 * 3. **A `:global(…)` in any component's `<style>`.** This is the only way one
 *    file's sheet reaches another file's box, and the app uses it heavily —
 *    `.mt-4` is declared this way, in two unrelated views.
 * 4. **A Playwright spec selecting by it.** A class is not only a hook for a
 *    rule; `.db-badge` is how eleven specs wait for the ledger to come up. The
 *    disease here is a name that is load-bearing for *nothing*, and one a spec
 *    steers by is load-bearing. Only the specs and their helpers count, because
 *    only they select out of a live DOM — a unit test naming a class in a string
 *    is describing markup, not depending on it.
 *
 * **The one that is not a way, and is the whole reason a sweep was needed.** A
 * `class` handed to a Svelte component is a **prop**, and carries no scoping
 * hash of the caller's. `<Card class="shadow-brutal">` next to a scoped
 * `.shadow-brutal` rule compiles that rule to `.shadow-brutal.svelte-CALLER`
 * against an element that only ever wears Card's own hash, so it can never
 * match — and Svelte does not warn, because it can see the class is used. So
 * rule 1 is read against plain elements only, and a name on a component tag
 * needs 2, 3 or 4.
 *
 * `9612363` is where most of the residue came from: it deleted thirteen CSS
 * rules Svelte reported as unused and left every class name in the markup, so
 * `.stat-card`'s `flex-direction: column` went and the four stat cards have been
 * drawing their value and label side by side ever since. The first run of this
 * sweep found 43 such wearings — 33 names across 24 files, out of 1,376
 * wearings of 894 names in 118 files — and ADR-0097 records what each was
 * resolved to and why the residue is held at zero rather than listed.
 *
 * **This is a standing guard, and it has to be**, for the reason
 * `tap-floor.test.ts`'s docblock gives about its own population: a sweep run
 * once is a number, and a number about markup is stale by the next commit. It
 * discovers its population from `git ls-files` and derives all four reach sets
 * from the tree, so there is no roster here to fall out of date — a name that
 * loses its last rule fails on the commit that removes it.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  appSheet,
  classNamesIn,
  globalClassNamesIn,
  rulesOf,
  styleOf,
  type Rule,
} from "./support/stylesheet";
import { elementsOf, trackedSvelteFiles, type Element } from "./support/markup";

const FILES = trackedSvelteFiles();

/** A component's flattened `<style>` rules, or none where it has no block. */
function sheetOf(file: string): Rule[] {
  return readFileSync(file, "utf8").includes("<style>")
    ? rulesOf(styleOf(file))
    : [];
}

const SHEETS = new Map(FILES.map((file) => [file, sheetOf(file)]));

/** Reach 2: `src/app.css`, scoped to nothing. */
const APP = classNamesIn(appSheet());

/** Reach 3: every `:global(…)` in the app, wherever it is declared. */
const GLOBAL = new Set(
  [...SHEETS.values()].flatMap((rules) => [...globalClassNamesIn(rules)])
);

/**
 * A source file's string literals, comments skipped.
 *
 * One left-to-right walk rather than two regex passes, because the two kinds of
 * quoting nest into each other and a pass that does not know where it is gets
 * both directions wrong. Strip comments first and a Playwright route glob —
 * a string of two stars, a slash and a star — opens a comment that ran 18,000
 * characters and took two thirds of `visual-catalog.spec.ts` with it. Scan for
 * quotes first and the apostrophe in a prose "doesn't" opens a literal that
 * closes pages later. Whichever runs first is wrong, so neither does: the walk
 * decides at each character which of the two it is inside.
 *
 * A comment is skipped rather than read because a class *named* in prose is not
 * a class anything depends on, which is the distinction this whole file is for.
 */
function stringLiteralsIn(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const found: string[] = [];
  let i = 0;
  while (i < source.length) {
    const here = source[i];
    if (here === "/" && source[i + 1] === "/") {
      const eol = source.indexOf("\n", i);
      i = eol === -1 ? source.length : eol;
    } else if (here === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
    } else if (here === '"' || here === "'" || here === "`") {
      let j = i + 1;
      // A `'` or `"` literal cannot span a line, so an apostrophe the walk
      // reaches anyway — inside a regex, say — gives up at the newline instead
      // of running to the next one in the file.
      while (j < source.length && source[j] !== here) {
        if (source[j] === "\\") j++;
        else if (here !== "`" && source[j] === "\n") break;
        j++;
      }
      if (source[j] === here) {
        found.push(source.slice(i + 1, j));
        i = j + 1;
      } else i++;
    } else i++;
  }
  return found;
}

/**
 * Reach 4: class names the Playwright suite selects by.
 *
 * Read out of string literals only, and out of two narrower parts of those. A
 * literal with a `/` in it is a path or a URL, not a selector, so an import
 * specifier cannot donate its extension as a class name. And a template
 * literal's `${…}` holes are code, not text: leaving them in credited `now`,
 * `hash` and `pathname` off ordinary property access, and a name this set
 * credits wrongly is a dead class the sweep then clears.
 *
 * `page.locator(".macro-item.calories")` counts; `"./support/rations"` and the
 * `location.hash` inside a template hole do not.
 */
const SELECTED_BY_SPECS = new Set(
  execFileSync("git", ["ls-files", "tests/*.spec.ts", "tests/support/*.ts"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean)
    .flatMap(stringLiteralsIn)
    .map((literal) => literal.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, " "))
    .filter((literal) => !literal.includes("/"))
    .flatMap((literal) =>
      [...literal.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1])
    )
);

/** One class name as one element wears it. */
type Worn = {
  file: string;
  name: string;
  tag: string;
  /** Written on a Svelte component's tag, where it arrives as an unscoped prop. */
  onComponent: boolean;
};

/** Every class name the app's markup wears, static and `class:` alike. */
function wornIn(file: string): Worn[] {
  return elementsOf(file).flatMap((el: Element) =>
    [...el.classes, ...el.stateClasses].map((name) => ({
      file,
      name,
      tag: el.tag,
      // `#Name` from `elementsOf`; `Foo.Bar` for a bits-ui compound like
      // `<DatePicker.Calendar>`, which renders a component just the same.
      onComponent: el.tag.startsWith("#") || el.tag.includes("."),
    }))
  );
}

const WORN = FILES.flatMap(wornIn);

/** Reach 1, read once per file rather than once per wearing. */
const SCOPED = new Map(
  [...SHEETS].map(([file, rules]) => [file, classNamesIn(rules)] as const)
);

/** Whether a scoped rule in the file names it — true even where it cannot land,
 *  which is the distinction the component-prop trap turns on. */
const scopedNames = (file: string) => SCOPED.get(file) ?? new Set<string>();

/** Whether any rule anywhere can land on this wearing of the name. */
function isReached(worn: Worn): boolean {
  if (APP.has(worn.name)) return true;
  if (GLOBAL.has(worn.name)) return true;
  if (SELECTED_BY_SPECS.has(worn.name)) return true;
  if (worn.onComponent) return false;
  return scopedNames(worn.file).has(worn.name);
}

describe("class names worn in src/ markup", () => {
  it("reads a population big enough to be the app's", () => {
    // Not a target, a floor: the failure this guards against is a reader that
    // silently stops finding markup and reports a clean tree it never read.
    expect(FILES.length).toBeGreaterThan(100);
    expect(new Set(WORN.map((w) => w.name)).size).toBeGreaterThan(700);
  });

  it("credits app.css, a :global anywhere, and a spec's selector", () => {
    // One live example of each reach, so a broken reader fails here and names
    // which of the four it lost rather than emptying the sweep quietly.
    expect(APP.has("main")).toBe(true);
    expect(GLOBAL.has("mt-4")).toBe(true);
    expect(SELECTED_BY_SPECS.has("db-badge")).toBe(true);
  });

  it("keeps fifteen names alive on reach 4 alone", () => {
    // What ADR-0097 §1's fourth reach is worth, priced rather than asserted:
    // the names no rule reaches that a spec steers by. Requiring a rule for
    // every worn name — the alternative the record refuses — convicts exactly
    // these, and the figure is pinned because the record quotes it.
    const specOnly = WORN.filter(
      (w) =>
        !APP.has(w.name) &&
        !GLOBAL.has(w.name) &&
        !(!w.onComponent && scopedNames(w.file).has(w.name)) &&
        SELECTED_BY_SPECS.has(w.name)
    ).map((w) => w.name);

    expect(new Set(specOnly).size).toBe(15);
  });

  it("does not credit a caller's scoped rule to a class it hands a component", () => {
    // The trap in full: a scoped rule and a component tag wearing its name are
    // not a match, and Svelte reports no warning either way.
    const card: Worn = {
      file: "src/lib/ui/Card.svelte",
      name: "card-pressable",
      tag: "#Card",
      onComponent: true,
    };
    expect(scopedNames(card.file).has(card.name)).toBe(true);
    expect(isReached(card)).toBe(false);
    expect(isReached({ ...card, tag: "button", onComponent: false })).toBe(
      true
    );
  });

  it("wears no class that no rule reaches", () => {
    const unreached = WORN.filter((w) => !isReached(w))
      .map(
        (w) =>
          `${w.file}  .${w.name}  <${w.tag}>` +
          (w.onComponent && scopedNames(w.file).has(w.name)
            ? "  (a scoped rule names it, and cannot reach a component's prop)"
            : "")
      )
      .filter((line, i, all) => all.indexOf(line) === i)
      .sort();

    expect(unreached).toEqual([]);
  });

  it("keeps the families an expression builds out of the count, and names them", () => {
    // `class="badge badge-{variant}"` names a family, not a class: no element
    // wears `badge-`, and no rule declares it. They are listed rather than
    // merely dropped, because a blind spot that nothing prints is one nobody
    // remembers is there.
    const families = [
      ...new Set(
        FILES.flatMap((file) =>
          elementsOf(file).flatMap((el) => el.dynamicClasses)
        )
      ),
    ].sort();

    expect(families).toEqual([
      "alert-{…}",
      "badge-{…}",
      "btn-{…}",
      "note-row{…}",
      "nutrient-{…}",
    ]);
    expect(WORN.map((w) => w.name)).not.toContain("badge-");
  });

  it("would convict four of the five families if the braces were merely stripped", () => {
    // The cost of the reader change, priced rather than asserted. Deleting the
    // braces and splitting — what `elementsOf` did before #376 — manufactures
    // one name per family, and four of the five reach no rule. This figure is
    // pinned because the arc's own lesson (#381) is that a number written into
    // prose and checked by nothing is the same rot as a dead class name: the
    // first two attempts at it here said "nine primitives" and "five", and both
    // were counting something other than what they claimed.
    const manufactured = [
      ...new Set(
        FILES.flatMap((file) =>
          elementsOf(file).flatMap((el) =>
            el.dynamicClasses.map((f) => f.replaceAll("{…}", ""))
          )
        )
      ),
    ].filter(Boolean);

    expect(manufactured.sort()).toEqual([
      "alert-",
      "badge-",
      "btn-",
      "note-row",
      "nutrient-",
    ]);

    // `note-row` is the one that escapes, and only because `NotesView` happens
    // to declare it `:global` for its own real use.
    expect(
      manufactured.filter((n) => !APP.has(n) && !GLOBAL.has(n)).sort()
    ).toEqual(["alert-", "badge-", "btn-", "nutrient-"]);
    expect(GLOBAL.has("note-row")).toBe(true);
  });
});
