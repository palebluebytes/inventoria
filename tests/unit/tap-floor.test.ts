/**
 * Every control in the app, and the box that actually takes the tap, measured
 * against `--tap-min` (ADR-0093 and #338; widened from fields to controls by
 * ADR-0098 and #361).
 *
 * `tap-targets.test.ts` measures the nav, the dock and the operator keys, and
 * says in its own docblock that a floor swept across the app is its own ticket.
 * This is that ticket. It differs from that file in three ways, each of which
 * is something #338's first sweep got wrong by not doing it:
 *
 * **It discovers its population rather than naming it.** A hand-written roster
 * is how the first sweep missed `ui/Checkbox` — the largest shortfall in the
 * app — and convicted two controls that were never targets. Every box under
 * `src/` that takes a tap is found here, so a new control is in this
 * measurement the day it is written.
 *
 * That predicate started as three tag names, and *that* was a roster wearing a
 * regex: it could see `ScaleTier`'s `.sb-factor` and not the toggle cell four
 * lines above it carrying the same wrong number. A finger does not know which
 * element it is landing on, so neither does this file (ADR-0098 §1).
 *
 * **It reads the markup, not only the CSS.** ADR-0093: a tap floor binds the
 * box that accepts the tap. `AmountField`'s `.num` is a 32px `<input>` and not
 * a target, because the `<label class="value">` around it is; `NutrientCard`'s
 * `.card-toggle` is a 1.2em checkbox at `opacity: 0` and not a target, because
 * the whole card is a `<label>`. Neither fact is in a stylesheet.
 *
 * **It measures twice.** `tap-targets.test.ts` names its own soft spot: it
 * assumes a field inherits `line-height: 1.5`, while a browser handing a form
 * control `line-height: normal` draws a shorter box and so a shorter field. A
 * figure clearing the floor on the first assumption and failing on the second
 * is not a pass, so a box must clear under the pessimistic reading or declare a
 * floor. A declared floor holds under both, which is the whole argument #336
 * made for `min-height` over padding.
 *
 * The example that made the case was `ItemManualForm`'s `.custom-select`, which
 * drew 49px optimistic and 43.6 pessimistic — level on the assumption and 4.4px
 * short in fact. It is history now: #378 retired that class, the last of the
 * seven selects went at #380, and #381 wrote the census that holds the
 * population at zero — so the figures survive here as the shape of the failure
 * and not as something this sweep still reads.
 *
 * A live one, so the argument keeps an example it can point at: `NotesView`'s
 * `input.item-input` reads **52.6 pessimistic (58 optimistic)**. The two
 * readings are 5.4px apart and the box stands 4.6px over the floor, so the
 * spread is wider than the clearance — an optimistic-only model would report
 * 10px of room on a box that has under 5, and the next padding change to it
 * would fail a finger while still reading level. That is the whole of why this
 * file measures twice, in a box that is in the tree today.
 *
 * **The model itself is `support/tap-floor.ts`.** What takes a tap, and how big
 * the box it draws is, are statements about CSS and about the platform; the
 * sweep below is a statement about `src/`. Splitting them is what this
 * repository does at a thousand lines, and the seam is the honest one: every
 * assertion here reads `src/` through the model and none of them reaches inside
 * it.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { appSheet, decl, rulesOf, styleOf } from "./support/stylesheet";
import {
  attr,
  declarationsOf,
  elementsOf,
  importedFrom,
  rulesFor,
  trackedSvelteFiles,
  type Element,
} from "./support/markup";
import {
  clears,
  drawsItsOwnBox,
  FIELD,
  HEIGHT_INPUTS,
  invisible,
  LIBRARY_CHROME,
  LIBRARY_TARGET,
  narrowness,
  partName,
  read,
  sheetOf,
  shortness,
  takesATap,
  TAP_MIN,
  type Reading,
} from "./support/tap-floor";

const FILES = trackedSvelteFiles();

/** `views/food/AmountField.svelte label.value` — short enough to read in a diff,
 *  and distinct enough that two boxes never share one line. A classless field
 *  borrows its nearest classed ancestor, because `FoodStager` has three of them
 *  wearing three different floors and a key of `svelte input` hides two. */
const name = (where: string, el: Element) => {
  const self = `${el.tag}${el.classes.map((c) => `.${c}`).join("")}`;
  const under = [...el.ancestors]
    .reverse()
    .find((a) => a.classes.length > 0)
    ?.classes.map((c) => `.${c}`)
    .join("");
  return (
    `${where.replace("src/lib/", "").replace("src/", "")} ` +
    (el.classes.length === 0 && under ? `${under} ${self}` : self)
  );
};

// ── what a target is ───────────────────────────────────────────────────────

/**
 * The boxes that activate one field.
 *
 * A `<label>` **wrapping** a field replaces it: the label's box contains the
 * field's, so flooring the label floors the tap and the field inside may be any
 * size at all — which is how `ui/Checkbox` and `AmountField` are built, and how
 * `NutrientCard` turns a whole card into one checkbox.
 *
 * A `<label for=…>` **beside** a field joins it instead of replacing it. Both
 * boxes activate the same control, and a group of activating regions is large
 * enough when *any* one of them is: a caption over a field is a bonus hit area,
 * and a bonus cannot be a defect. Requiring the other reading would mean every
 * form caption in the app stands 48px tall, which no guideline asks for and
 * which would be a worse design than the one it replaced.
 */
type Group = { where: string; primary: Element; boxes: Element[] };

