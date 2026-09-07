import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix } from "node:path";
import type { Rule } from "./stylesheet";

/**
 * A Svelte component's markup, read as a tree of elements, so a test can ask
 * which box a rule actually lands on.
 *
 * `stylesheet.ts` reads the CSS. That is enough for a decision about the CSS
 * itself, and not enough for a decision about a *box*: ADR-0093 says a tap
 * floor binds the smallest drawn box that accepts the tap, and no stylesheet
 * knows that `.af-row` is a `<div>` while `.value` inside it is a `<label>`.
 * Reading only the CSS is exactly how [#338] first convicted a 32px `<input>`
 * whose row takes the tap, and cleared a 21px `<label>` that takes it.
 *
 * The reading is deliberately shallow, and says so rather than guessing:
 * `matches` returns `null` — not `false` — wherever the selector asks something
 * the tree cannot answer, and a caller is expected to treat that as "unknown"
 * rather than "no". A silent `false` is the failure mode that makes a sweep
 * report a clean tree it never actually read.
 */

/** One element in a component's markup, with the ancestors it sits inside. */
export type Element = {
  /** The tag, lowercased. A Svelte component keeps its capital and is prefixed
   *  `#` — `<Input>` is `#Input`, never `input`, because it renders a whole
   *  component whose own rules a caller must go and read separately. */
  tag: string;
  /** Static classes only — the ones this element unconditionally wears. An
   *  expression inside `class="…"` contributes nothing, since its value is not
   *  knowable here. */
  classes: string[];
  /** Class names an expression builds a family of, with the expression sealed:
   *  `class="badge badge-{variant}"` wears `badge` and *names* `badge-{…}`.
   *  A fragment like that is not a class — no element ever carries it — so it
   *  is kept apart rather than being reported as one, which is what a plain
   *  strip of the braces does. */
  dynamicClasses: string[];
  /** `class:name={…}` directives — a class the element wears in one state and
   *  not in another. Kept out of `classes` because a rule reaching one of these
   *  reaches a *state*, and a caller asking what unconditionally lands on a box
   *  must not be handed it. */
  stateClasses: string[];
  /** The raw attribute text, for the questions classes cannot answer. */
  attrs: string;
  /** The tag exactly as written, so a closing tag can find what it closes. */
  raw: string;
  /** Outermost first. */
  ancestors: Element[];
  /** How many elements sit directly inside this one. A box with any is a box
   *  whose height comes from them, which is a thing a single-line-box model
   *  has to decline rather than guess at. */
  children: number;
  /** Whether the element's content opens a `{#snippet child(…)}`.
   *
   *  A bits-ui part given one of these renders **no element of its own**: it
   *  hands its props to whatever the snippet writes, which is an element the
   *  reader can already see. So a caller asking "which box does this part draw"
   *  gets "the one below it", and `MonthCalendar`'s calendar days — every one of
   *  them a `child` snippet over a plain `<button>` — are read where they are
   *  drawn rather than twice. */
  delegates: boolean;
};

/** Elements that never take a closing tag, so they never open a scope. */
const VOID =
  /^(input|br|hr|img|source|track|meta|link|area|base|col|embed|param|wbr)$/;

/** One tag, as the walk below reads it. */
type Tag = {
  close: boolean;
  raw: string;
  attrs: string;
  selfClose: boolean;
  /** Where the source continues after `>`. */
  end: number;
};

/**
 * Every tag in `markup`, read by walking rather than by matching.
 *
 * A regex has to fix how deep an attribute's braces may nest, and any depth it
 * fixes is a depth some handler exceeds: at one level, `onclick={() => { … }}`
 * does not match, and the tag it is written on is not merely read without that
 * attribute — it is **not seen at all**, along with every class on it. That cost
 * `<button class="text-btn">` in `AddEventScreen` a finding in [#376]'s first
 * sweep, and it silently narrowed the population of every other census reading
 * through here. The walk tracks quote state and brace depth, so nesting is
 * unbounded and a tag is dropped only where the markup itself is unbalanced.
 *
 * **A comment inside a handler is skipped, and that is not a nicety.** An
 * apostrophe in prose — "the input's blur" — reads as an opening `'` to a
 * quote-tracking walk, and nothing closes it: the scan runs off the end of the
 * file, drops the tag it was reading, and drops **every tag after it** as well.
 * `CategoryPicker`'s `<li role="option">` and the three elements below it were
 * invisible to every census in this repository until [#361] found the 44px on a
 * row nothing was measuring. Comments are skipped only inside an expression
 * (`depth > 0`), so a `//` in an attribute value stays a pair of slashes.
 */
