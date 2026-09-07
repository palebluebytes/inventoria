/**
 * What takes a tap, and how big the box it draws is — the model behind
 * `tap-floor.test.ts` (ADR-0093, ADR-0098).
 *
 * `markup.ts` reads a component's elements and `stylesheet.ts` reads its rules.
 * Neither answers the two questions a tap floor turns on: whether a pointer
 * activates this box at all, and how tall it is drawn. Those live here, apart
 * from the sweep, because the sweep is a statement about `src/` and this is a
 * statement about CSS — and because the file that holds both crossed the size
 * this repository decomposes at.
 *
 * The height model, stated so it can be argued with:
 *
 *   height = 2 × border + 2 × vertical padding + the line box,
 *
 * tokens at their `clamp()` floor — the tightest a phone ever draws them — and
 * the line box being the type step times either the declared line-height, the
 * inherited 1.5 (optimistic), or 1.2 (pessimistic, a UA's `normal`, which
 * applies only where the rule declares none since a declared one is honoured).
 * A box clears the floor when the *pessimistic* reading clears it (ADR-0093 §3).
 *
 * Everything here declines rather than guesses. `read` returns `unreadable` with
 * a reason wherever the model runs out, because a sweep that answers "no" where
 * it means "I cannot tell" reports a level tree it never read (ADR-0093 §5).
 */
import { readFileSync } from "node:fs";
import {
  appSheet,
  decl,
  rulesOf,
  styleOf,
  tokenOf,
  tokenPx,
} from "./stylesheet";
import type { Rule } from "./stylesheet";
import { attr, declarationsOf, rulesFor } from "./markup";
import type { Element } from "./markup";

export const TAP_MIN = tokenPx("--tap-min");

/** A UA's `line-height: normal` on a form control, near enough. It only ever
 *  makes a box shorter than the inherited 1.5, so using it as the pessimistic
 *  reading cannot manufacture a shortfall that no browser has. */
const UA_LINE_HEIGHT = 1.2;

/** `<input>`, `<textarea>`, `<select>` — the boxes #338 knew about, and still
 *  the three that draw their own box whatever they contain. */
export const FIELD = /^(input|textarea|select)$/;

// ── what takes a tap ───────────────────────────────────────────────────────

/**
 * The roles that name something a pointer activates.
 *
 * Read off the `role` attribute rather than inferred, and deliberately short:
 * `status`, `listbox`, `dialog` and the rest describe a *region*, and putting a
 * 48px floor on a region would convict a card because it announces itself.
 */
const INTERACTIVE_ROLE =
  /^(button|link|checkbox|radio|switch|tab|option|menuitem|menuitemcheckbox|menuitemradio|slider|spinbutton)$/;

/**
 * A pointer handler written on an element, which is the app's own way of saying
 * "this is a control" where the tag does not.
 *
 * Both spellings, and the second one matters more than it looks: `<Row {onclick}>`
 * is how a component forwards a handler it was given, and a predicate keyed on
 * `onclick=` alone reads `FoodItemRow` — a whole row of the food list — as
 * something no finger ever lands on.
 *
 * `onkeydown` is not here and its absence is not an oversight: a key handler on
 * a non-control is how a *field* takes ↑/↓, and a keyboard has no tap floor.
 */