function groupsIn(path: string): {
  groups: Group[];
  proxied: string[];
  elsewhere: Element[];
} {
  const elements = elementsOf(path);
  const rules = sheetOf(path);
  const groups: Group[] = [];
  const proxied: string[] = [];
  const elsewhere: Element[] = [];

  for (const el of elements) {
    if (!takesATap(el)) continue;
    if (!drawsItsOwnBox(el)) {
      elsewhere.push(el);
      continue;
    }

    const wrapping = [...el.ancestors].reverse().find((a) => a.tag === "label");
    const hidden = invisible(declarationsOf(rulesFor(rules, el).hits));
    if (hidden && !wrapping) {
      proxied.push(name(path, el));
      continue;
    }

    const id = attr(el, "id");
    const named =
      id === undefined
        ? undefined
        : elements.find((o) => o.tag === "label" && attr(o, "for") === id);

    // The field leads unless it has no box of its own to lead with, in which
    // case the label wrapping it is the only thing a finger can aim at.
    const primary = hidden && wrapping ? wrapping : el;
    const boxes = [el, wrapping, named].filter(
      (b): b is Element => b !== undefined
    );
    groups.push({ where: path, primary, boxes: [...new Set(boxes)] });
  }
  return { groups, proxied, elsewhere };
}

const SWEEP = (() => {
  const groups = new Map<string, Group>();
  const proxied: string[] = [];
  const elsewhere: { where: string; el: Element }[] = [];
  for (const file of FILES) {
    const found = groupsIn(file);
    proxied.push(...found.proxied);
    elsewhere.push(...found.elsewhere.map((el) => ({ where: file, el })));
    // One reading per distinct box. `MediaEngagementModal`'s two
    // `<select class="retro-select">` were one box wearing one rule, and saying
    // so twice adds nothing — which is why #380 took two fields out of this
    // sweep and moved the count by one. Past tense: the `retro-*` family is
    // extinct, and the example is kept because it is the clearest one this
    // sweep has produced, not because the class still exists.
    for (const g of found.groups) {
      const key = name(g.where, g.primary);
      if (!groups.has(key)) groups.set(key, g);
    }
  }

  const verdicts = new Map<
    string,
    {
      all: Reading[];
      primary: Reading;
      narrow: { prop: string; px: number } | null;
    }
  >();
  for (const [key, g] of groups) {
    // A box wrapping another bounds it, so a group is only narrow where every
    // box in it is — the same "any one of them carries the group" reading §2
    // gives height, in the one direction it also holds for width.
    const widths = g.boxes.map((b) =>
      narrowness(declarationsOf(rulesFor(sheetOf(g.where), b).hits))
    );
    verdicts.set(key, {
      all: g.boxes.map((b) => read(b, sheetOf(g.where))),
      primary: read(g.primary, sheetOf(g.where)),
      narrow: widths.every((w) => w !== null) ? widths[0] : null,
    });
  }
  return {
    groups,
    verdicts,
    elsewhere,
    proxied: [...new Set(proxied)].sort(),
  };
})();

/** What a group is worth: any one activating box that clears carries it, and
 *  where none does the field's own reading is what a failure should quote —
 *  the caption over it is a bonus hit area, never the thing to go and fix. */
const best = (readings: Reading[], primary: Reading) =>
  readings.find(clears) ?? primary;

const describeReading = (r: Reading) =>
  r.kind === "drawn"
    ? `${r.pessimistic} (${r.optimistic} optimistic)`
    : r.kind === "unstyled"
      ? "styled by nothing"
      : r.kind === "unreadable"
        ? r.why
        : `declares ${r.height}`;

const verdict = (v: { all: Reading[]; primary: Reading }) =>
  best(v.all, v.primary);

const tooNarrow = () =>
  [...SWEEP.verdicts]
    .filter(([, v]) => v.narrow !== null)
    .map(([key, v]) => `${key} — ${v.narrow!.prop}: ${v.narrow!.px}`)
    .sort();

const shortfalls = () =>
  [...SWEEP.verdicts]
    .filter(([, v]) => {
      const b = verdict(v);
      return b.kind === "drawn"
        ? b.pessimistic < TAP_MIN
        : b.kind === "unstyled";
    })
    .map(([key, v]) => `${key} — ${describeReading(verdict(v))}`)
    .sort();

const unreadable = () =>
  [...SWEEP.verdicts]
    .filter(([, v]) => verdict(v).kind === "unreadable")
    .map(([key, v]) => `${key} — ${describeReading(verdict(v))}`)
    .sort();

/**
 * A box a sanctioned argument covers, whichever of the three lists it is in.
 *
 * An exemption is a decision about the *box*, not about which way this model
 * happened to fail to clear it — and every entry below is a box that would read
 * `unreadable` on Monday and `drawn` on Tuesday if someone gave it a border,
 * which is not a difference an exemption should turn on.
 *
 * **The key is matched whole, not as a prefix.** A list entry is the part of a
 * line before its reading, so `startsWith` would let `button.tag` cover a
 * `button.tag-total` nobody has argued for — a shortfall arriving at no cost in
 * this file, which is the one property ADR-0093 §6 exists to guarantee.
 */
const sanctioned = (box: string) =>
  SHORT_BY_ARGUMENT.includes(box.split(" — ")[0]);

