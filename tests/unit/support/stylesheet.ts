import { readFileSync } from "node:fs";

/**
 * A Svelte component's `<style>` block, read as data.
 *
 * Some decisions are about the CSS itself rather than about any rendered pixel
 * — which properties a box is allowed to name (ADR-0089 §5), or that four verbs
 * in one row are drawn at one size (#324). Those are provable in the unit tier
 * only by reading the stylesheet, and the reading has to be honest: comments are
 * stripped first, so a sentence naming a value cannot satisfy or break a rule,
 * and nesting is flattened so a declaration inside a media query is never
 * mistaken for the unconditional one.
 */

/** One declaration block, with the at-rule it is nested inside (if any). */
export type Rule = {
  /** The enclosing at-rule's prelude, whitespace-collapsed, or null at top level. */
  at: string | null;
  selectors: string[];
  body: string;
};

/** The `<style>` block of a Svelte component, with CSS comments removed. */
export function styleOf(path: string): string {
  const source = readFileSync(path, "utf8");
  const open = source.indexOf("<style>");
  if (open === -1) throw new Error(`${path} has no <style> block`);
  const style = source.slice(
    open + "<style>".length,
    source.indexOf("</style>")
  );
  return style.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Flatten a stylesheet to its declaration blocks, carrying each one's enclosing
 * at-rule. `@keyframes` contributes its `from`/`to` steps as ordinary rules,
 * which is harmless: nothing selects them by name.
 */
export function rulesOf(css: string, at: string | null = null): Rule[] {
  const out: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    if (prelude.startsWith("@")) {
      out.push(...rulesOf(body, prelude.replace(/\s+/g, " ")));
    } else {
      out.push({
        at,
        selectors: prelude.split(",").map((s) => s.trim().replace(/\s+/g, " ")),
        body,
      });
    }
    i = j;
  }
  return out;
}

/** The value of `prop` in a rule, or undefined if the rule never sets it. */
export function decl(rule: Rule, prop: string): string | undefined {
  const at = rule.body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
  return at?.[1].trim();
}

/**
 * The one rule in `file` whose selector list contains exactly `selector`, under
 * the at-rule `at` — `null` for "in none", which is the unconditional rule and,
 * in a mobile-first sheet, the phone's.
 *
 * It throws rather than returning nothing on either miss: a renamed selector
 * would otherwise pass every assertion about it silently, which is the failure
 * mode a source-level test is most exposed to.
 */
export function ruleOf(
  file: string,
  selector: string,
  at: string | null = null
): Rule {
  return ruleIn(rulesOf(styleOf(file)), selector, at, file);
}

/**
 * The same lookup over rules already read — `appSheet()`'s, or any other
 * flattened stylesheet — with `where` naming the source for the error message.
 *
 * `ruleOf` is this with a component's `<style>` block read for you. A test
 * asserting about `src/app.css` wants the same "exactly one, or throw" and the
 * same message, so it reaches for this rather than growing its own copy.
 */
export function ruleIn(
  rules: Rule[],
  selector: string,
  at: string | null,
  where: string
): Rule {
  const found = rules.filter(
    (r) => r.at === at && r.selectors.includes(selector)
  );
  if (found.length !== 1) {
    throw new Error(
      `${where} has ${found.length} rules for "${selector}"` +
        `${at === null ? "" : ` under ${at}`}, expected exactly 1`
    );
  }
  return found[0];
}

/**
 * `src/app.css`, comments stripped and flattened the same way a component's
 * `<style>` block is. It is where the token scales and the measurements are
 * declared, so anything resolving a `var()` starts here.
 */
export function appSheet(): Rule[] {
  return rulesOf(
    readFileSync("src/app.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
  );
}

/**
 * A token's value as `src/app.css` writes it — `--rail` → `22rem`, `--space-m`
 * → the whole `clamp(…)`. Read off the `:root` rules rather than the file text,
 * so a token named inside some other rule's declaration cannot answer for one
 * that was never declared.
 */
export function tokenOf(name: string): string {
  const value = appSheet()
    .filter((r) => r.at === null && r.selectors.includes(":root"))
    .map((r) => decl(r, name))
    .find(Boolean);
  if (!value) throw new Error(`${name} is not declared in app.css :root`);
  return value;
}

/**
 * A token's value in px: a fluid one at its `clamp()` floor — what it is at and
 * below the scale's narrowest width, so the tightest a phone ever draws it —
 * and a flat one (`--tap-min`, `--hairline`) at what it says.
 */
export function tokenPx(name: string): number {
  const value = tokenOf(name);
  const fluid = value.match(/^clamp\(\s*([\d.]+)rem/);
  if (fluid) return Number(fluid[1]) * 16;
  const flat = value.match(/^([\d.]+)px$/);
  if (flat) return Number(flat[1]);
  throw new Error(`${name} is neither a clamp() nor a px in app.css`);
}

/**
 * Every `--vv-*` reference in `css` that carries a fallback of its own.
 *
 * ADR-0089 §3: `app.css` declares all three properties and the runtime writes
 * over them as inline properties on `<html>`, which beat a `:root` rule — so
 * those declarations **are** the pre-keyboard defaults and a call site adding a
 * second guess is a fourth answer to one number. Before the record there were
 * `var(--vv-h, 85vh)`, `var(--vv-top, auto)` and `var(--vv-bottom, 0px)` in
 * three files, none of them agreeing.
 *
 * Returns the offending `var(…)` openings rather than a boolean, so a failure
 * quotes what to delete. Shared because the rule is the *mechanism's*, not any
 * one consumer's, and the roster of consumers grows with §6.
 */
export function bandFallbacksIn(css: string): string[] {
  return [...css.matchAll(/var\(\s*--vv-[a-z]+\s*,[^)]*\)/g)].map((m) => m[0]);
}

/**
 * Every viewport unit named by one of `rules`, tagged with the selector naming
 * it — `.selbar: 85vh` rather than `85vh`, because the fix is to that rule.
 *
 * Measured under `resizes-visual`, `vh`, `svh`, `dvh` and `lvh` all report the
 * same number at every size and none of them moves when a keyboard opens
 * (ADR-0089 Context). A pinned box that names one is keyboard-blind by
 * construction, whichever of the four it picked.
 */
export function viewportUnitsIn(rules: Rule[]): string[] {
  return rules.flatMap((r) =>
    [...r.body.matchAll(/\d+(?:\.\d+)?(?:vh|svh|dvh|lvh)\b/g)].map(
      (m) => `${r.selectors.join(", ")}: ${m[0]}`
    )
  );
}
