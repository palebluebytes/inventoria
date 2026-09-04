/**
 * Every text field in the app, and the box that actually takes the tap,
 * measured against `--tap-min` (ADR-0093, #338).
 *
 * `tap-targets.test.ts` measures the nav, the dock and the operator keys, and
 * says in its own docblock that a floor swept across the app is its own ticket.
 * This is that ticket. It differs from that file in three ways, each of which
 * is something #338's first sweep got wrong by not doing it:
 *
 * **It discovers its population rather than naming it.** A hand-written roster
 * is how the first sweep missed `ui/Checkbox` — the largest shortfall in the
 * app — and convicted two controls that were never targets. Every `<input>`,
 * `<textarea>` and `<select>` under `src/` is found here, so a new field is in
 * this measurement the day it is written.
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
 * is not a pass — `.custom-select` is 49px optimistic and 43.6 pessimistic — so
 * a box must clear under the pessimistic reading or declare a floor. A declared
 * floor holds under both, which is the whole argument #336 made for
 * `min-height` over padding.
 *
 * The model, stated so it can be argued with:
 *
 *   height = 2 × border + 2 × vertical padding + the line box,
 *
 * tokens at their `clamp()` floor — the tightest a phone ever draws them — and
 * the line box being the type step times either the declared line-height, the
 * inherited 1.5 (optimistic), or 1.2 (pessimistic, a UA's `normal`, which
 * applies only where the rule declares none since a declared one is honoured).
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  appSheet,
  decl,
  rulesOf,
  styleOf,
  tokenOf,
  tokenPx,
  type Rule,
} from "./support/stylesheet";
import {
  attr,
  declarationsOf,
  elementsOf,
  rulesFor,
  type Element,
} from "./support/markup";

const TAP_MIN = tokenPx("--tap-min");

/** A UA's `line-height: normal` on a form control, near enough. It only ever
 *  makes a box shorter than the inherited 1.5, so using it as the pessimistic
 *  reading cannot manufacture a shortfall that no browser has. */
const UA_LINE_HEIGHT = 1.2;

const FILES = execFileSync("git", ["ls-files", "src/**/*.svelte"], {
  encoding: "utf8",
})
  .trim()
  .split("\n");

const FIELD = /^(input|textarea|select)$/;

/** The document's own type step and line-height, inherited by anything whose
 *  own rule declares none. */
const ROOT = (() => {
  const root = appSheet().filter(
    (r) => r.at === null && r.selectors.includes(":root")
  );
  const size = root
    .map((r) => decl(r, "font-size"))
    .filter(Boolean)
    .pop()!;
  const height = root
    .map((r) => decl(r, "line-height"))
    .filter(Boolean)
    .pop()!;
  return {
    fontSize: tokenPx(size.match(/--step-[\w-]+/)![0]),
    lineHeight: Number(height),
  };
})();

/** An `--edge*` token's width. They are full shorthands with the ink baked in,
 *  so the width is read off the front rather than through `tokenPx`. */
function edgePx(name: string): number | null {
  const width = tokenOf(name).match(/^([\d.]+)px solid/);
  return width ? Number(width[1]) : null;
}

/** A length as written — a token, px, rem, `none`, `0` — or null where it is
 *  something this model cannot turn into a number (`100%`, `auto`, `1.2em`). */