/**
 * A declaration inside an at-rule is not one this model applies, and until now
 * it was not one the reader mentioned either: `rulesFor` dropped every rule
 * with an enclosing at-rule and recorded nothing, so a floor that a breakpoint
 * took away would have passed here in silence. That is the failure ADR-0093 §5
 * names — a sweep answering "no" where it means "I cannot tell" — arriving in
 * the one place §6 says an exemption may never live.
 *
 * It is a hole rather than a defect: nine at-rule rules in `src/` touch a
 * height input and none of them lands on a field. Three land on a nav item, a
 * button and a calendar day, which is [#361](https://github.com/palebluebytes/inventoria/issues/361)'s
 * population, so it is one sweep away from being real. It is also the machinery
 * [#363](https://github.com/palebluebytes/inventoria/issues/363) needs before a
 * pointer-conditional floor can be honoured **or** refused: today such a floor
 * would pass unnoticed, which is neither.
 */
describe("a conditional declaration is reported, never dropped", () => {
  const probe = (classes: string[]): Element => ({
    tag: "input",
    classes,
    dynamicClasses: [],
    stateClasses: [],
    attrs: "",
    raw: "",
    ancestors: [],
    children: 0,
    delegates: false,
  });

  const WIDE = "@media (min-width: 768px)";
  const withOverride = `.probe { min-height: var(--tap-min); }
    ${WIDE} { .probe { min-height: 24px; } }`;

  it("hands back the at-rule rules a box matches", () => {
    const { hits, conditional } = rulesFor(
      rulesOf(withOverride),
      probe(["probe"])
    );
    expect(hits).toHaveLength(1);
    expect(conditional.map((r) => r.at)).toEqual([WIDE]);
  });

  it("stays quiet about an at-rule rule the box does not match", () => {
    const elsewhere = `${WIDE} { .other { min-height: 24px; } }`;
    expect(rulesFor(rulesOf(elsewhere), probe(["probe"])).conditional).toEqual(
      []
    );
  });

  it("declines a box whose floor a breakpoint can take away", () => {
    expect(read(probe(["probe"]), rulesOf(withOverride))).toEqual({
      kind: "unreadable",
      why: `conditional on ${WIDE}`,
    });
  });

  it("reads a box whose conditional rule says nothing about height", () => {
    // The nine in `src/` are mostly this, and a box is not unreadable because
    // a breakpoint recolours it. Only a property the model walks can move the
    // number, so only those make the reading conditional.
    const cosmetic = `.probe { min-height: var(--tap-min); }
      ${WIDE} { .probe { color: red; } }`;
    expect(read(probe(["probe"]), rulesOf(cosmetic))).toEqual({
      kind: "declared",
      height: TAP_MIN,
    });
  });
});

/**
 * ADR-0094: a tap floor takes no condition, because no query knows which
 * pointer is in use.
 *
 * [#337](https://github.com/palebluebytes/inventoria/issues/337) decision 10
 * proposed letting a hit area go under `--tap-min` where `@media (hover: hover)
 * and (pointer: fine)` "proves there is no finger". It proves no such thing:
 * `hover` and `pointer` describe the **primary** input mechanism, so a
 * touchscreen laptop driven from its trackpad matches that query while a finger
 * is six inches from the glass. `not (any-pointer: coarse)` is the honest form
 * and answers a different question — whether touch hardware is *attached* — so
 * the thing a floor actually depends on is unaskable in CSS.
 *
 * The rule that follows is therefore about **direction**, not about the pointer
 * features themselves. A pointer condition may *add* an affordance and may
 * never *subtract* a floor: a machine wrongly told it cannot hover loses a
 * lift, and a machine wrongly told it has no finger loses a target. `ui/Card`'s
 * `@media (hover: hover)` is the sanctioned shape and passes here, because it
 * declares a `transform` and a `box-shadow` and moves no height.
 *
 * **Its population is the whole tree, not this file's fields.** The densest
 * candidates a relaxation would ever have reached — a nav item, a calendar day,
 * a toggle cell — are controls rather than fields, which is
 * [#361](https://github.com/palebluebytes/inventoria/issues/361)'s sweep and not
 * yet written. Keying this rule on the fields above would leave exactly those
 * boxes open, so it reads every stylesheet in `src/` and costs nothing extra to
 * do so.
 */
