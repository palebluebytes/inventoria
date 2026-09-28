/**
 * What a face claims about itself, in the two shapes and the three places
 * (ADR-0114 §11).
 *
 * **One component is the whole ticket**, so the claims are about reach rather
 * than about pixels: that the word is written once in the app, that flipping a
 * face's `maturity` in the registry moves every drawing of it, and that the two
 * shapes §11 names are the two that exist. The geometry that is a decision — the
 * band under the mark rather than across it, and its inversion on the tile you
 * are standing on — is read off the stylesheet, which is `face-switcher.test.ts`'s
 * split next door and for its reason.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { render } from "svelte/server";
import { decl, ruleOf } from "./support/stylesheet";
import { readSource } from "./support/source";
import { FACES, facesOf, facetOf } from "../../src/lib/facets/registry";
import FaceGrid from "../../src/lib/layout/FaceGrid.svelte";
import FaceHeader from "../../src/lib/layout/FaceHeader.svelte";
import FaceMaturity from "../../src/lib/layout/FaceMaturity.svelte";

const COMPONENT = "src/lib/layout/FaceMaturity.svelte";
const GRID = "src/lib/layout/FaceGrid.svelte";

const root = facetOf("root");

const maturity = (props: Record<string, unknown>) =>
  render(FaceMaturity, { props } as never).body;

const header = (id: string) =>
  render(FaceHeader, {
    props: {
      face: FACES.find((f) => f.id === id),
      faces: facesOf(root),
      onPick: () => {},
    },
  } as never).body;

/** Every `.svelte` and `.ts` file under `src/`, repo-relative. */
const srcFiles = (dir = "src"): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) return srcFiles(path);
    return /\.(svelte|ts)$/.test(path) ? [path] : [];
  });

describe("the word is written once in the app", () => {
  it("is drawn from one file and spelled in no other", () => {
    // The ticket's own acceptance, and the census that carries it. Uppercase and
    // exact: `beta` in lower case is the roster's declared VALUE and belongs in
    // `registry.ts`, while `BETA` is the drawing — so this cannot be satisfied by
    // deleting the declaration, which is the way a census like this usually goes
    // wrong.
    //
    // Matched as the drawn literal `>BETA<` rather than as the bare word, which
    // is what makes it comment-proof without stripping comments: three files
    // explain the band in prose and `readCode`'s block-comment stripping is
    // blinded by an unanchored `/*` inside a string, which four files under `src/`
    // carry. A pattern only a template can satisfy needs neither.
    const drawn = srcFiles().filter((file) =>
      />\s*BETA\s*</.test(readSource(file))
    );
    expect(drawn).toEqual([COMPONENT]);
  });

  it("says nothing at all on a face that has earned it", () => {
    // §11 has the badge earn its way *off* a face, so `shipped` draws no
    // replacement — not a green one, not the word "stable". Silence is the
    // statement, and this is the arm that keeps it silent.
    expect(maturity({ maturity: "shipped" })).not.toContain("badge");
    expect(maturity({ maturity: "beta" })).toContain("BETA");
  });

  it("moves with the registry rather than with a list of its own", () => {
    // "Flipping one face's `maturity` moves both renderings and nothing else."
    // Asserted over the whole roster rather than over Media and Rations, so a
    // face added tomorrow is covered by the claim the day it is added: whichever
    // way its field is declared, the header agrees with the declaration.
    for (const face of FACES) {
      const drawn = header(face.id).includes(">BETA<");
      expect(drawn).toBe(face.maturity === "beta");
    }
  });
});

describe("the two shapes §11 names are the two that exist", () => {
  it("takes the primitive's own box for a badge and widens it for a band", () => {
    // Both shapes are `ui/Badge`, which is the point: ADR-0095 §1's shared look
    // reached by reference, so nothing here declares an ink ground, paper caps or
    // a letterspacing that could drift from the one the rest of the app draws.
    // The band is that box plus the two utilities `src/app.css` already shares
    // with the shells' DB-error line.
    expect(maturity({ maturity: "beta", shape: "band" })).toMatch(
      /class="badge badge-default w-full justify-center/
    );
    expect(maturity({ maturity: "beta" })).not.toContain("w-full");
  });

  it("declares no look of its own at all", () => {
    // The component is a predicate and a word. A `<style>` block here would be
    // the beginning of a second badge, which is the failure ADR-0095 §1 is about
    // — so its absence is the claim, not an omission.
    expect(readSource(COMPONENT)).not.toContain("<style>");
  });

  it("defaults to the badge, so a new site cannot draw a band by accident", () => {
    // The Settings face's visibility row takes the default, and it is the right
    // default for the same reason §11 gives the header one: a band belongs across
    // a tile, and every other site in the app is a row.
    expect(maturity({ maturity: "beta" })).toBe(
      maturity({ maturity: "beta", shape: "badge" })
    );
  });
});

describe("where the band sits on a tile", () => {
  const grid = (current: string | null = null) =>
    render(FaceGrid, {
      props: { faces: facesOf(root), current, onPick: () => {} },
    } as never).body;

  it("comes after the mark and before the name", () => {
    // §11 as it was rewritten by assembling it: a band across the tile's lower
    // third paints out the third of the drawing that identifies it — the
    // phonograph's base, the mortar's bowl, the chest's body — and five of the
    // seven faces carry one. Its own row, between the two, is what keeps every
    // drawing whole.
    const media = grid().slice(grid().indexOf("/icons/faces/media-256.png"));
    expect(media).toMatch(
      /badge badge-default w-full justify-center[\s\S]*?class="face-name/
    );
  });

  it("inverts with the tile it is on, by the token the swap already uses", () => {
    // Five of the seven faces are beta, so "the face you are standing on is a
    // beta face" is the ordinary case rather than an edge: a band left alone
    // would be an ink rectangle on ADR-0038's inverted ink ground, which is the
    // word alone with its box gone. `filter` rather than a second `ui/Badge`
    // variant, the way the mark above it is already inverted.
    expect(
      decl(ruleOf(GRID, ".face-tile.current :global(.badge)"), "filter")
    ).toBe("invert(1)");
  });
});

describe("the three call sites", () => {
  it("are the record's two plus the row it did not foresee", () => {
    // §11 counts two drawings. The Settings face's visibility row is a third,
    // and it is here rather than only in a comment because the census above
    // proves the word is written once and this proves the three places that
    // *draw* it all reach the one file — which is the other half of ADR-0095 §1.
    const sites = srcFiles().filter(
      (file) => file !== COMPONENT && readSource(file).includes("FaceMaturity")
    );
    expect(sites.sort()).toEqual([
      GRID,
      "src/lib/layout/FaceHeader.svelte",
      "src/lib/views/settings/FaceVisibilitySection.svelte",
    ]);
  });
});
