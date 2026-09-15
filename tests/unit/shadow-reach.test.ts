import { describe, expect, it } from "vitest";
import {
  appSheet,
  decl,
  ruleOf,
  rulesOf,
  styleOf,
  tokenOf,
} from "./support/stylesheet";

/**
 * ADR-0102: a drop shadow is reserved where a box must contain or cover it.
 *
 * `--shadow-N-reach` is **derived**, not chosen: it is that shadow's offset plus
 * its spread, which is how far the ink travels past the element on the right and
 * on the bottom. ADR-0038's overlap argument is the same arithmetic read from
 * the other side — the spread expands by 1 and the offset moves by at least 1,
 * so nothing crosses the left edge or the top.
 *
 * ADR-0102's Consequences names the guard this file is: *"A reach is a second
 * number that can drift from a first. Nothing enforces the pair today. If
 * `--shadow-N` ever moves, the guard worth having is the one this repo already
 * reaches for — a unit test asserting the derivation rather than a comment
 * asking for it."* So every expected value below is computed from `--shadow-N`:
 * a test that wrote `4px` out would be a third copy of the number, and would
 * drift on the same day the second one did.
 *
 * Source-level throughout, for `sheet-geometry.test.ts`'s reason — what is
 * decided is which boxes carry a reservation and that it names the token rather
 * than a literal, and that is a property of the CSS and of no rendered pixel.
 */
describe("each elevation token's reach is derived from the shadow itself", () => {
  /** `1px 1px 0 1px var(--ink)` → `[1, 1, 0, 1]`: x, y, blur, spread.
   *
   *  A unitless `0` is a legal length and this recipe writes one for the blur,
   *  so the unit is optional here — matching only `Npx` would silently drop the
   *  blur and shift the spread into its place, which is a reading that agrees
   *  with the right answer for the wrong reason. */
  const lengthsOf = (shadow: string) =>
    shadow
      .replace(/var\([^)]*\)/g, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((length) => {
        const n = /^(-?[\d.]+)(px)?$/.exec(length);
        if (!n) throw new Error(`${length} is not a length in \`${shadow}\``);
        return Number(n[1]);
      });

  for (const tier of [1, 2, 3] as const) {
    it(`--shadow-${tier}-reach is --shadow-${tier}'s offset plus its spread`, () => {
      const [x, y, blur, spread] = lengthsOf(tokenOf(`--shadow-${tier}`));

      // The two offsets are equal and the blur is zero, which is what lets ONE
      // reach answer for both the right edge and the bottom one. A shadow that
      // stopped being square would need two tokens rather than one, so the
      // premise is asserted before the sum that rests on it.
      expect({ x, y, blur }).toEqual({ x: y, y, blur: 0 });
      expect(tokenOf(`--shadow-${tier}-reach`)).toBe(`${x + spread}px`);
    });
  }

  it("declares a reach for every shadow and no reach without one", () => {
    // The pair has to move together, so a fourth elevation arriving without its
    // reach — or a reach outliving the shadow it was derived from — fails here
    // rather than in whichever layout was relying on the missing one.
    const tiers = (suffix: "" | "-reach") =>
      appSheet()
        .filter((r) => r.at === null && r.selectors.includes(":root"))
        .flatMap((r) => [
          ...r.body.matchAll(new RegExp(`--shadow-(\\d+)${suffix}\\s*:`, "g")),
        ])
        .map((m) => m[1])
        .sort();

    expect(tiers("-reach")).toEqual(tiers(""));
  });
});

/** Which selectors in a `<style>` block name any `--shadow-N-reach`. */
const reservedIn = (css: string) =>
  rulesOf(css)
    .filter((r) => /--shadow-\d-reach/.test(r.body))
    .map((r) => [r.at, r.selectors.join(", ")].filter(Boolean).join(" — "));

describe("the two boxes that owe a reservation hold it", () => {
  it("ui/Row reserves --shadow-2-reach, which is what .selected paints (§3)", () => {
    const row = ruleOf("src/lib/ui/Row.svelte", ".row");

    expect(decl(row, "margin-right")).toBe("var(--shadow-2-reach)");
    expect(decl(row, "margin-bottom")).toBe("var(--shadow-2-reach)");
  });

  it("holds it in every state, which is what §3 turns on", () => {
    // Reserving only where the shadow is drawn shrinks the row by 4px at the
    // exact moment it is being highlighted — a worse artefact than the one being
    // fixed. What this catches is someone "tidying" the margin onto the state
    // that actually paints: one rule, unconditioned, or the reservation moves.
    expect(reservedIn(styleOf("src/lib/ui/Row.svelte"))).toEqual([".row"]);
  });

  it("the way-in rail no longer owes one, because it no longer draws one", () => {
    // §2's first worked site was the rail's cells, and it was a `ui/Button`
    // reshaped from outside: its `--shadow-1` fell outside the grid track, and
    // the last cell's was clipped by the bar while the others fell into a gap.
    // ADR-0101's 2026-09-15 amendment took the frame off those cells altogether
    // — every tile in the one-line bar is drawn by the plate it sits in — so
    // there is no shadow to reserve for, and a reservation here would be 2px of
    // margin held for a shadow nobody paints.
    //
    // The record's rule is untouched and this is it being applied: a box
    // reserves where a shadow must be contained or covered, and stops when the
    // shadow goes. `ui/Row` below is now its only site.
    expect(reservedIn(styleOf("src/lib/views/food/WayInRail.svelte"))).toEqual(
      []
    );
  });

  it("ui/Button is deliberately not converted (§4)", () => {
    // Its 2px overhang is real at fifty-three call sites and harmless at nearly
    // all of them; converting the primitive would move fifty-three layouts to
    // fix the handful inside a clip, and the handful are not enumerated. A reach
    // appearing here is that sweep happening by accident, so it fails until the
    // ticket that owns it rewrites this expectation.
    expect(reservedIn(styleOf("src/lib/ui/Button.svelte"))).toEqual([]);
  });
});