describe("no pointer query moves a height", () => {
  /** Every stylesheet in the tree as text: a component's `<style>` block, or a
   *  plain `.css` file whole. A component with no `<style>` contributes "". */
  const SHEETS = [
    ...FILES.map((file) => ({
      file,
      css: readFileSync(file, "utf8").includes("<style>") ? styleOf(file) : "",
    })),
    ...execFileSync("git", ["ls-files", "src/**/*.css", "src/*.css"], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((file) => ({
        file,
        css: readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""),
      })),
  ];

  /** `hover`, `any-hover`, `pointer`, `any-pointer` — the four features that
   *  describe a pointing device. `prefers-*` and the width features are not
   *  here: this rule is about the claim "there is no finger", and only these
   *  four purport to make it. */
  const POINTER_FEATURE = /\b(?:any-)?(?:hover|pointer)\s*:/;

  /**
   * Every `@media` block in a sheet, with the body it opens.
   *
   * Read off the raw text rather than through `rulesOf`, which flattens a rule
   * to its *innermost* enclosing at-rule and so loses a pointer query wrapped in
   * a breakpoint. The scan finds a nested `@media` on its next pass, so both
   * orders are seen.
   */
  function mediaBlocks(css: string): { prelude: string; body: string }[] {
    const out: { prelude: string; body: string }[] = [];
    const at = /@media\b/g;
    let found: RegExpExecArray | null;
    while ((found = at.exec(css)) !== null) {
      const open = css.indexOf("{", found.index);
      if (open === -1) break;
      let depth = 1;
      let j = open + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}") depth--;
        j++;
      }
      out.push({
        prelude: css.slice(found.index, open).trim().replace(/\s+/g, " "),
        body: css.slice(open + 1, j - 1),
      });
    }
    return out;
  }

  const POINTER_QUERIES = SHEETS.flatMap(({ file, css }) =>
    mediaBlocks(css)
      .filter((b) => POINTER_FEATURE.test(b.prelude))
      .map((b) => ({ file, ...b }))
  );

  it("finds the pointer queries at all — a sweep matching nothing proves nothing", () => {
    // The rule below asserts an empty list, so without this a regex that
    // stopped matching would pass it over an empty tree for ever.
    expect(POINTER_QUERIES.length).toBeGreaterThanOrEqual(1);
    expect(POINTER_QUERIES.map((q) => q.file)).toContain(
      "src/lib/ui/Card.svelte"
    );
  });

  it("lets a pointer query add an affordance", () => {
    // The one in the tree, named so this is a statement about the app rather
    // than about a probe. It lifts a tile on hover and moves no height.
    const card = POINTER_QUERIES.filter(
      (q) => q.file === "src/lib/ui/Card.svelte"
    );
    expect(card.map((q) => q.prelude)).toEqual(["@media (hover: hover)"]);
  });

  it("lets no pointer query declare a height input", () => {
    // The body is read as text, not as rules: a pointer query may hold
    // declarations directly under CSS nesting or wrap selector blocks, and
    // over-reading here can only manufacture a failure, never hide one. The
    // leading character class keeps `line-height` from answering for `height`
    // and a `--card-height` custom property from answering for either.
    const offenders = POINTER_QUERIES.flatMap((q) =>
      HEIGHT_INPUTS.filter((prop) =>
        new RegExp(`(?:^|[;{}\\s])${prop}\\s*:`).test(q.body)
      ).map((prop) => `${q.file}: ${q.prelude} declares ${prop}`)
    );

    expect(offenders).toEqual([]);
  });
});

/**
 * Where a control's box is drawn is not always where its size is written.
 *
 * Svelte scopes a component's rules to that component's own elements, so the
 * one way a call site can resize a box another file draws is `:global(…)` —
 * which makes every cross-component reshaping in the app a rule of one shape,
 * findable without resolving a single import. Three were doing it below the
 * floor when this clause was written: `ScaleTier` held a `ToggleGroup` cell at
 * Apple's 44, and `EventRecurrenceField` and `ScheduleRuleEditor` each held a
 * `ui/Button` at 32 and 44.
 *
 * **It reads which classes the rule names, not which file it sits in.** A
 * `:global` rule sizing an `<svg>` inside a button, a meter's track or a
 * visually-hidden label is not this sweep's business, and there are more of
 * those in `src/` than of the other kind — so the rule is convicted only where
 * some element in the tree wearing its rightmost compound is a control. That
 * index is the whole tree, because the point of `:global` is that it leaves the
 * file it is written in.
 */
describe("no rule reaches across a component and shrinks a control", () => {
  /** Every element in the tree that wears at least one class, by class name. */
  const WEARERS = (() => {
    const by = new Map<string, Element[]>();
    for (const file of FILES) {
      for (const el of elementsOf(file)) {
        for (const cls of el.classes) {
          by.set(cls, [...(by.get(cls) ?? []), el]);
        }
      }
    }
    return by;
  })();

  /**
   * The elements a selector's rightmost compound can land on, anywhere.
   *
   * **One class of the compound is enough**, and that is the difference between
   * this and `matches`. A compound crossing a component boundary is *written*
   * across it: `:global(.btn.remove-btn)` is `ui/Button`'s `.btn` and the call
   * site's `remove-btn`, and no single element in this tree's markup wears both
   * — `.btn` arrives from a prop the primitive interpolates. Requiring all of
   * them is how a first pass at this clause found the two `ToggleGroup` cells
   * and neither of the reshaped Buttons, which are the loudest cases it exists
   * for.
   *
   * It over-reads, deliberately, and the over-reading is bounded: what the
   * match decides is only whether the *rule* is about a control, and the size it
   * is convicted on is read from the rule itself, so the worst it can do is ask
   * an author not to write a sub-floor size in a `:global` rule that also names
   * a control's class.
   */
  function reaches(selector: string): Element[] {
    const compound = selector
      .replace(/:global\(([^)]*)\)/g, "$1")
      .trim()
      .split(/[\s>+~]+/)
      .pop()!;
    const classes = [...compound.matchAll(/\.([\w-]+)/g)].map((c) => c[1]);
    if (classes.length === 0) return [];
    const tag = compound.match(/^[a-zA-Z][\w-]*/)?.[0];
    return classes
      .flatMap((c) => WEARERS.get(c) ?? [])
      .filter((el) => tag === undefined || tag === el.tag);
  }

  const OFFENDERS = FILES.flatMap((file) =>
    sheetOf(file)
      .filter((rule) => rule.selectors.some((s) => s.includes(":global(")))
      .flatMap((rule) => {
        // Both axes, read off the rule alone: a `:global` rule is convicted on
        // what it *declares*, never on what the box it lands on adds up to —
        // the arithmetic belongs to the box's own file, which has already had
        // its turn above.
        const d = declarationsOf([rule]);
        const shrunk = narrowness(d) ?? shortness(d);
        if (shrunk === null) return [];
        const said = `${shrunk.prop}: ${shrunk.px}`;
        return rule.selectors
          .filter((s) => s.includes(":global(") && reaches(s).some(takesATap))
          .map((s) => `${file.replace("src/lib/", "")} ${s} — ${said}`);
      })
  ).sort();

  it("finds the cross-component rules at all", () => {
    // The index is the load-bearing half and an empty one would pass the
    // assertion below for ever, so the wearers are counted before they are used.
    expect(WEARERS.size).toBeGreaterThan(500);
    // The compound this clause was written for, and the one a stricter reading
    // missed: `.btn` is `ui/Button`'s and `remove-btn` is the call site's.
    expect(
      reaches(":global(.btn.remove-btn)")
        .filter(takesATap)
        .map((el) => el.tag)
    ).toContain("#Button");
  });

  it("leaves none of them holding a control under the floor", () => {
    expect(OFFENDERS).toEqual([]);
  });
});