function tagsIn(markup: string): Tag[] {
  const tags: Tag[] = [];
  let i = 0;
  while ((i = markup.indexOf("<", i)) !== -1) {
    let j = i + 1;
    const close = markup[j] === "/";
    if (close) j++;
    const name = /^[a-zA-Z][\w:.-]*/.exec(markup.slice(j))?.[0];
    if (!name) {
      i++;
      continue;
    }
    j += name.length;

    const from = j;
    let depth = 0;
    let quote = "";
    for (; j < markup.length; j++) {
      const c = markup[j];
      if (quote) {
        if (c === quote) quote = "";
      } else if (depth > 0 && c === "/" && markup[j + 1] === "/") {
        const line = markup.indexOf("\n", j);
        if (line === -1) break;
        j = line;
      } else if (depth > 0 && c === "/" && markup[j + 1] === "*") {
        const close = markup.indexOf("*/", j + 2);
        if (close === -1) break;
        j = close + 1;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    if (j >= markup.length) break; // unbalanced: stop rather than guess

    const attrs = markup.slice(from, j);
    tags.push({
      close,
      raw: name,
      attrs: attrs.replace(/\/$/, ""),
      selfClose: attrs.trimEnd().endsWith("/"),
      end: j + 1,
    });
    i = j + 1;
  }
  return tags;
}

/** The `{…}` opening at `at`, brace-balanced and quote-aware, or `""` where it
 *  never closes. The same argument as `tagsIn`: a fixed nesting depth is a
 *  wrong answer waiting for a handler that goes one deeper. */
function expressionAt(text: string, at: number): string {
  let depth = 0;
  let quote = "";
  for (let i = at; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(at, i + 1);
  }
  return "";
}

/**
 * The `class` value as written: the text between the quotes, or, for
 * `class={…}`, the string literals inside the expression joined — since those
 * are the only part of an expression that can name a class.
 */
function classValue(attrs: string): string {
  const found = /\bclass=/.exec(attrs);
  if (!found) return "";
  const at = found.index + found[0].length;
  const opener = attrs[at];
  if (opener === '"' || opener === "'") {
    const close = attrs.indexOf(opener, at + 1);
    return close === -1 ? "" : attrs.slice(at + 1, close);
  }
  if (opener !== "{") return "";
  return [...expressionAt(attrs, at).matchAll(/`([^`]*)`|"([^"]*)"|'([^']*)'/g)]
    .map((m) => m[1] ?? m[2] ?? m[3])
    .join(" ");
}

/** Stands in for one `{…}` while a class list is split into tokens, so a
 *  literal touching an expression stays glued to it. */
const SEALED = "\u0000";

/**
 * The class tokens in one `class` value, with the ones an expression writes
 * held apart from the ones it does not.
 *
 * Splitting on whitespace after simply deleting the braces is what turns
 * `badge-{variant}` into the class `badge-`, a name no element wears and no
 * rule declares. Sealing the expression instead keeps the fragment attached, so
 * the reader can say "this names a family" rather than inventing a member of
 * it. A token that is *only* an expression names nothing at all and is dropped.
 */
function classTokens(value: string): { classes: string[]; dynamic: string[] } {
  const classes: string[] = [];
  const dynamic: string[] = [];
  const sealed = value.replace(/\$?\{(?:[^{}]|\{[^{}]*\})*\}/g, SEALED);
  for (const token of sealed.split(/\s+/).filter(Boolean)) {
    if (!token.includes(SEALED)) classes.push(token);
    else if (token.replaceAll(SEALED, ""))
      dynamic.push(token.replaceAll(SEALED, "{…}"));
  }
  return { classes, dynamic };
}

/** The value of `attr` as written, or undefined. Quotes stripped; an
 *  expression is returned with its braces, since its text is all there is. */
export function attr(el: Element, name: string): string | undefined {
  const found = el.attrs.match(
    new RegExp(
      `\\b${name}=("([^"]*)"|'([^']*)'|(\\{(?:[^{}]|\\{[^{}]*\\})*\\}))`
    )
  );
  return found?.[2] ?? found?.[3] ?? found?.[4];
}

/**
 * Every element in `path`'s markup, outermost first, with `<script>` and
 * `<style>` removed.
 *
 * `<svelte:element this={…}>` is resolved only where the expression names a
 * single literal tag or picks between two; a `label` anywhere in it wins,
 * because that is the case that turns a whole card into a tap target
 * (`NutrientCard`). Anything less legible resolves to `svelte:element` and a
 * caller sees a tag it does not recognise rather than a wrong one.
 */
