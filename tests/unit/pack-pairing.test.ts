/**
 * The pairing act (ADR-0113 §§1–3, §7 and §15): what a pack's twin holds, what
 * a reader may conclude from it, and the three twins that refuse the act.
 *
 * Nothing here is about what a pairing FILLS — that is read at panel time from
 * whichever rows are silent now (§7), and is #520's. These are statements about
 * the attribute, its clearing, and the predicate that decides whether the
 * affordance is offered at all.
 */
import { describe, expect, it } from "vitest";
import {
  FOOD_PAIRING_ATTR,
  PAIRING_CLEARED,
  isReferenceFoodEntity,
  pairingRefusalOf,
  readFoodPairing,
  referenceFoodName,
  withPairing,
} from "../../src/lib/food/pairing";
import { TRACKED_DOMAINS } from "../../src/lib/facets/domains";
import {
  readCorpusRows,
  type SearchCorpus,
} from "../../src/lib/food/usda-corpus";

const twin = (value: unknown) => ({ [FOOD_PAIRING_ATTR]: value });

describe("what a pack's twin holds is a bare live reference id (§7)", () => {
  it("reads the id back off the twin", () => {
    expect(readFoodPairing(twin("fdc:173740"))).toBe("fdc:173740");
  });

  it("reads a twin that has never been paired as unpaired", () => {
    expect(readFoodPairing({})).toBeUndefined();
    expect(readFoodPairing(undefined)).toBeUndefined();
  });

  it("reads a cleared pairing as unpaired rather than as an id", () => {
    // Clearing is an append like any other (§7): the empty string is what wins,
    // and the datom it supersedes stays in the ledger.
    expect(readFoodPairing(twin(PAIRING_CLEARED))).toBeUndefined();
  });

  it("reads anything that is not a reference food as no pairing at all", () => {
    // Guarded once, here, for `readFoodDensity`'s reason: this value crosses
    // the ledger as JSON and can arrive from an older build, a hand-edited
    // import or one of your own devices. No pairing is the standing state a
    // pack is already in, and is never a wrong reference food.
    for (const bad of [
      "gtin:5010251341352",
      "food:custom_1",
      "recipe:7",
      "173740",
      42,
      null,
      { ref: "fdc:173740" },
    ]) {
      expect(readFoodPairing(twin(bad))).toBeUndefined();
    }
  });
});

describe("what may never be paired (§15)", () => {
  it("offers the act on a packaged food", () => {
    expect(pairingRefusalOf("gtin:5010251341352")).toBeNull();
  });

  it("refuses a recipe twin, which has no silence to fill", () => {
    expect(pairingRefusalOf("recipe:7")?.reason).toBe("recipe");
  });

  it("refuses a reference twin, which is the other end of the relationship", () => {
    expect(pairingRefusalOf("fdc:173740")?.reason).toBe("reference");
  });

  it("refuses a hand-entered twin, whose silence is nobody's declaration", () => {
    expect(pairingRefusalOf("food:custom_1758200000000_ab12")?.reason).toBe(
      "hand-entered"
    );
  });

  it("names a reason for every food entity the registry lists", () => {
    // The refusal is closed over the domain rather than over three literals, so
    // a food prefix coined later arrives refused and named instead of falling
    // through the affordance silently.
    const food = TRACKED_DOMAINS.find((d) => d.id === "food")!;
    const refused = food.entityPrefixes.filter(
      (prefix) => pairingRefusalOf(`${prefix}1`) !== null
    );
    expect(refused).toEqual(
      food.entityPrefixes.filter((prefix) => prefix !== "gtin:")
    );
  });

  it("says why, rather than only that it refused", () => {
    for (const entity of ["recipe:7", "fdc:1", "food:custom_1", "habit:1"]) {
      const refusal = pairingRefusalOf(entity);
      expect(refusal).not.toBeNull();
      expect(refusal!.because.length).toBeGreaterThan(0);
    }
  });
});

describe("the one place a pairing lands on a food", () => {
  const packPayload = {
    entity: "gtin:5010251341352",
    attributes: { "food/name": "Double Cream" },
  };

  it("adds the assertion and leaves the rest of the twin alone", () => {
    // The pack stays the food (§1). Nothing is merged, nothing is replaced: one
    // attribute arrives beside everything the twin already said.
    expect(withPairing(packPayload, "fdc:173740")).toEqual({
      entity: "gtin:5010251341352",
      attributes: {
        "food/name": "Double Cream",
        [FOOD_PAIRING_ATTR]: "fdc:173740",
      },
    });
  });

  it("supersedes a pairing already on the twin rather than accumulating", () => {
    const paired = withPairing(packPayload, "fdc:173740");
    expect(readFoodPairing(withPairing(paired, "fdc:171077").attributes)).toBe(
      "fdc:171077"
    );
  });

  it("takes the clear, which is an assertion naming nobody", () => {
    const cleared = withPairing(packPayload, PAIRING_CLEARED);
    expect(cleared.attributes[FOOD_PAIRING_ATTR]).toBe(PAIRING_CLEARED);
    expect(readFoodPairing(cleared.attributes)).toBeUndefined();
  });

  it("refuses the three twins §15 names, on the staging path as on the append", () => {
    // The staged payload reaches the ledger at commit, through the host's
    // ingest, so a refusal enforced only where the datom is written would leave
    // the other arm guarded by a screen alone.
    for (const entity of [
      "recipe:7",
      "fdc:173740",
      "food:custom_1758200000000_ab12",
    ]) {
      expect(() => withPairing({ entity, attributes: {} }, "fdc:1")).toThrow(
        /may not be paired/
      );
    }
  });

  it("refuses a pairing that names anything but a reference food", () => {
    expect(() => withPairing(packPayload, "gtin:123")).toThrow(
      /not a reference food/
    );
  });
});

describe("the id a pairing may name", () => {
  it("takes a reference food and nothing else", () => {
    expect(isReferenceFoodEntity("fdc:173740")).toBe(true);
    expect(isReferenceFoodEntity("gtin:5010251341352")).toBe(false);
    expect(isReferenceFoodEntity("fdc:")).toBe(false);
    expect(isReferenceFoodEntity("fdc:abc")).toBe(false);
  });
});

describe("the reference food is named on screen, or it is not claimed (§9)", () => {
  const corpus = (): SearchCorpus => ({
    foods: readCorpusRows([
      {
        fdcId: 173740,
        description:
          "Beans, kidney, red, mature seeds, canned, solids and liquids",
        dataType: "SR Legacy",
        macros: { calories: 81 },
      },
    ]),
    schema_version: 1,
    vocabulary: {},
    state_qualifiers: [],
  });

  it("reads the row's own description back off the corpus", () => {
    expect(referenceFoodName(corpus(), "fdc:173740")).toBe(
      "Beans, kidney, red, mature seeds, canned, solids and liquids"
    );
  });

  it("names nobody where the corpus no longer carries the row", () => {
    // Yesterday's pairing keeps marking yesterday's rows even if that name has
    // since left the corpus (§7), so a missing row is an unnamed pairing rather
    // than an absent one.
    expect(referenceFoodName(corpus(), "fdc:999999")).toBeUndefined();
    expect(referenceFoodName(corpus(), "gtin:1")).toBeUndefined();
  });
});