/**
 * The two rosters of library parts, held to the tree.
 *
 * `LIBRARY_TARGET` and `LIBRARY_CHROME` are the one hand-written list in this
 * file, and they are hand-written because bits-ui's markup is not in this
 * repository: nothing under `src/` says a `Calendar.Day` is a `<button>` and a
 * `Calendar.HeadCell` is a `<th>`. What stops the list rotting the way #338's
 * roster of fields did is that it must *cover* the tree — a part nobody has
 * classified fails here rather than being quietly skipped, which is the only
 * property the discovered population had that a roster normally cannot.
 */
describe("every library part is classified", () => {
  const PARTS = [
    ...new Set(
      FILES.flatMap((file) =>
        elementsOf(file)
          .map(partName)
          .filter((p): p is string => p !== null)
      )
    ),
  ].sort();

  it("finds the parts at all", () => {
    expect(PARTS).toContain("ToggleGroup.Item");
    expect(PARTS.length).toBeGreaterThan(40);
  });

  it("puts each one in exactly one roster", () => {
    expect(
      PARTS.filter((p) => LIBRARY_TARGET.has(p) === LIBRARY_CHROME.has(p))
    ).toEqual([]);
  });

  it("keeps no roster entry the tree has stopped using", () => {
    // A dead entry is how a roster starts describing an app that has moved on,
    // and the part it names may have been replaced by one nobody classified.
    const listed = [...LIBRARY_TARGET, ...LIBRARY_CHROME].sort();
    expect(listed.filter((p) => !PARTS.includes(p))).toEqual([]);
  });
});

/**
 * A component call site takes a tap and draws no box, so this sweep sends it
 * away — and that is only honest if the box it *does* draw is one the sweep
 * measures somewhere else.
 *
 * `<Button class="remove-btn" onclick=…>` is a control by every test this file
 * applies, and asking `EventRecurrenceField`'s stylesheet how tall it stands is
 * asking the wrong file. The right one is named by the import, so the import is
 * what this follows: every component that takes a tap must resolve to a file
 * under `src/` that contributes at least one measured box. Without this the
 * `elsewhere` bucket would be a place for a control to disappear into.
 */
describe("a component that takes a tap draws a box this sweep measures", () => {
  const MEASURED = new Set([...SWEEP.groups.values()].map((g) => g.where));

  /** Every call site resolved once: which file hands the tap on, to what. */
  const EDGES = SWEEP.elsewhere.map(({ where, el }) => ({
    where,
    tag: el.tag,
    to: importedFrom(where, el.tag),
  }));

  /**
   * Files that draw a measured box, or hand the tap to one that does.
   *
   * The hand-off is real and one level of it is not enough: `FoodItemRow` is a
   * `<Row onclick=…>` and nothing else, so it draws no box of its own and is
   * still perfectly answerable — `ui/Row.svelte` draws it. A fixpoint rather
   * than a walk, so a cycle terminates instead of recursing.
   */
  const DRAWS = (() => {
    const reached = new Set(MEASURED);
    for (let grew = true; grew; ) {
      grew = false;
      for (const edge of EDGES) {
        if (reached.has(edge.where)) continue;
        if (edge.to !== null && reached.has(edge.to)) {
          reached.add(edge.where);
          grew = true;
        }
      }
    }
    return reached;
  })();

  const UNRESOLVED = [
    ...new Set(
      EDGES.map(({ where, tag, to }) => {
        if (to === null) return `${where} ${tag} — no import names it`;
        if (!to.endsWith(".svelte")) {
          return `${where} ${tag} — comes from ${to}, which is not a component`;
        }
        return DRAWS.has(to)
          ? ""
          : `${where} ${tag} — ${to} draws no box this sweep reads`;
      })
    ),
  ]
    .filter(Boolean)
    .sort();

  it("finds the call sites at all", () => {
    expect(SWEEP.elsewhere.length).toBeGreaterThan(40);
  });

  it("resolves every one of them to a file with a measured box", () => {
    expect(UNRESOLVED).toEqual([]);
  });
});

// ── the guard ──────────────────────────────────────────────────────────────

