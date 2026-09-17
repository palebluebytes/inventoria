/**
 * The masked-field population `ui/SecretField` was written to close — #384,
 * ADR-0100 §8.
 *
 * **Two copies is the trigger; two paid bills are the argument.** ADR-0100 §1
 * fires at two, and the reason this pair was worth taking rather than watching
 * is that the duplication had already cost twice. `z-index: 2` went into both
 * files at #375, and `2.75rem → var(--tap-min)` went into both at #361 — one
 * cause, two edits, each landing correctly only because somebody remembered the
 * second copy existed. ADR-0093's Consequences names it: *"a copy taken before
 * a fix never receives it."*
 *
 * **The census is a rule sweep, and the shape it looks for is the recipe.** A
 * masked field has no element of its own — `<input type="password">` is
 * `ui/Input` with a prop — so what identifies a hand-rolled copy is the
 * *adornment*: a control positioned absolutely over a field's right edge,
 * lifted above it, sized to the tap floor. That combination is specific enough
 * to find a copy and general enough that a copy worded differently is still
 * caught, which is the trade the `retro-*` family census made too.
 *
 * It is deliberately not "no rule is named `.reveal-toggle`". A name is the one
 * thing a second author is least likely to reuse.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { render } from "svelte/server";
import { elementsOf, trackedSvelteFiles } from "./support/markup";
import { decl, rulesOf, styleOf, type Rule } from "./support/stylesheet";
import SecretField from "../../src/lib/ui/SecretField.svelte";

const FILES = trackedSvelteFiles();
const PRIMITIVE = "src/lib/ui/SecretField.svelte";

/**
 * A rule that pins a control over the right edge of something and lifts it
 * above that thing — the adornment half of a secret field, whatever it is
 * called.
 */
function adornsARightEdge(rule: Rule): boolean {
  return (
    decl(rule, "position") === "absolute" &&
    decl(rule, "right") === "0" &&
    decl(rule, "z-index") !== undefined &&
    decl(rule, "width") === "var(--tap-min)"
  );
}

const ADORNMENTS = FILES.flatMap((file) =>
  readFileSync(file, "utf8").includes("<style>")
    ? rulesOf(styleOf(file))
        .filter(adornsARightEdge)
        .map((rule) => `${file}  ${rule.selectors.join(", ")}`)
    : []
).sort();

/** Every file that masks a field by choosing the input's `type` itself. The
 *  primitive does this once; a caller doing it is a caller holding the mask
 *  state, which is the other half of what was copied. */
const MASKERS = FILES.filter((file) =>
  /type=\{[^}]*["']password["']/.test(readFileSync(file, "utf8"))
).sort();

describe("SecretField", () => {
  it("starts masked", () => {
    const { body } = render(SecretField, {
      props: { id: "k", reveals: "TMDB API key" },
    });
    expect(body).toMatch(/type="password"/);
    expect(body).not.toMatch(/type="text"/);
  });

  it("builds both halves of the toggle's name from one word", () => {
    // The pair cannot be half-shipped or worded two ways, which is what a
    // caller passing its own `aria-label` twice could do — and both copies did
    // write the ternary out by hand.
    const { body } = render(SecretField, {
      props: { id: "k", reveals: "TMDB API key" },
    });
    expect(body).toContain('aria-label="Show TMDB API key"');
    expect(body).toContain('aria-pressed="false"');
  });

  it("hands the caller's platform attributes down to the field", () => {
    const { body } = render(SecretField, {
      props: {
        id: "food-off-password",
        reveals: "Open Food Facts password",
        autocomplete: "current-password",
        placeholder: "Your Open Food Facts password...",
      } as Record<string, unknown>,
    });
    expect(body).toContain('autocomplete="current-password"');
    expect(body).toContain('id="food-off-password"');
    expect(body).toContain('placeholder="Your Open Food Facts password..."');
  });
});

describe("the secret-field census", () => {
  it("reads the whole tree, so an empty sweep cannot pass", () => {
    expect(FILES).toContain("src/App.svelte");
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("finds one control adorning a field's right edge, and it is the primitive", () => {
    expect(ADORNMENTS).toEqual([`${PRIMITIVE}  .reveal-toggle`]);
  });

  it("leaves the mask state in one file, and it is the same one", () => {
    expect(MASKERS).toEqual([PRIMITIVE]);
  });

  it("is adopted by both sheets that held a copy", () => {
    // A floor under the two assertions above, which are absences: an absence is
    // trivially true if nothing reaches for the component.
    const wearing = FILES.filter((file) =>
      elementsOf(file).some((el) => el.tag === "#SecretField")
    ).sort();
    expect(wearing).toEqual([
      "src/lib/views/food/FoodSettingsSheet.svelte",
      "src/lib/views/media/MediaSettingsSheet.svelte",
    ]);
  });
});
