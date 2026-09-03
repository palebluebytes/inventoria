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
  const found = rulesOf(styleOf(file)).filter(
    (r) => r.at === at && r.selectors.includes(selector)
  );
  if (found.length !== 1) {
    throw new Error(
      `${file} has ${found.length} rules for "${selector}"` +
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
 * A token's value in px: a fluid one at its `clamp()` floor — what it is at and
 * below the scale's narrowest width, so the tightest a phone ever draws it —
 * and a flat one (`--tap-min`, `--hairline`) at what it says.
 */
export function tokenPx(name: string): number {
  const app = readFileSync("src/app.css", "utf8");
  const fluid = app.match(new RegExp(`${name}:\\s*clamp\\(\\s*([\\d.]+)rem`));
  if (fluid) return Number(fluid[1]) * 16;
  const flat = app.match(new RegExp(`${name}:\\s*([\\d.]+)px`));
  if (flat) return Number(flat[1]);
  throw new Error(`${name} is neither a clamp() nor a px in app.css`);
}