describe("the sweep itself", () => {
  it("finds every control in the app, and each one's target", () => {
    // Asserted so that a regex quietly matching nothing — the way a sweep dies
    // — fails here rather than reporting a level tree.
    // Both root shells included: `src/App.svelte` and `src/Rations.svelte` sit
    // at the top of `src/`, which the `src/**` glob alone does not reach.
    expect(FILES).toContain("src/App.svelte");
    expect(FILES).toContain("src/Rations.svelte");
    expect(FILES.length).toBeGreaterThan(100);
    // A floor just under the population, not the population — it exists so that
    // a regex matching nothing fails here, and the split below is what has to
    // be argued with when the count moves. It followed the count *down* through
    // the convergence tickets that retired hand-rolled fields (50 at #338, 42
    // at #374, 37 at #375, 35 at #379, 34 at #380) and jumped to 165 at #361,
    // when the predicate stopped being three tag names: a button, a toggle
    // cell, a calendar day and a nav item were always in the app and never in
    // this number.
    expect(SWEEP.groups.size).toBeGreaterThan(160);
  });

  /**
   * The box that proved `elementsOf` was truncating.
   *
   * `CategoryPicker`'s suggestion row is a `<li role="option">` whose
   * `onmousedown` carries a comment reading "the input's blur". The apostrophe
   * opened a quote the tag walk never closed, so the scan ran off the end of the
   * file — dropping this element and the three below it from **every** census in
   * this repository, which is how a 44px option row survived #338, #376 and
   * #381. It is asserted as a member here rather than as a fixture in
   * `markup.ts`, because what has to keep working is that the app's own rows are
   * seen, not that a probe string parses.
   */
  it("sees a control whose handler holds an apostrophe", () => {
    expect([...SWEEP.verdicts.keys()]).toContain(
      "views/food/CategoryPicker.svelte .catpick-list li"
    );
  });

  it("has no field styled from app.css, so a component's own sheet is the whole answer", () => {
    // Every figure here is derived from one component's `<style>` block. A
    // global `input` rule would sit under all of them and invalidate the lot,
    // silently — so the absence is asserted rather than assumed.
    const global = appSheet().filter((r) =>
      r.selectors.some((s) => /(^|[\s>+~])(input|textarea|select)\b/.test(s))
    );

    expect(global).toEqual([]);
  });

  /**
   * The docblock's live example, pinned so the prose cannot rot the way the
   * `.custom-select` figures beside it did when that class was deleted. Two
   * readings 5.4px apart on a box standing 4.6px over the floor: the spread is
   * wider than the clearance, which is the whole case for measuring twice.
   *
   * If this fails, the example moved. Re-read the box and rewrite the docblock
   * with what it says now; do not relax the assertion, because a docblock
   * quoting a figure nothing checks is what this file already fixed once.
   */
  it("keeps the docblock's live example honest", () => {
    expect(
      SWEEP.verdicts.get("views/NotesView.svelte input.item-input")?.primary
    ).toEqual({ kind: "drawn", optimistic: 58, pessimistic: 52.6 });
  });

  it("sets aside the fields that are drawn invisible, whose proxies are #361's", () => {
    // A file input at `opacity: 0` behind a button is a real control with no
    // box. Measuring it would report a 21px shortfall that no finger can reach,
    // and the button that *is* reachable is not a field, so it belongs to the
    // control sweep rather than to this one.
    expect(SWEEP.proxied).toEqual(PROXIED);
  });
});

