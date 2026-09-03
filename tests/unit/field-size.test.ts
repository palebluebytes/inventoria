/**
 * No field the user focuses is drawn under 16px (ADR-0089 §8).
 *
 * Under 16px, iOS Safari zooms the whole page when a field takes focus. That is
 * a second way a food sheet leaves the edge of the screen, unrelated to the
 * keyboard geometry §1-§5 fixes and unfixed by it: the page is now wider than
 * the window and the sheet's pinned box is partly off it. `--step-n1` floors at
 * 0.9375rem = **15px** at phone widths, which is where most of this app's
 * fields were; `--step-0` floors at 18px.
 *
 * This is a source-level sweep, and it is deliberately the whole tree rather
 * than the two fields #332 named — one field left behind is one screen that
 * still zooms. Its limits, stated rather than implied:
 *
 *   it reads the `<style>` block, so a field styled from outside its own
 *   component is invisible to it (none are today, and the last assertion below
 *   pins the one inherited size the app relies on);
 *
 *   it matches a rule to a field by class name, so it cannot tell a rule that
 *   *would* apply from one that does — it therefore requires **every** matching
 *   declaration to clear the floor, which is the strict reading and needs no
 *   cascade guessing;
 *
 *   it resolves `clamp()` tokens to their first argument, the floor, which is
 *   the value at a phone's width and the only one that matters here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  styleOf,
  rulesOf,
  decl,
  appSheet,
  tokenPx,
} from "./support/stylesheet";

/** iOS zooms on focus for every one of these. `<select>` is included: the rule
 *  is about a control taking focus, not about typing into it. */
const TEXT_ENTRY = new Set([
  "text",
  "password",
  "email",
  "number",
  "tel",
  "url",
  "search",
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
]);

const FLOOR_PX = 16;
const ROOT = "src";

function svelteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? svelteFiles(join(dir, e.name))
      : e.name.endsWith(".svelte")
        ? [join(dir, e.name)]
        : []
  );
}

/**
 * A `font-size` value in px at a phone's width, or null where this file cannot
 * say — which the caller reports as a failure rather than a pass.
 */
function sizePx(value: string, inheritedPx: number): number | null {
  if (value === "inherit") return inheritedPx;
  const token = value.match(/^var\((--step-[\w-]+)\)$/);
  if (token) return tokenPx(token[1]);
  const rem = value.match(/^([\d.]+)rem$/);
  if (rem) return Number(rem[1]) * 16;
  const px = value.match(/^([\d.]+)px$/);
  if (px) return Number(px[1]);
  return null;
}

/** The app's own base size, which a field written `font: inherit` lands on. */
const ROOT_FONT_SIZE = appSheet()
  .filter((r) => r.at === null && r.selectors.includes(":root"))
  .map((r) => decl(r, "font-size"))
  .filter(Boolean)
  .pop();

/**
 * One opening tag, from `<` to its own `>`. Scanned rather than matched, because
 * a `>` also appears inside an attribute's expression — `oninput={(e) => …}` —
 * and a lazy `[^>]*>` would end the tag there and lose every attribute after
 * it, silently dropping the field's class and with it the whole check.
 */
function openingTag(markup: string, start: number): string {
  let depth = 0;
  for (let i = start; i < markup.length; i++) {
    const c = markup[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return markup.slice(start, i + 1);
  }
  return markup.slice(start);
}

type Field = { file: string; tag: string; classes: string[] };

/** Every focusable field in the tree, with the classes it wears. */
function fields(): Field[] {
  return svelteFiles(ROOT).flatMap((file) => {
    const markup = readFileSync(file, "utf8").replace(
      /<style>[\s\S]*?<\/style>/g,
      ""
    );
    return [...markup.matchAll(/<(input|textarea|select)\b/g)]
      .map((m) => ({ tag: m[1], text: openingTag(markup, m.index!) }))
      .filter(({ tag, text }) => {
        if (tag !== "input") return true;
        const type = text.match(/type="([^"]*)"/);
        // No `type` at all is a text field; a bound `type={…}` switches between
        // text and password, so it is one too.
        return !type || TEXT_ENTRY.has(type[1]);
      })
      .map(({ tag, text }) => ({
        file,
        tag,
        classes: (text.match(/class="([^"]*)"/)?.[1] ?? "")
          .split(/\s+/)
          .filter(Boolean),
      }));
  });
}

/** Every `font-size` a rule in `file` could put on `field`, as written. */
function sizesReaching(field: Field): string[] {
  const out: string[] = [];
  for (const rule of rulesOf(styleOf(field.file))) {
    for (const selector of rule.selectors) {
      const last = selector.split(/[\s>+~]+/).pop() ?? "";
      const hits =
        field.classes.some((c) => new RegExp(`\\.${c}(?![\\w-])`).test(last)) ||
        last.startsWith(field.tag);
      if (!hits) continue;
      // `font: inherit` is the shorthand form of the same decision.
      const shorthand = rule.body
        .match(/(?:^|;)\s*font:\s*([^;]+)/)?.[1]
        .trim();
      const longhand = rule.body
        .match(/(?:^|;)\s*font-size:\s*([^;]+)/)?.[1]
        .trim();
      if (shorthand) out.push(shorthand);
      if (longhand) out.push(longhand);
    }
  }
  return out;
}

describe("the app's base size", () => {
  it("clears the floor, so a field written `font: inherit` does too", () => {
    expect(ROOT_FONT_SIZE).toBe("var(--step-0)");
    expect(sizePx(ROOT_FONT_SIZE!, 0)).toBeGreaterThanOrEqual(FLOOR_PX);
  });
});

describe("every focusable field", () => {
  const inherited = sizePx(ROOT_FONT_SIZE ?? "", 0) ?? 0;
  const all = fields();

  it("is found at all, so an empty sweep cannot pass", () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it("says what size it is drawn at", () => {
    // A field with no `font-size` anywhere inherits the browser's own form
    // default, which is about 13.3px — under the floor and invisible in review.
    const silent = all
      .filter((f) => sizesReaching(f).length === 0)
      .map((f) => `${f.file} <${f.tag} class="${f.classes.join(" ")}">`);

    expect(silent).toEqual([]);
  });

  it("is at least 16px at a phone's width", () => {
    const under = all.flatMap((f) =>
      sizesReaching(f)
        .map((value) => ({ value, px: sizePx(value, inherited) }))
        .filter(({ px }) => px === null || px < FLOOR_PX)
        .map(
          ({ value, px }) =>
            `${f.file} <${f.tag} class="${f.classes.join(" ")}"> → ${value}` +
            (px === null ? " (unresolved)" : ` = ${px}px`)
        )
    );

    expect([...new Set(under)].sort()).toEqual([]);
  });
});
