import { readFileSync } from "node:fs";
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
  /** Static classes only. An expression inside `class="…"` contributes
   *  nothing, since its value is not knowable here. */
  classes: string[];
  /** The raw attribute text, for the questions classes cannot answer. */
  attrs: string;
  /** Outermost first. */
  ancestors: Element[];
};

/** Elements that never take a closing tag, so they never open a scope. */
const VOID =
  /^(input|br|hr|img|source|track|meta|link|area|base|col|embed|param|wbr)$/;

/** Attribute text, one tag's worth: quoted strings and `{…}` expressions, with
 *  braces nested one deep so `class="a {x ? `b-${y}` : ''}"` survives. */
const TAG =
  /<(\/?)([a-zA-Z][\w:.-]*)((?:[^<>"'{]|"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\})*?)(\/?)>/g;

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
  const open: (Element & { raw: string })[] = [];
  let m: RegExpExecArray | null;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(markup))) {
    const [, close, raw, attrs, selfClose] = m;
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

    const written = attrs.match(/\bclass=("([^"]*)"|'([^']*)')/);
    const classes = (written?.[2] ?? written?.[3] ?? "")
      // An expression contributes no knowable class; drop it, keep the literals
      // around it. Braces nest one deep for a template literal's `${…}`.
      .replace(/\{(?:[^{}]|\{[^{}]*\})*\}/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    const el: Element & { raw: string } = {
      raw,
      tag,
      classes,
      attrs,
      ancestors: open.map(({ raw: _, ...rest }) => rest),
    };
    all.push(el);
    if (!selfClose && !VOID.test(lower)) open.push(el);
  }
  return all;
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
 * The unconditional rules that land on `el`, in source order, plus whether any
 * rule had to be given up on.
 *
 * `undecidable` is the whole point of the return shape. A caller that ignores
 * it is measuring a box out of the declarations it happened to understand,
 * which is worse than not measuring it: the figure looks derived and is not.
 */
export function rulesFor(
  rules: Rule[],
  el: Element
): { hits: Rule[]; undecidable: string[] } {
  const hits: Rule[] = [];
  const undecidable: string[] = [];
  for (const rule of rules) {
    if (rule.at !== null) continue;
    for (const selector of rule.selectors) {
      const hit = matches(selector, el);
      if (hit === null) {
        undecidable.push(selector);
        break;
      }
      if (hit) {
        hits.push(rule);
        break;
      }
    }
  }
  return { hits, undecidable };
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