describe("the floor, swept", () => {
  /**
   * The whole of #338, in one line.
   *
   * This began as a measurement — the twenty-one shortfalls recorded at their
   * true length, so that each fix commit moved one out and the history shows
   * the tree coming level, which is the shape `tap-targets.test.ts` uses when
   * it calls itself "a measurement, not a guard". It is a guard now.
   */
  it("leaves no box that takes a tap standing under the floor", () => {
    expect(shortfalls().filter((box) => !sanctioned(box))).toEqual([]);
  });

  /**
   * The same floor on the other axis.
   *
   * #338 never needed it: a field runs the width of its form, so the only
   * dimension that could fail a finger was height. An icon control is square,
   * and a square held at 30, 32, 36, 40 or 44 fails on the axis this file was
   * not reading — `CategoryPicker`'s chip remove, `EventRecurrenceField`'s day,
   * `ScheduleRuleEditor`'s counter, `FoodStager`'s skip. `narrowness` says what
   * counts as a claim about width and what does not.
   */
  it("leaves no box that takes a tap narrower than the floor", () => {
    expect(tooNarrow().filter((box) => !sanctioned(box))).toEqual([]);
  });

  /**
   * Boxes whose height this model cannot derive — a container taking its height
   * from children the model does not walk, or a selector it cannot resolve.
   *
   * These are **not** passing, and the list is empty rather than tolerated. A
   * declared floor answers the question the arithmetic cannot, which is why the
   * fix for an entry here was always the same as the fix for a shortfall:
   * `.nutrient-card` and `.af-row` both clear the floor comfortably and both
   * now say so, because a true thing that cannot be shown is not yet proved.
   */
  it("has no box it cannot read", () => {
    expect(unreadable().filter((box) => !sanctioned(box))).toEqual([]);
  });

  /**
   * Shortfalls with an argument for standing short. Empty, and meant to stay
   * that way: the one candidate #338 weighed — the read-along form's density,
   * twenty nutrient rows paying 8px each — dissolved on measurement, because
   * `.cf-row` already stood 48px tall and the space was already spent.
   *
   * It lives here rather than in a CSS comment because `styleOf` strips
   * comments before the sweep reads a rule, so an argument written beside the
   * declaration is invisible to the test that would have to honour it. An
   * exemption costs a diff in this file, which is the point.
   */
  it("sanctions six shortfalls, and names the two arguments", () => {
    // The list is asserted whole rather than counted, because an exemption that
    // can be added without editing this assertion is an exemption that costs no
    // diff — which is the one thing ADR-0093 §6 says it may never do.
    expect(SHORT_BY_ARGUMENT).toEqual([
      "views/food/FoodCard.svelte button.origin-badge",
      "views/food/FoodCard.svelte button.tag-dietary",
      "views/food/NovaBadge.svelte button.nova-badge",
      "views/food/SourceTag.svelte button.tag",
      "views/food/FoodStager.svelte button.link",
      "views/items/ItemImportPanel.svelte button.text-btn.ml-2",
    ]);
  });

  /**
   * What carries each box, so the guard says something beyond "nothing is
   * broken". A box passing on arithmetic alone is one whose padding happens to
   * add up, and the next type-step change moves it; a box passing on a declared
   * floor holds under both line-height readings and under an edit. The split is
   * recorded because a drift towards the first column is the failure this file
   * exists to catch early.
   *
   * The total is a population count and moves when the population does. It fell
   * from 50 to 42 at #374, which converged nine hand-rolled `<textarea>` skins
   * onto `ui/Textarea`: nine boxes left the sweep and the primitive's one
   * arrived, and the primitive declares its floor, which is the direction this
   * assertion wants.
   *
   * It fell again from 42 to 37 at #375, and every one of the five was `drawn`,
   * so the `declared` column did not move at all. Named, because a rebaselined
   * count that cannot say what left it is a bulk accept:
   *
   *   views/food/FoodSettingsSheet.svelte  input.retro-input.full-width
   *   views/food/FoodSettingsSheet.svelte  input.retro-input.has-reveal
   *   views/media/MediaEngagementModal.svelte  input.retro-input
   *   views/media/MediaIngestModal.svelte  input.retro-input
   *   views/media/MediaSettingsSheet.svelte  input.retro-input.has-reveal
   *
   * Five keys for seven fields: three of `MediaEngagementModal`'s wore one
   * class, and one reading per distinct box is what this file records. No box
   * arrived to replace them — `ui/Input`'s own was already counted, and it is
   * in the `declared` column.
   *
   * #378 moved neither column: `ItemManualForm`'s `select.custom-select` left
   * and `ui/Select`'s own `select.select` arrived in its place, both in the
   * `declared` column. A one-for-one swap is invisible in these two numbers,
   * which is why it is written down here rather than inferred from them.
   *
   * All five stood at **61.6px pessimistic (67 optimistic)**, well clear of the
   * floor, so this is not a shortfall being fixed. It is the second thing this
   * split was written to watch: they cleared on arithmetic — `--space-s` above
   * and below a `--step-0` line box — and a box passing that way is one whose
   * padding happens to add up. The `--tap-min` those fields stand on now is
   * declared, and they are visibly shorter for it.
   *
   * It fell again from 37 to 35 at #379, and both boxes were `declared`, so
   * only that column moved:
   *
   *   views/habits/HabitDetailView.svelte  input.input-number-brutal
   *   views/habits/HabitDetailView.svelte  select.select-brutal
   *
   * Two keys for five fields — four selects and one number field sharing one
   * rule, which was `ui/Input`'s `.input` hand-copied (#362, and the note in
   * `tap-targets.test.ts` that named this pair as the nearest of the twelve
   * #336 left standing). Both wearers went together on purpose: porting the
   * selects alone would have split the rule and kept half the copy. No box
   * arrived to replace them, because `ui/Input`'s and `ui/Select`'s own were
   * already counted, both in the `declared` column.
   *
   * It fell once more, 35 to 34 at #380, and the one box was `drawn`:
   *
   *   views/media/MediaEngagementModal.svelte  select.retro-select
   *
   * One key for two fields, the last of the `retro-*` family. It stood at
   * **61.6px pessimistic (67 optimistic)** — the same reading as the five
   * `.retro-input` boxes above, because it was the same padding on the same
   * type step, which is what a family of hand-copied skins looks like from
   * here. Clear of the floor, so this is not a shortfall being fixed; it is a
   * box that cleared on arithmetic leaving, which is the other thing this split
   * watches. No box arrived: `ui/Select`'s own has been counted since #378.
   *
   * Then it went 34 → 165 at #361, and the shape of the split changed with it.
   * The 131 boxes that arrived are the ones a predicate of three tag names
   * could never see: the native controls, the library-rendered cells and days,
   * and the nav. One of them arrived twice over: `CategoryPicker`'s
   * `<li role="option">` was invisible to `elementsOf` itself until this ticket
   * fixed the walk that an apostrophe in a handler's comment was truncating. Ninety of them were short, unreadable, or both, and the fix
   * was the same declaration nearly every time — which is why `declared` now
   * carries 133 of 165 rather than the 25 of 34 it carried when this file knew
   * only about fields. `drawn` is the column to watch: every box in it clears
   * on padding that happens to add up.
   *
   * A third column exists now, and it is meant to stay at six. `sanctioned` is
   * `SHORT_BY_ARGUMENT`'s length by construction, so a seventh entry moves this
   * assertion as well as that list — two diffs for one exemption, deliberately.
   *
   * It rose 133 → 134 at #416, and by **one** box rather than the two the
   * ticket projected. The day's five way-in controls left the meal header for a
   * bar of their own (ADR-0101 §1), so `WayInRail`'s cell and `DailyDashboard`'s
   * `.way-in` are the same `ui/Button` in a new place — and a `ui/Button` is
   * counted once, at the primitive, never per call site. What actually arrived
   * is the tab: `WayInBar`'s `#Tabs.Trigger.wib-tab`, a bits-ui element this
   * sweep reads directly, `declared` on `min-height: var(--tap-min)` like every
   * other library-rendered cell in the list. The ticket's second box was the
   * prototype's own variant switcher, which does not ship.
   *
   * It fell 134 → 133 at #384, and the direction is the point. Two
   * `.reveal-toggle` rules — one in `FoodSettingsSheet`, one in
   * `MediaSettingsSheet`, byte-identical down to the comment explaining the
   * floor — became `ui/SecretField`'s one. Both were already `declared` on the
   * same token, so nothing about the floor itself moved; what moved is how many
   * boxes have to be kept level. That is ADR-0093's Consequences read forwards
   * rather than backwards: a count falling here is a copy that can no longer
   * miss a fix.
   *
   * Then 133 → 131 at #316, and the arithmetic is worth writing down because
   * "five triggers became one component" would predict −4. Five disclosures
   * moved onto `ui/Disclosure`, which adds one box here, and three keys left:
   * `DailyDashboard`'s `.aggregates-toggle`, `AllergenSafetyBlock`'s
   * `.info-btn` and `EndingLine`'s `.plain`. The other two left no key at all.
   * `FoodView`'s `.header-icon-btn` is worn by three buttons and keyed once, so
   * the two that stayed plain keep it; `NutritionTargetEditor`'s `.info-btn` is
   * worn by the section-help ⓘ *and* by the rationale ⓘ beside it, which is a
   * plain `<button>` opening a sheet rather than a disclosure, so that key
   * stays too. A key here is a distinct box, not a call site — which is the
   * same reason #416 moved this figure by one when it looked like two.
   */
  it("carries most of them on a declared floor, not on arithmetic", () => {
    const how = { declared: 0, drawn: 0, sanctioned: 0 };
    for (const [key, v] of SWEEP.verdicts) {
      const b = verdict(v);
      if (sanctioned(key)) how.sanctioned++;
      else if (b.kind === "declared") how.declared++;
      else if (b.kind === "drawn") how.drawn++;
    }

    expect(how).toEqual({ declared: 131, drawn: 26, sanctioned: 6 });
    // Every box lands in exactly one column. Without this the two figures above
    // could both be right while a box fell out of the sweep between them.
    expect(how.declared + how.drawn + how.sanctioned).toBe(SWEEP.groups.size);
  });
});