const POINTER_HANDLER = /\bon(?:click|mousedown|pointerdown)\s*[={]?\s*[={}]/;

/**
 * bits-ui parts that render something a finger lands on, and the ones that do
 * not.
 *
 * A roster, which this file otherwise refuses — and it is a roster because the
 * markup it describes is not in this repository. `<Calendar.Day class="bits-day">`
 * is a `<button>` and `<Calendar.HeadCell class="bits-weekday-cell">` is a
 * `<th>`, and nothing under `src/` says so. What keeps it from rotting the way
 * a hand-written population does is the assertion `tap-floor.test.ts` holds it
 * to: every namespaced part in the tree must appear in one of these two sets,
 * so a new one fails there rather than being skipped.
 *
 * The split is by what the part *renders*, not by what it is called. A
 * `DatePicker.Cell` is the `<td>` around a day, so it is chrome; the
 * `DatePicker.Day` inside it is the button and is what this sweep measures.
 * That the day is drawn `100%` of its cell — so a short cell would make a short
 * target — is a fact the model cannot resolve, and it says so: a percentage is
 * not a length, so the day reads as unreadable until it declares a floor of its
 * own (ADR-0093 §5).
 */
export const LIBRARY_TARGET = new Set([
  "Accordion.Trigger",
  "Calendar.Day",
  "Calendar.NextButton",
  "Calendar.PrevButton",
  "Combobox.Input",
  "Combobox.Item",
  "DatePicker.Day",
  "DatePicker.NextButton",
  "DatePicker.PrevButton",
  "DatePicker.Segment",
  "DatePicker.Trigger",
  "DateRangePicker.Day",
  "DateRangePicker.NextButton",
  "DateRangePicker.PrevButton",
  "DateRangePicker.Segment",
  "DateRangePicker.Trigger",
  "RadioGroup.Item",
  "Tabs.Trigger",
  "ToggleGroup.Item",
]);

/** The parts that draw chrome: a grid, a heading, a portal, a row, a cell. */
export const LIBRARY_CHROME = new Set([
  "Accordion.Content",
  "Accordion.Header",
  "Accordion.Item",
  "Accordion.Root",
  "Calendar.Cell",
  "Calendar.Grid",
  "Calendar.GridBody",
  "Calendar.GridHead",
  "Calendar.GridRow",
  "Calendar.HeadCell",
  "Calendar.Header",
  "Calendar.Heading",
  "Calendar.Root",
  "Combobox.ContentStatic",
  "Combobox.Root",
  "DatePicker.Calendar",
  "DatePicker.Cell",
  "DatePicker.Content",
  "DatePicker.Grid",
  "DatePicker.GridBody",
  "DatePicker.GridHead",
  "DatePicker.GridRow",
  "DatePicker.HeadCell",
  "DatePicker.Header",
  "DatePicker.Heading",
  "DatePicker.Input",
  "DatePicker.Portal",
  "DatePicker.Root",
  "DateRangePicker.Calendar",
  "DateRangePicker.Cell",
  "DateRangePicker.Content",
  "DateRangePicker.Grid",
  "DateRangePicker.GridBody",
  "DateRangePicker.GridHead",
  "DateRangePicker.GridRow",
  "DateRangePicker.HeadCell",
  "DateRangePicker.Header",
  "DateRangePicker.Heading",
  "DateRangePicker.Input",
  "DateRangePicker.Label",
  "DateRangePicker.Root",
  "Dialog.Content",
  "Dialog.Overlay",
  "Dialog.Portal",
  "Dialog.Root",
  "Meter.Root",
  "RadioGroup.Root",
  "Separator.Root",
  "Tabs.Content",
  "Tabs.List",
  "Tabs.Root",
  "ToggleGroup.Root",
]);

/** A namespaced component tag — `#DatePicker.Day` — as the roster spells it. */
export const partName = (el: Element) =>
  el.tag.startsWith("#") && el.tag.includes(".") ? el.tag.slice(1) : null;

/**
 * Whether a pointer activates this element.
 *
 * The four answers are the tag, the role, a pointer handler, and — for a part a
 * library renders — the roster above. A component call site (`<Button …>`) is
 * decided by its handler like anything else; which *box* it grows is a separate
 * question, and the answer is "one in the component's own file", which is why
 * `drawsItsOwnBox` sends it away rather than measuring it here.
 */
export function takesATap(el: Element): boolean {
  const part = partName(el);
  // A part handed a `child` snippet renders no element of its own — it hands
  // its props down to one the reader can already see, so measuring it here
  // would be measuring `MonthCalendar`'s day twice and its `<button>` once.
  if (el.delegates) return false;
  if (part !== null) return LIBRARY_TARGET.has(part);
  if (!el.tag.startsWith("#")) {
    if (FIELD.test(el.tag)) return attr(el, "type") !== "hidden";
    if (el.tag === "button" || el.tag === "summary") return true;
    if (el.tag === "a" && attr(el, "href") !== undefined) return true;
    const role = attr(el, "role");
    if (role !== undefined && INTERACTIVE_ROLE.test(role)) return true;
  }
  return POINTER_HANDLER.test(el.attrs);
}

/**
 * Whether the box this element draws is styled from the file it is written in.
 *
 * True for anything native, and true for a library part — bits-ui renders the
 * element but the class on it and the `:global` rule sizing it are both here.
 * False for a component call site, whose box is `ui/Button.svelte`'s or
 * `ui/Card.svelte`'s and is measured there. That is not a gap: `tap-floor.test.ts`
 * proves every such component contributes a box to the sweep, and the one thing
 * a call site can still do from outside — reach in with `:global` and resize it
 * — has a clause of its own.
 */
export const drawsItsOwnBox = (el: Element) =>
  !el.tag.startsWith("#") || partName(el) !== null;
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
export function lengthPx(value: string | undefined): number | null {
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
export function sheetOf(path: string): Rule[] {
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

// ── what a box is ──────────────────────────────────────────────────────────

/** How a box's height is known, in the order the answers are worth having. */
export type Reading =
  | { kind: "declared"; height: number }
  | { kind: "drawn"; optimistic: number; pessimistic: number }
  | { kind: "unstyled" }
  | { kind: "unreadable"; why: string };

/** Whether a box is drawn at all. An `<input>` at `opacity: 0`, clipped, or
 *  sized to a pixel is a real control with an invisible box, and something
 *  else — a button, a card — is what a finger aims at. Those proxies are
 *  controls rather than fields, so they belong to the sweep in #361 and are
 *  reported here rather than measured. */
export const invisible = (d: Record<string, string>) => {
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

/** What a box's height is made of: the inputs to `height = 2 × border + 2 ×
 *  vertical padding + the line box`. A rule declaring one of these moves the
 *  number, which is why `tap-floor.test.ts`'s pointer-query rule keys on this
 *  list alone. */
export const HEIGHT_INPUTS = [
  "min-height",
  "height",
  "padding",
  "padding-block",
  "padding-top",
  "padding-bottom",
  "border",
  "border-width",
  "font",
  "font-size",
  "line-height",
];

/** What decides whether a box is drawn at all — `invisible`'s inputs. Kept
 *  apart from the list above because the two are asked for different reasons:
 *  a pointer query that hides a hover-only affordance declares `display` and is
 *  legitimate (ADR-0094), while one that moves a height is not. */
const VISIBILITY_INPUTS = [
  "width",
  "height",
  "opacity",
  "display",
  "clip-path",
];

/** Every property {@link read} depends on — both lists, since a
 *  conditional rule touching either one leaves the reading unread. A breakpoint
 *  that recolours a box touches neither, and there are more of those in `src/`
 *  than of the other kind. */
const MODELLED = [...new Set([...HEIGHT_INPUTS, ...VISIBILITY_INPUTS])];

export function read(el: Element, rules: Rule[]): Reading {
  const { hits, undecidable, conditional } = rulesFor(rules, el);
  const d = declarationsOf(hits);

  // A rule under an at-rule is not applied here, so a box one of them can
  // resize is a box this model has not read — whatever the unconditional rules
  // add up to. Declining first is the point: a conditional rule can take a
  // declared floor away, so answering `declared` before looking would be the
  // silent pass in its worst form (ADR-0093 §5).
  //
  // Unless the box carries a `min-height` at the token, which is the one
  // declaration a breakpoint cannot undercut by accident (ADR-0098 §4). Padding
  // and type steps only ever *add* to a box a `min-height` is already holding
  // open, and a conditional `height` loses to it outright. So a floored box is
  // only unread where a conditional rule names something that can genuinely
  // undo it — another `min-height`, a `max-height`, or a rule that stops it
  // being drawn at all. Without this, `Sidebar`'s nav item and `WeekStrip`'s
  // day button could never be *made* readable: their breakpoints move padding,
  // which is exactly what a floor exists to survive.
  const floored = (lengthPx(d["min-height"]) ?? 0) >= TAP_MIN;
  const canUndo = floored
    ? ["min-height", "max-height", ...VISIBILITY_INPUTS]
    : MODELLED;
  const moved = conditional.find(
    (r) =>
      canUndo.some((p) => decl(r, p) !== undefined) &&
      // `display: none` at a breakpoint *removes* the box rather than shrinking
      // it, and a box that is not drawn cannot fail a finger. So a rule whose
      // only claim on the model is that one is not a rule that leaves the
      // reading unknown — it says the target is absent there, and the
      // unconditional reading is the whole answer where it is present.
      // `ItemInspector`'s close ✕ is the tree's one instance: a mobile-only
      // control, hidden above 800px where the panel is a fixed sidebar.
      !(
        decl(r, "display") === "none" &&
        MODELLED.filter((p) => p !== "display").every(
          (p) => decl(r, p) === undefined
        )
      )
  );
  if (moved) return { kind: "unreadable", why: `conditional on ${moved.at}` };

  // A form control draws its own box whatever it contains — a `<select>`'s
  // `<option>`s are not laid out inside it — so the container rule below is
  // about everything else.
  if (el.children > 0 && !FIELD.test(el.tag)) {
    // A box holding other elements takes its height from them, and this model
    // walks one line box. Guessing here is how `CalorieCalculatorSheet`'s
    // `<label class="field">` — a caption stacked over an input, ~85px tall —
    // reads as 27. Declining is the honest answer, and a declared floor is what
    // turns it into a provable one.
    const declaredHere = Math.max(
      lengthPx(d["min-height"]) ?? 0,
      lengthPx(d["height"]) ?? 0
    );
    if (declaredHere >= TAP_MIN)
      return { kind: "declared", height: declaredHere };
    return { kind: "unreadable", why: "height comes from its children" };
  }

  const declared = Math.max(
    lengthPx(d["min-height"]) ?? 0,
    lengthPx(d["height"]) ?? 0
  );
  if (declared >= TAP_MIN) return { kind: "declared", height: declared };

  if (hits.length === 0) return { kind: "unstyled" };
  if (undecidable.length > 0) {
    return { kind: "unreadable", why: `selector "${undecidable[0]}"` };
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

export const clears = (r: Reading) =>
  r.kind === "declared" || (r.kind === "drawn" && r.pessimistic >= TAP_MIN);

// ── how wide a box is ──────────────────────────────────────────────────────

/**
 * How narrow a rule says a box is, or null where it says nothing that puts it
 * under the floor.
 *
 * **Width is read only where it is declared, and that is a stated limit rather
 * than an omission.** A text control is as wide as its text, and no stylesheet
 * holds the text — so unlike height, which every box derives from a line box
 * this model can walk, there is no arithmetic here to be pessimistic with. What
 * this reads is the two things a rule *can* say:
 *
 *   - a **bound** — `width` or `max-width` — which holds the box at a size, and
 *     is a shortfall when that size is under the token and no `min-width`
 *     rescues it. `.cf-skip` is 40 × 40 and stays 40 wide however long its
 *     label;
 *   - a **declared floor** under the token — `min-width: 2.75rem`, which is
 *     Apple's 44pt and on the losing side of ADR-0089 §3. The box may draw
 *     wider, and the defect is in the declaration either way (ADR-0093 §4): a
 *     floor is the token or it is a number someone chose.
 *
 * `min-width: 0` is neither. It is the flex idiom for "you may shrink me" and
 * claims no size at all, which is why `WeekStrip`'s day button and `FoodView`'s
 * back title are not convicted by it.
 *
 * {@link shortness} above is the same question on the height axis, and answers
 * only for a *declared* height: a caller that wants the derived one asks
 * {@link read}, which has a line box to walk and four ways to decline.
 */
export function shortness(
  d: Record<string, string>
): { prop: string; px: number } | null {
  const declared = Math.max(
    lengthPx(d["min-height"]) ?? 0,
    lengthPx(d["height"]) ?? 0
  );
  return declared > 0 && declared < TAP_MIN
    ? { prop: "height", px: declared }
    : null;
}

export function narrowness(
  d: Record<string, string>
): { prop: string; px: number } | null {
  const min = lengthPx(d["min-width"]);
  if (min !== null && min > 0 && min < TAP_MIN) {
    return { prop: "min-width", px: min };
  }
  if (min !== null && min >= TAP_MIN) return null;
  for (const prop of ["width", "max-width"]) {
    // `max-width: none` is the removal of a bound, and `lengthPx` reads `none`
    // as the zero it means for a border. Asking for a length here and getting
    // the absence of one is why `.flex-1` read as a box 0px wide.
    if (d[prop] === "none") continue;
    const px = lengthPx(d[prop]);
    if (px !== null && px < TAP_MIN) return { prop, px };
  }
  return null;
}