export function elementsOf(path: string): Element[] {
  const markup = readFileSync(path, "utf8")
    .replace(/<style>[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const all: Element[] = [];
  const open: Element[] = [];
  for (const { close, raw, attrs, selfClose, end } of tagsIn(markup)) {
    if (close) {
      for (let i = open.length - 1; i >= 0; i--) {
        if (open[i].raw === raw) {
          open.length = i;
          break;
        }
      }
      continue;
    }
    const lower = raw.toLowerCase();
    const isComponent = /^[A-Z]/.test(raw);
    const tag =
      raw === "svelte:element"
        ? /this=\{[^}]*["']label["']/.test(attrs)
          ? "label"
          : (attrs.match(/this=\{\s*["'](\w+)["']\s*\}/)?.[1] ??
            "svelte:element")
        : isComponent
          ? `#${raw}`
          : lower;

    const { classes, dynamic } = classTokens(classValue(attrs));

    const el: Element = {
      raw,
      tag,
      classes,
      dynamicClasses: dynamic,
      stateClasses: [...attrs.matchAll(/\bclass:([\w-]+)/g)].map((d) => d[1]),
      attrs,
      ancestors: [...open],
      children: 0,
      delegates: opensChildSnippet(markup, end),
    };
    if (open.length > 0) open[open.length - 1].children++;
    all.push(el);
    if (!selfClose && !VOID.test(lower)) open.push(el);
  }
  return all;
}

/**
 * Whether a `{#snippet child(…)}` is the first thing inside the tag ending at
 * `from` — the text up to the next tag, or to the end where there is none.
 */
function opensChildSnippet(markup: string, from: number): boolean {
  const next = markup.indexOf("<", from);
  const inside = markup.slice(from, next === -1 ? markup.length : next);
  return /^\s*\{#snippet\s+child\b/.test(inside);
}

/** True, false, or null where the tree cannot say. */
export type Match = boolean | null;

/** One compound (`input.tin[type="number"]`) against one element. */
function compoundMatches(compound: string, el: Element): Match {
  const part = compound.replace(/:global\(([^)]*)\)/g, "$1").trim();
  if (!part) return false;

  const tag = part.match(/^[a-zA-Z][\w-]*/)?.[0];
  if (tag && tag !== el.tag) return false;

  for (const cls of [...part.matchAll(/\.([\w-]+)/g)].map((c) => c[1])) {
    if (!el.classes.includes(cls)) return false;
  }

  for (const [, name, op, want] of part.matchAll(
    /\[([\w-]+)(?:([~^$*|]?=)"?([^\]"]*)"?)?\]/g
  )) {
    // `[aria-*=…]` and `[data-*=…]` are a *state* the component writes, never
    // the box's resting identity — the same reason a pseudo-class is not a
    // match below. `[type="number"]` is identity and is decided.
    if (op && /^(aria|data)-/.test(name)) return false;
    const got = attr(el, name);
    if (got === undefined) return false;
    if (!op) continue;
    if (got.startsWith("{")) return null; // an expression: unknowable here
    if (op === "=" && got !== want) return false;
    if (op !== "=" && !got.includes(want)) return false;
  }

  // A pseudo-class rule is a *state* — `:focus`, `:disabled`, `:has(…)`. It is
  // never the box's resting geometry, so it is not a match rather than an
  // unknown. `:global(…)` is already unwrapped above.
  if (/:/.test(part.replace(/\[[^\]]*\]/g, ""))) return false;

  return true;
}

/**
 * Whether `selector` selects `el`, reading right to left.
 *
 * Descendant and child combinators are resolved against the ancestor chain.
 * `+` and `~` are **not**: siblings are not on that chain, so a selector using
 * one returns `null` — the honest answer — the moment its rightmost compound
 * matches. Everything else that cannot be decided returns `null` too.
 */
export function matches(selector: string, el: Element): Match {
  const parts = selector
    .replace(/:global\(([^)]*)\)/g, "$1")
    .trim()
    .split(/\s*([>+~])\s*|\s+/)
    .filter((p): p is string => p !== undefined && p !== "");

  const rightmost = compoundMatches(parts[parts.length - 1], el);
  if (rightmost !== true) return rightmost;

  let a = el.ancestors.length - 1;
  for (let i = parts.length - 2; i >= 0; i--) {
    let combinator = " ";
    if (/^[>+~]$/.test(parts[i])) {
      combinator = parts[i];
      i--;
    }
    if (combinator === "+" || combinator === "~") return null;

    const want = parts[i];
    if (combinator === ">") {
      const parent = el.ancestors[a];
      if (!parent) return false;
      const hit = compoundMatches(want, parent);
      if (hit !== true) return hit === null ? null : false;
      a--;
      continue;
    }
    let found = false;
    while (a >= 0) {
      const hit = compoundMatches(want, el.ancestors[a]);
      a--;
      if (hit === null) return null;
      if (hit) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

/**
 * The unconditional rules that land on `el`, in source order, plus the two
 * ways this reading can fall short of the cascade.
 *
 * `undecidable` is the whole point of the return shape. A caller that ignores
 * it is measuring a box out of the declarations it happened to understand,
 * which is worse than not measuring it: the figure looks derived and is not.
 *
 * `conditional` is the same argument for a second kind of not-knowing, and it
 * used to be a bare `continue`. A rule under an at-rule was dropped and
 * nothing said so, which meant a floor a breakpoint took away read here as a
 * floor — the silent pass ADR-0093 §5 exists to refuse, in the one place §6
 * says an exemption may never live. These rules are handed back rather than
 * applied because *whether* they apply is a question about a viewport, and this
 * module reads a file. A caller decides which of them can move the number it is
 * deriving; what it may not do is not be told.
 */
export function rulesFor(
  rules: Rule[],
  el: Element
): { hits: Rule[]; undecidable: string[]; conditional: Rule[] } {
  const hits: Rule[] = [];
  const undecidable: string[] = [];
  const conditional: Rule[] = [];
  for (const rule of rules) {
    for (const selector of rule.selectors) {
      const hit = matches(selector, el);
      if (hit === null) {
        // An unresolvable selector under an at-rule is both things at once. It
        // counts as conditional, because that is the weaker claim and the one
        // a caller can act on without knowing the viewport.
        if (rule.at === null) undecidable.push(selector);
        else conditional.push(rule);
        break;
      }
      if (hit) {
        (rule.at === null ? hits : conditional).push(rule);
        break;
      }
    }
  }
  return { hits, undecidable, conditional };
}

/** Every declaration the rules land, later winning earlier — a flat reading of
 *  the cascade that ignores specificity, which holds because a component's
 *  scoped rules almost all carry the same one. A caller measuring a box built
 *  by two rules of different specificity has to check that itself. */
export function declarationsOf(rules: Rule[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules) {
    for (const [, prop, value] of rule.body.matchAll(
      /(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g
    )) {
      out[prop.trim()] = value.trim();
    }
  }
  return out;
}

/**
 * Every tracked `.svelte` file under `src/`, for a sweep that discovers its
 * population rather than naming it.
 *
 * **It takes two pathspecs, and the second one is the point.** git resolves a
 * leading `src/**` against path *segments*, so the recursive glob alone means
 * "inside a directory under src" and silently omits `src/App.svelte` and
 * `src/Rations.svelte` — the two Facet root shells, and the two files most of
 * the app hangs off. A sweep written with that one glob reports 115 files,
 * looks exhaustive, and cannot see either. `tap-floor.test.ts` already reached
 * for both forms when it globbed `.css`; this is the same fact about `.svelte`,
 * in one place so a third caller cannot rediscover it the hard way.
 */
export function trackedSvelteFiles(): string[] {
  return execFileSync("git", ["ls-files", "src/**/*.svelte", "src/*.svelte"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
}

/**
 * Where a component tag's name is imported from, resolved to a path under
 * `src/` for a relative import and left as the bare specifier for a package.
 *
 * `elementsOf` prefixes a component tag with `#` and stops there, because the
 * box it draws is in another file. That is the right answer for a reader of one
 * file and the wrong one for a sweep that has to say whether every tap target in
 * the app is level: `<Button class="remove-btn" onclick=…>` takes a tap, and
 * which box it grows is a question about `ui/Button.svelte`. This is the edge
 * between the two, and it is read off the `import` rather than guessed from the
 * name — two files in this tree export a `Button`-shaped thing and only the
 * import says which one a call site reached for.
 *
 * A namespaced tag (`DatePicker.Day`) is looked up under its first segment, so
 * every part of a library's component resolves to that library.
 */
export function importedFrom(path: string, tag: string): string | null {
  const name = tag.replace(/^#/, "").split(".")[0];
  // Comments first: a prose paragraph in this tree can be long enough to hold
  // the words `import`, a quote and a `from` between them, and a scanner that
  // reads one is not merely wrong about that line — it stops looking, and the
  // real import below it is never found (`LedgerImport` did exactly this).
  const script = readFileSync(path, "utf8")
    .match(/<script[^>]*>[\s\S]*?<\/script>/)?.[0]
    ?.replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  if (!script) return null;
  for (const [, names, from] of script.matchAll(
    /import\s+([^;]+?)\s+from\s+["']([^"']+)["']/g
  )) {
    const bound = names
      .replace(/[{}]/g, " ")
      .split(",")
      .map((n) =>
        n
          .trim()
          .split(/\s+as\s+/)
          .pop()!
          .trim()
      )
      .filter(Boolean);
    if (!bound.includes(name)) continue;
    if (!from.startsWith(".")) return from;
    // `posix` and not `path`: every path this module hands back is a git
    // pathspec, which is `/`-separated whatever the platform is.
    return posix.join(posix.dirname(path), from);
  }
  return null;
}