/**
 * Shortfalls with an argument for standing short.
 *
 * #338 left this empty and meant it to stay that way. Widening the population
 * from fields to controls found two classes of box the floor cannot simply be
 * applied to, and both arguments are WCAG 2.5.8's own exceptions rather than a
 * plea — which matters, because "this one is awkward" is what an exemption list
 * degenerates into if the first entry is allowed to be that.
 *
 * **The four badge-marks** (`SourceTag`, `NovaBadge`, and `FoodCard`'s edit
 * origin and dietary marks) are ~14px tall and sit in one wrapped, right-
 * aligned cluster on a food card. Flooring them is *possible* — the 9px gap
 * means four 48px targets would not overlap — and it costs about 34px on every
 * row of the densest list in the app, to enlarge four controls whose whole job
 * is to open an explainer. The real defect is upstream and is a naming one:
 * ADR-0040 says a badge is a status mark and a Button is the control, and these
 * four are badges wearing an `onclick`. Growing them would harden the mistake
 * into layout. Filed as #388, which is where a change of role belongs.
 *
 * **The two inline links** are `<button>`s laid out *within a line of running
 * text* — "No result? Add a custom entry." inside a hint paragraph, and "Create
 * manually instead" after an Alert's message. WCAG 2.5.8 exempts a target whose
 * size is constrained by the line-height of the non-target text around it, by
 * name, and for the same reason ADR-0093 §2 refuses to floor a `<label for>`
 * caption: the fix would be a 48px word in the middle of a sentence, which no
 * guideline asks for and which reads worse than what it replaced.
 *
 * It lives here rather than in a CSS comment because `styleOf` strips comments
 * before the sweep reads a rule, so an argument written beside the declaration
 * is invisible to the test that would have to honour it. An exemption costs a
 * diff in this file, which is the point.
 */
const SHORT_BY_ARGUMENT: string[] = [
  "views/food/FoodCard.svelte button.origin-badge",
  "views/food/FoodCard.svelte button.tag-dietary",
  "views/food/NovaBadge.svelte button.nova-badge",
  "views/food/SourceTag.svelte button.tag",
  "views/food/FoodStager.svelte button.link",
  "views/items/ItemImportPanel.svelte button.text-btn.ml-2",
];

/** Fields drawn invisible behind a visible proxy. All four are the same shape:
 *  a file `<input>` at `opacity: 0` that a `<button>` clicks for it. */
const PROXIED: string[] = [
  "views/food/FoodStager.svelte input.hidden-file-input",
  "views/food/ManualEntryFlow.svelte input.hidden-file-input",
  "views/food/RecipeBuilder.svelte input.hidden-file",
  "views/ledger/LedgerImport.svelte input.hidden-file-input",
];

/** No entry, and no `SHORTFALLS`/`UNREADABLE` roster either: the lists this
 *  file opened with were the work #338 had to do, and the assertions above name
 *  the empty set directly now that it is done. */
