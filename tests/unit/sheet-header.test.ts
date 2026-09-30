/**
 * When a `BottomSheet` draws its header row at all (ADR-0114 §15).
 *
 * The rule the row serves is a naming one — a face's screen never draws the
 * face's name, because the shell's header already does — and §15 is explicit
 * that **no gate is owed for the naming half**: the obvious census, a sweep for
 * a `title="…"` literal naming a face, is vacuous. `RecipeLibrarySheet` reached
 * `"Recipes"` through a ternary and never spelled it at a `title=`, and the
 * nearest literal neighbours in the whole of `src/` are `"Media settings"` and
 * `"Reports"`. The sweep would go green over the one violation it exists to
 * catch.
 *
 * What is guarded here is the **mechanism** that rule left behind, which is a
 * different claim and not a vacuous one: a new conditional inside a `ui/`
 * primitive, `!inline || onBack || headerActions || title`, that every sheet in
 * the app is now read through. Its two failure modes are silent in opposite
 * directions — an inline surface growing back an empty row of padding and a
 * `border-bottom`, or a dialog losing the row its close button lives in — and
 * neither prints. Rendered rather than source-read, for the reason
 * `face-titles.test.ts` next door gives: a source read cannot tell you what a
 * condition decided.
 */
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import { createRawSnippet } from "svelte";
import BottomSheet from "../../src/lib/ui/BottomSheet.svelte";
import { readCode } from "./support/source";
import { FACES } from "../../src/lib/facets/registry";

const body = createRawSnippet(() => ({ render: () => `<p>body</p>` }));
const actions = createRawSnippet(() => ({
  render: () => `<button id="subject-action"></button>`,
}));

const sheet = (props: Record<string, unknown>) =>
  render(BottomSheet, {
    props: { isOpen: true, children: body, ...props },
  } as never).body;

const hasHeader = (markup: string) => markup.includes("bottom-sheet-header");

describe("an inline sheet draws its header row only when the row holds something", () => {
  it("draws none for a surface that passes nothing", () => {
    // The face's screen. Its name is the shell's, so it passes no title; it is
    // a screen rather than somewhere you went, so it passes no back; and inline
    // there is no ✕ to keep the row alive on its own.
    expect(hasHeader(sheet({ inline: true }))).toBe(false);
  });

  it("draws one for a title", () => {
    // A sub-screen naming itself — `ReportsPage`'s _Reports_, the builder's
    // _New recipe_ — which is the case §15 leaves untouched.
    expect(hasHeader(sheet({ inline: true, title: "Reports" }))).toBe(true);
  });

  it("draws one for a way back, with no title at all", () => {
    // Each term stands alone: a surface that can be left has somewhere to draw
    // the control even where nothing names it.
    expect(hasHeader(sheet({ inline: true, onBack: () => {} }))).toBe(true);
  });

  it("draws one for a control on the sheet's subject", () => {
    const markup = sheet({ inline: true, headerActions: actions });
    expect(hasHeader(markup)).toBe(true);
    expect(markup).toContain("subject-action");
  });
});

describe("the Recipes face's screen does not spell the face", () => {
  it("names no face anywhere in its code", () => {
    // **One file's claim, and deliberately not the rule's gate.** §15 says why
    // the rule cannot have one: the census that would catch a face's name in a
    // `title=` goes green over the only violation there has ever been, because
    // that violation reached the string through a ternary. This asserts the one
    // surface the rule was written about, which a census over the class cannot
    // reach — and it asserts it over the *roster's* names rather than a string
    // of its own, so a face renamed in the registry is still the thing checked.
    //
    // `readCode`, because the file explains at length why the name is gone and
    // a comment satisfying a claim about code is not a claim.
    const code = readCode("src/lib/views/food/RecipeLibrarySheet.svelte");
    for (const face of FACES) expect(code).not.toContain(`"${face.name}"`);
  });
});

/**
 * **The `!inline` term is not asserted here, and this tier cannot assert it.**
 *
 * A dialog's row is the one that must never go: the close button is the only
 * caller of `close`, so a sheet losing that row loses its ✕ and is left with the
 * backdrop. The term is first in the condition for exactly that reason. But the
 * dialog branch renders through `ui/Modal`, which is bits-ui's `Dialog`, and
 * bits-ui emits nothing server-side — a `render()` of a sheet with `inline`
 * unset returns markup with no `bottom-sheet-header` in it *whether or not the
 * condition is right*, so an assertion there passes for the wrong reason and
 * then fails for the wrong reason too. The unit tier has no DOM environment to
 * fall back to; `vite.config.ts` configures none.
 *
 * So the four render claims above are the whole of the condition that is
 * guarded, and they are the half this change actually moved — the fifth claim
 * beside them is about one file's text, not about the condition at all.
 * Nothing in `tests/` asserts the ✕ at any tier
 * — measured, not assumed: no spec names `"Close"` as a control. That absence
 * predates this change and is not repaired here, but it is the thing to reach
 * for if the dialog's row is ever touched.
 */
