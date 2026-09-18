/**
 * The two surfaces the pairing act is reached from (ADR-0113 §§1, 2, 9 and 15):
 * the line `FoodCard` draws under a pack, and the search sheet it opens.
 *
 * `pack-pairing.test.ts` holds the other half, which is what the twin says.
 * Nothing here re-states the refusals: what is asserted is that the SCREEN obeys
 * them, which is a different claim and the one a person meets.
 *
 * `render` reaches the markup and the words on it. What it cannot reach is a
 * tap, so the claims below are about what a screen OFFERS: that a row tap arms
 * the accept button rather than writing anything is asserted structurally, and
 * the behavioural reading of it is not yet in `tests/food-ui.spec.ts`.
 */
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import { readCode } from "./support/source";
import FoodCard from "../../src/lib/views/food/FoodCard.svelte";
import { FOOD_PAIRING_ATTR } from "../../src/lib/food/pairing";
import type { EntityPayload } from "../../src/lib/ingestion/ingest";

const card = (payload: EntityPayload, props: Record<string, unknown> = {}) =>
  render(FoodCard, {
    props: {
      payload,
      name: (payload.attributes["food/name"] as string) ?? "",
      amount: 100,
      unit: "g",
      ...props,
    },
  }).body;

const pack = (attributes: Record<string, unknown> = {}): EntityPayload => ({
  entity: "gtin:5010251341352",
  attributes: { "food/name": "Double Cream", ...attributes },
});

describe("the pairing line a pack carries (§1)", () => {
  it("offers the act on a pack whose host can persist it", () => {
    const body = card(pack(), { onPair: () => {} });
    expect(body).toContain('data-testid="pack-pairing"');
    expect(body).toContain("Pair with a reference food");
  });

  it("offers nothing on a host with nowhere to put the assertion", () => {
    // Every mark on this card is a handoff: the card owns it, the host owns
    // what it opens. A host that passed no handler would open nothing.
    expect(card(pack())).not.toContain('data-testid="pack-pairing"');
  });

  it("offers nothing on the three twins §15 refuses, whatever the host passes", () => {
    for (const entity of [
      "recipe:7",
      "fdc:173740",
      "food:custom_1758200000000_ab12",
    ]) {
      const body = card(
        { entity, attributes: { "food/name": "Something" } },
        { onPair: () => {} }
      );
      expect(body, entity).not.toContain('data-testid="pack-pairing"');
    }
  });

  it("names the reference food it is paired with, under that food's own source tag", () => {
    // The tag is the reference food's, not the pack's (§1): the two are shown
    // beside each other and never merged into one record. The NAME is resolved
    // from the corpus after mount, so what stands here is the id it resolves.
    const body = card(pack({ [FOOD_PAIRING_ATTR]: "fdc:173740" }), {
      onPair: () => {},
      onClearPairing: () => {},
    });
    expect(body).toContain('data-reference="fdc:173740"');
    expect(body).toContain('data-kind="usda"');
    expect(body).toContain('data-testid="clear-pairing"');
    // The offer is gone: a paired pack is re-paired by tapping the pairing.
    expect(body).not.toContain("Pair with a reference food");
  });

  it("reads a cleared pairing as an unpaired pack", () => {
    const body = card(pack({ [FOOD_PAIRING_ATTR]: "" }), {
      onPair: () => {},
      onClearPairing: () => {},
    });
    expect(body).toContain("Pair with a reference food");
    expect(body).not.toContain('data-testid="clear-pairing"');
  });
});

describe("the search a person drives (§§2, 9)", () => {
  // The sheet itself cannot be rendered here: `BottomSheet` sits on a bits-ui
  // dialog, which portals and emits nothing through Svelte's SSR path. So the
  // claims about it are structural, made against its source the way
  // `rations-settings.test.ts` makes its own.
  const SHEET = readCode("src/lib/views/food/PackPairingSheet.svelte");

  it("reaches the corpus through the food search that already ships", () => {
    // §9: no key, no network, single-digit milliseconds, and already the way
    // every reference food enters this app.
    expect(SHEET).toMatch(/searchUsdaFoods\(/);
  });

  it("reaches nothing that could propose a candidate", () => {
    // Nothing proposes a pairing (§9). A model handed the whole corpus emitted
    // six ids that are real rows naming a different food while its own stated
    // reason named the food correctly, so a screen showing a proposer's reason
    // would launder the six that validating the id cannot catch.
    //
    // The whole import list rather than a search for words a proposer might
    // use: a screen that reaches only these four modules has nowhere to get a
    // candidate from except the query somebody typed, and a fifth import is
    // what a reviewer has to see.
    const imports = [...SHEET.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect([...new Set(imports)].sort()).toEqual([
      "../../food/food-search",
      "../../food/pairing",
      "../../ui/Alert.svelte",
      "../../ui/BottomSheet.svelte",
      "../../ui/Button.svelte",
      "../../ui/Input.svelte",
      "../../ui/Row.svelte",
    ]);
  });

  it("takes reference foods only, so a Curated stand-in is never a candidate", () => {
    // The shipped search folds in a stand-in where the corpus has a coverage
    // hole (ADR-0046 §1), and a stand-in is a specific OFF product rather than a
    // reference food. The filter is on the id, which is the property that has
    // to hold.
    expect(SHEET).toMatch(
      /filter\(\s*\(food\) =>\s*isReferenceFoodEntity\(food\.entity\)\s*\)/
    );
  });

  it("shows each candidate's own description, which is what makes it rejectable", () => {
    // §9's condition on every pairing surface: validating an id against the
    // corpus catches one wrong-food error in seven, so the clause the design
    // rests on holds only where the row's own words are on screen.
    expect(SHEET).toMatch(/title=\{food\.name\}/);
  });

  it("accepts nothing until a person has picked a reference food", () => {
    // Pre-selecting is allowed; pre-accepting is not (§2). A row tap sets
    // `chosen` and writes nothing; the button under it is the whole act.
    expect(SHEET).toMatch(/onclick=\{\(\) => \(chosen = food\)\}/);
    expect(SHEET).toMatch(/disabled=\{chosen === null\}/);
    expect(SHEET).toMatch(
      /function accept\(\) \{\s*if \(!chosen\) return;\s*onAccept\(chosen\.entity\);/
    );
  });
});
