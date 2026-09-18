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
import NutrientPreview from "../../src/lib/views/food/NutrientPreview.svelte";
import { FOOD_PAIRING_ATTR } from "../../src/lib/food/pairing";
import { ESTIMATED_MEANING } from "../../src/lib/food/nutrient-display";
import { PER_100G, type NutritionInfo } from "../../src/lib/food/nutrition";
import type { EntityPayload } from "../../src/lib/ingestion/ingest";

/** The source of the card itself, for the claims a server render cannot reach:
 *  the reference food's panel is resolved in an effect, and an effect does not
 *  run there. */
const CARD = readCode("src/lib/views/food/FoodCard.svelte");

/** An EU pack's mandatory declaration and nothing else — the silence a pairing
 *  is for. */
const PANEL: NutritionInfo = {
  serving_size: PER_100G,
  calories: 116,
  protein_content: 8.7,
  fat_content: 0.5,
  carbohydrate_content: 15.6,
};

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

describe("the est mark a borrowed figure wears (§5)", () => {
  // One list in normal panel order, in the shipped `NutrientBreakdown` shape.
  // What tells a borrowed figure from a printed one is a small `est` mark and a
  // lighter weight — nothing framed off, nothing in a second column, no dashed
  // block — and a nutrient both sources carry shows the label's figure unmarked.
  const breakdown = {
    calories: 116,
    protein: 8.7,
    fat: 0.5,
    carbs: 15.6,
    fiber_content: 6.4,
    iron: 0.00222,
  };

  const preview = (estimated?: ReadonlySet<string>) =>
    render(NutrientPreview, { props: { breakdown, estimated } }).body;

  it("marks the figures a pairing supplied and nothing else", () => {
    const body = preview(new Set(["iron"]));
    expect(body).toContain('data-testid="est-mark"');
    // One mark, on one row: the iron the reference food lent, and not the fibre
    // the label printed.
    expect(body.match(/data-testid="est-mark"/g)).toHaveLength(1);
    // On the iron's own row, right against its figure — same row, same list.
    expect(body).toMatch(
      /nutrient-iron(?:(?!<\/div>)[^])*?2\.22 mg(?:<!--[^>]*-->)?<span[^>]*class="est-mark/
    );
  });

  it("says what the mark means, in the one sentence a dish will say too", () => {
    expect(preview(new Set(["iron"]))).toContain(ESTIMATED_MEANING);
  });

  it("lightens the figure the mark is about, and no other", () => {
    // The mark is one word AND a lighter weight (§5): the figure stops being
    // the boldest thing on its line the way a printed one is. The class is what
    // the rule hangs on, so a row losing it loses half the mark silently.
    const body = preview(new Set(["iron"]));
    expect(body).toMatch(/<dd class="[^"]*\best\b[^"]*">2\.22 mg/);
    expect(body).toMatch(/<strong class="(?![^"]*\best\b)[^"]*">6\.4 g/);
  });

  it("draws no mark at all on a panel nothing was borrowed for", () => {
    // A refused fill needs no surface and no new word, and neither does an
    // unpaired pack: the panel is the shape it has always been.
    expect(preview()).not.toContain('data-testid="est-mark"');
    expect(preview(new Set())).not.toContain('data-testid="est-mark"');
  });

  it("keeps the mark on a borrowed nutrient the user happens to track", () => {
    // The grid and the disclosure are one panel split by what the user tracks,
    // so a borrowed figure promoted into the grid may not shed its mark. Fibre
    // is tracked by default, which puts it in the grid and out of the
    // disclosure — and it still wears the mark there.
    const body = preview(new Set(["fiber_content"]));
    expect(body).toMatch(
      /n nutrient-fiber_content(?:(?!<\/div>)[^])*?<strong class="[^"]*\best\b[^"]*">6\.4 g(?:<!--[^>]*-->)?<span[^>]*class="est-mark/
    );
    // And exactly there: the iron below it, in the disclosure, was the label's.
    expect(body.match(/data-testid="est-mark"/g)).toHaveLength(1);
  });
});

describe("the marked panel a paired pack's card composes (§§4, 7)", () => {
  it("reads the reference food's figures rather than storing them", () => {
    // An estimate never reaches a stored `nutrition/info` (§7): the card asks
    // the shipped artifacts what the paired id resolves to and composes the
    // reading, and the only thing it hands the amount panel is that reading.
    expect(CARD).toContain("referenceFoodPanel(store, reference)");
    expect(CARD).toMatch(/markPanel\(panel, pairedPanel, density\)/);
    expect(CARD).toMatch(/panel=\{marked\?\.panel \?\? panel\}/);
  });

  it("marks nothing where the pairing filled nothing", () => {
    // Omitted, never emitted empty — the same rule the datom keeps. An empty
    // fill hands the preview no mark set at all rather than an empty one.
    expect(CARD).toMatch(/marked\.filled_fields\.length > 0/);
  });

  it("draws an unpaired pack's panel exactly as it always was", () => {
    const body = card(pack({ "nutrition/info": PANEL }), { panel: PANEL });
    expect(body).not.toContain('data-testid="est-mark"');
  });
});