function lengthPx(value: string | undefined): number | null {
  if (value === undefined) return null;
  const written = value.trim();
  if (written === "none" || written === "0") return 0;
  const token = written.match(/^var\((--[\w-]+)\)$/);
  if (token) {
    if (token[1].startsWith("--edge")) return edgePx(token[1]);
    return /^clamp|^[\d.]+(rem|px)$/.test(tokenOf(token[1]))
      ? tokenPx(token[1])
      : null;
  }
  const px = written.match(/^([\d.]+)px$/);
  if (px) return Number(px[1]);
  const rem = written.match(/^([\d.]+)rem$/);
  if (rem) return Number(rem[1]) * 16;
  return null;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** A component's rules, or none where it has no `<style>` block at all. A field
 *  in such a file is genuinely unstyled, which the reading below already has a
 *  verdict for — so this returns nothing rather than throwing. */
const sheets = new Map<string, Rule[]>();
function sheetOf(path: string): Rule[] {
  if (!sheets.has(path)) {
    sheets.set(
      path,
      readFileSync(path, "utf8").includes("<style>")
        ? rulesOf(styleOf(path))
        : []
    );
  }
  return sheets.get(path)!;
}

/** `views/food/AmountField.svelte label.value` — short enough to read in a diff. */
const name = (where: string, el: Element) =>
  `${where.replace("src/lib/", "").replace("src/", "")} ` +
  `${el.tag}${el.classes.map((c) => `.${c}`).join("")}`;

// ── what a box is ──────────────────────────────────────────────────────────

/** How a box's height is known, in the order the answers are worth having. */
type Reading =
  | { kind: "declared"; height: number }
  | { kind: "drawn"; optimistic: number; pessimistic: number }
  | { kind: "unstyled" }
  | { kind: "unreadable"; why: string };

/** Whether a box is drawn at all. An `<input>` at `opacity: 0`, clipped, or
 *  sized to a pixel is a real control with an invisible box, and something
 *  else — a button, a card — is what a finger aims at. Those proxies are
 *  controls rather than fields, so they belong to the sweep in #361 and are
 *  reported here rather than measured. */
const invisible = (d: Record<string, string>) => {
  const w = lengthPx(d["width"]);
  const h = lengthPx(d["height"]);
  return (
    d["opacity"] === "0" ||
    d["display"] === "none" ||
    /inset\(50%\)/.test(d["clip-path"] ?? "") ||
    (w !== null && w <= 1) ||
    (h !== null && h <= 1)
  );
};

function read(el: Element, rules: Rule[]): Reading {
  const { hits, undecidable } = rulesFor(rules, el);
  const d = declarationsOf(hits);

  const declared = Math.max(
    lengthPx(d["min-height"]) ?? 0,
    lengthPx(d["height"]) ?? 0
  );
  if (declared >= TAP_MIN) return { kind: "declared", height: declared };

  if (hits.length === 0) return { kind: "unstyled" };
  if (undecidable.length > 0) {
    return { kind: "unreadable", why: `selector "${undecidable[0]}"` };
  }
  if ((d["display"] ?? "").includes("flex")) {
    // A flex container's height comes from its children, which this model does
    // not walk. That is not a pass: it is a box whose floor has to be declared
    // before anything can be said about it at all.
    return { kind: "unreadable", why: "height comes from flex children" };
  }

  const border = lengthPx(
    d["border"]?.split(/\s+/)[0] ?? d["border-width"] ?? "none"
  );
  const padding = d["padding"]
    ? lengthPx(d["padding"].split(/\s+(?![^(]*\))/)[0])
    : lengthPx(d["padding-block"] ?? d["padding-top"] ?? "0");
  const step = d["font-size"]?.match(/--step-[\w-]+/)?.[0];
  const fontSize = step
    ? tokenPx(step)
    : d["font-size"] === undefined ||
        d["font-size"] === "inherit" ||
        d["font"] === "inherit"
      ? ROOT.fontSize
      : lengthPx(d["font-size"]);
  if (border === null) return { kind: "unreadable", why: "border width" };
  if (padding === null) return { kind: "unreadable", why: "padding" };
  if (fontSize === null) return { kind: "unreadable", why: "font size" };

  const own = /^[\d.]+$/.test(d["line-height"] ?? "")
    ? Number(d["line-height"])
    : null;
  const optimistic = own ?? ROOT.lineHeight;
  // A UA's `normal` overrides an *inherited* line-height on a form control and
  // is overridden in turn by a declared one — so a label, and anything stating
  // its own, is measured once.
  const pessimistic =
    el.tag !== "label" && own === null
      ? Math.min(optimistic, UA_LINE_HEIGHT)
      : optimistic;

  const box = (lineHeight: number) =>
    Math.max(2 * border + 2 * padding + fontSize * lineHeight, declared);
  return {
    kind: "drawn",
    optimistic: round(box(optimistic)),
    pessimistic: round(box(pessimistic)),
  };
}

const clears = (r: Reading) =>
  r.kind === "declared" || (r.kind === "drawn" && r.pessimistic >= TAP_MIN);

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

function groupsIn(path: string): { groups: Group[]; proxied: string[] } {
  const elements = elementsOf(path);
  const rules = sheetOf(path);
  const groups: Group[] = [];
  const proxied: string[] = [];

  for (const el of elements) {
    if (!FIELD.test(el.tag)) continue;
    if (attr(el, "type") === "hidden") continue;

    const wrapping = [...el.ancestors].reverse().find((a) => a.tag === "label");
    if (wrapping) {
      groups.push({ where: path, primary: wrapping, boxes: [wrapping] });
      continue;
    }

    if (invisible(declarationsOf(rulesFor(rules, el).hits))) {
      proxied.push(name(path, el));
      continue;
    }

    const boxes = [el];
    const id = attr(el, "id");
    const named =
      id === undefined
        ? undefined
        : elements.find((o) => o.tag === "label" && attr(o, "for") === id);
    if (named) boxes.push(named);
    groups.push({ where: path, primary: el, boxes });
  }
  return { groups, proxied };
}

const SWEEP = (() => {
  const groups = new Map<string, Group>();
  const proxied: string[] = [];
  for (const file of FILES) {
    const found = groupsIn(file);
    proxied.push(...found.proxied);
    // One reading per distinct box. Two `<input class="retro-input">` in one
    // file are one box wearing one rule, and saying so twice adds nothing.
    for (const g of found.groups) {
      const key = name(g.where, g.primary);
      if (!groups.has(key)) groups.set(key, g);
    }
  }

  const verdicts = new Map<string, Reading[]>();
  for (const [key, g] of groups) {
    verdicts.set(
      key,
      g.boxes.map((b) => read(b, sheetOf(g.where)))
    );
  }
  return { groups, verdicts, proxied: [...new Set(proxied)].sort() };
})();

/** The best each group manages: a group passes on its largest activating box. */
const best = (readings: Reading[]) =>
  readings.find(clears) ??
  readings.find((r) => r.kind === "unreadable") ??
  readings[0];

const describeReading = (r: Reading) =>
  r.kind === "drawn"
    ? `${r.pessimistic} (${r.optimistic} optimistic)`
    : r.kind === "unstyled"
      ? "styled by nothing"
      : r.kind === "unreadable"
        ? r.why
        : `declares ${r.height}`;

const shortfalls = () =>
  [...SWEEP.verdicts]
    .filter(([, rs]) => {
      const b = best(rs);
      return b.kind === "drawn"
        ? b.pessimistic < TAP_MIN
        : b.kind === "unstyled";
    })
    .map(([key, rs]) => `${key} — ${describeReading(best(rs))}`)
    .sort();

const unreadable = () =>
  [...SWEEP.verdicts]
    .filter(([, rs]) => best(rs).kind === "unreadable")
    .map(([key, rs]) => `${key} — ${describeReading(best(rs))}`)
    .sort();

// ── the measurement ────────────────────────────────────────────────────────

describe("the sweep itself", () => {
  it("finds every field in the app, and each one's target", () => {
    // Asserted so that a regex quietly matching nothing — the way a sweep dies
    // — fails here rather than reporting a level tree.
    expect(FILES.length).toBeGreaterThan(100);
    expect(SWEEP.groups.size).toBeGreaterThan(40);
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
   * The measurement #338 opens with, recorded rather than asserted away.
   *
   * Every entry is a box that takes a tap and stands under `--tap-min`. It is
   * written down at its true length first so that each fix commit moves a line
   * out of it and the history shows the tree coming level — the same shape
   * `tap-targets.test.ts` uses, which opens by calling itself "a measurement,
   * not a guard". The last commit on #338 turns this into `toEqual([])`.
   */
  it("stands at these shortfalls, each one a box #338 has to move", () => {
    expect(shortfalls()).toEqual(SHORTFALLS);
  });

  /**
   * Boxes whose height this model cannot derive — so far every one a flex
   * container taking its height from children the model does not walk.
   *
   * They are **not** passing. A floor declared on the box answers the question
   * the arithmetic cannot, which is why the fix for every entry here is the
   * same as the fix for a shortfall, and why this list empties as #338 lands.
   */
  it("cannot read these boxes, which is a defect and not a pass", () => {
    expect(unreadable()).toEqual(UNREADABLE);
  });

  /**
   * Shortfalls with an argument for standing short. Empty, and meant to stay
   * that way: the one candidate #338 weighed — the read-along form's density,
   * twenty nutrient rows paying 8px each — dissolved on measurement, because
   * `.cf-row` already stands 48px tall and the space was already spent.
   *
   * It lives here rather than in a CSS comment because `styleOf` strips
   * comments before the sweep reads a rule, so an argument written beside the
   * declaration is invisible to the test that would have to honour it. An
   * exemption costs a diff in this file, which is the point.
   */
  it("sanctions no shortfall at all", () => {
    expect(SHORT_BY_ARGUMENT).toEqual([]);
  });
});

const SHORT_BY_ARGUMENT: string[] = [];

/** Fields drawn invisible behind a visible proxy. All four are the same shape:
 *  a file `<input>` at `opacity: 0` that a `<button>` clicks for it. */
const PROXIED: string[] = [
  "views/food/FoodStager.svelte input.hidden-file-input",
  "views/food/ManualEntryFlow.svelte input.hidden-file-input",
  "views/food/RecipeBuilder.svelte input.hidden-file",
  "views/ledger/LedgerImport.svelte input.hidden-file-input",
];

const SHORTFALLS: string[] = [
  "views/food/CalorieCalculatorSheet.svelte input.num — 43.6 (49 optimistic)",
  "views/food/CalorieCalculatorSheet.svelte label.field — 27 (27 optimistic)",
  "views/food/CategoryPicker.svelte input.catpick-input — 44 (48.2 optimistic)",
  "views/food/FoodStager.svelte input — 40 (45 optimistic)",
  "views/food/FoodStager.svelte input.cf-subline — 39.6 (45 optimistic)",
  "views/food/FoodStager.svelte input.cf-title — 44 (45 optimistic)",
  "views/food/IngredientListEditor.svelte input.tin.yield-in — 43.6 (49 optimistic)",
  "views/food/ManualEntryFlow.svelte input.kcal-input — 44.8 (56 optimistic)",
  "views/food/NutritionTargetEditor.svelte input.card-target — 34.6 (40 optimistic)",
  "views/food/RecipeBuilder.svelte input.sin.recipe-step — 43.6 (49 optimistic)",
  "views/food/ScaleTier.svelte input.sb-factor — 44 (44 optimistic)",
  "views/habits/AddEventScreen.svelte input.hero-input — 37.3 (46.7 optimistic)",
  "views/habits/AddHabitScreen.svelte input.input-inline-cat — 34.6 (40 optimistic)",
  "views/habits/DateField.svelte input.time-input — 43.6 (49 optimistic)",
  "views/habits/EventRecurrenceField.svelte input.time-input.flex-1 — 43.6 (49 optimistic)",
  "views/habits/HabitDetailView.svelte input.input-number-brutal — 41.6 (47 optimistic)",
  "views/habits/HabitDetailView.svelte select.select-brutal — 41.6 (47 optimistic)",
  "views/items/ItemManualForm.svelte select.custom-select — 43.6 (49 optimistic)",
];

const UNREADABLE: string[] = [
  "ui/Checkbox.svelte label.checkbox — height comes from flex children",
  "views/food/AmountField.svelte label.value — height comes from flex children",
  "views/food/FoodStager.svelte label.cf-pack — height comes from flex children",
  "views/food/FoodStager.svelte label.cf-reason-code — height comes from flex children",
  "views/food/NutrientCard.svelte label.nutrient-card — height comes from flex children",
];
