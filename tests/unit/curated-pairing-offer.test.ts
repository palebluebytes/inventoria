/**
 * What the Curated pairing table is allowed to say about a pack in front of a
 * person (ADR-0113 §§2 and 14).
 *
 * `curated-pairings.test.ts` holds the table itself — that every row points at a
 * food this app ships, at a barcode that is a barcode, once. What is asserted
 * here is the other half: **when a row is offered at all**, and what has to be
 * true before one reaches a screen. The table is a prior, never a fact, and
 * every rule below is that sentence applied to one twin.
 */
import { describe, expect, it } from "vitest";
import {
  curatedPairingName,
  curatedPairingOffer,
  curatedPick,
  curatedReference,
  declaredStateLabel,
  declaredStateOf,
  preselect,
  type PairingPick,
} from "../../src/lib/food/curated-pairing-offer";
import { CURATED_PAIRINGS } from "../../src/lib/food/curated-pairings";
import {
  FOOD_PAIRING_ATTR,
  PAIRING_CLEARED,
  withPairing,
} from "../../src/lib/food/pairing";
import { DECLARED_STATES } from "../../src/lib/food/pairing-targets";
import type { PairingIndex } from "../../src/lib/food/pairing-targets";
import {
  readCorpusRows,
  type SearchCorpus,
  type UsdaCorpusRow,
} from "../../src/lib/food/usda-corpus";
import type { EntityPayload } from "../../src/lib/ingestion/ingest";

/** The chartered jar: a seeded row naming a Pairing target (ADR-0113 §11). */
const COOKED = CURATED_PAIRINGS.find((r) => r.set === "pairing-target")!;
/** A seeded row naming a Reference food, which is the ordinary case. */
const AS_BOUGHT = CURATED_PAIRINGS.find((r) => r.set === "reference")!;

const twin = (
  gtin: string,
  attributes: Record<string, unknown> = {}
): EntityPayload => ({
  entity: `gtin:${gtin}`,
  attributes: { "food/name": "A pack", ...attributes },
});

/** A whole corpus row, stated rather than partially cast: only two of its
 *  fields decide anything here, and the rest are what USDA publishes for every
 *  row, so writing them costs a line and keeps the fixture a real row. */
const row = (fdcId: number, description: string): UsdaCorpusRow => ({
  fdcId,
  description,
  dataType: "Foundation",
  macros: {
    calories: 0,
    protein_content: 0,
    fat_content: 0,
    carbohydrate_content: 0,
  },
});

/**
 * A loaded corpus over those rows, read by the app's own reader.
 *
 * Through `readCorpusRows` rather than a hand-built `SearchableFood`, because a
 * corpus is exactly *rows that have been read* — and a fixture assembling that
 * shape itself would be a second reader, free to disagree with the one the app
 * hands `referenceFoodName`.
 */
const corpusOf = (...rows: UsdaCorpusRow[]): SearchCorpus => ({
  foods: readCorpusRows(rows),
  schema_version: 1,
  vocabulary: {},
  state_qualifiers: [],
});

/** The raw Pairing index, which carries its rows unread — the shape the cooked
 *  arm is named out of (ADR-0113 §11). */
const indexOf = (...rows: UsdaCorpusRow[]): PairingIndex => ({
  artifact: "usda-pairing-index",
  schema_version: 1,
  generated_from: [],
  foods: rows,
});

/** A loader nobody is allowed to call, for the arm each case must not reach. */
const refused = (which: string) => () => {
  throw new Error(`${which} was fetched and should not have been`);
};

describe("which twin the table speaks for (§14)", () => {
  it("offers a seeded pack its row, keyed on the entity id the mint builds", () => {
    // Keyed on the entity rather than the raw code, the discipline
    // `curatedStandInFor` already keeps: a twin re-opened from the ledger and a
    // twin a scan just staged are byte-comparable, and both are `gtin:<code>`.
    expect(curatedPairingOffer(twin(AS_BOUGHT.gtin))).toEqual(AS_BOUGHT);
  });

  it("says nothing about a pack nobody adjudicated", () => {
    expect(curatedPairingOffer(twin("9999999999994"))).toBeUndefined();
    expect(curatedPairingOffer(undefined)).toBeUndefined();
  });

  it("says nothing about a twin that is not a pack at all", () => {
    // §15's refusals are `pairingRefusalOf`'s and are not restated here; what
    // this asserts is that the table cannot reach past them, because a row is
    // keyed on a `gtin:` id and nothing else is one.
    for (const entity of ["fdc:173740", "recipe:7", "food:custom_1_ab", ""])
      expect(
        curatedPairingOffer({ entity, attributes: {} }),
        entity
      ).toBeUndefined();
  });

  it("never overwrites a live pairing: the person's assertion about their own jar wins", () => {
    // The table is a PRIOR, not a fact. A pack already carrying somebody's
    // answer is not a pack with a question open on it.
    const pack = twin(AS_BOUGHT.gtin, { [FOOD_PAIRING_ATTR]: "fdc:173740" });
    expect(curatedPairingOffer(pack)).toBeUndefined();
  });

  it("never re-offers to a pack whose pairing was cleared", () => {
    // A cleared `food/pairing` is a refusal of the PROPOSAL, not of the food, so
    // the clear means one thing ledger-wide. Re-pairing stays one deliberate act
    // away through the search, which costs a tap and never a nag.
    const pack = twin(AS_BOUGHT.gtin, { [FOOD_PAIRING_ATTR]: "" });
    expect(curatedPairingOffer(pack)).toBeUndefined();
  });

  it("treats a pairing it cannot read as one it may not speak over", () => {
    // `withPairing` admits an `fdc:` id and the clear and nothing else, so a
    // third value can only arrive from an older build, a hand-edited import or
    // one of your own devices. Somebody's datom is on this pack either way, and
    // the conservative reading is the one `readFoodPairing` already keeps: a
    // value this app cannot read is never grounds for asserting something else.
    for (const value of ["fdc:", "kidney beans", 173740, null])
      expect(
        curatedPairingOffer(
          twin(AS_BOUGHT.gtin, { [FOOD_PAIRING_ATTR]: value })
        ),
        String(value)
      ).toBeUndefined();
  });
});

describe("the sequence one pack walks through (§14)", () => {
  // The four states a seeded barcode passes through, through the writer both
  // hosts actually pair with rather than through hand-built attributes: the
  // offer has to be right at each, and each transition is one act.
  const CHARTERED = CURATED_PAIRINGS.find((r) => r.gtin === "4068263049675")!;
  const scanned = twin(CHARTERED.gtin);
  const offered = (payload: EntityPayload) =>
    curatedPairingOffer(payload)?.fdcId ?? null;

  it("offers the row to a freshly scanned pack and to nobody who has answered", () => {
    expect(offered(scanned)).toBe(CHARTERED.fdcId);

    // Accepted: the pack now carries the person's own assertion, so the prior
    // has nothing left to say and the row is not re-offered over it.
    const accepted = withPairing(scanned, curatedReference(CHARTERED));
    expect(offered(accepted)).toBeNull();

    // Paired with something else entirely: the same rule, and the one that
    // matters — the table never overwrites what somebody decided about their
    // own jar.
    expect(offered(withPairing(scanned, "fdc:171413"))).toBeNull();

    // Cleared: a refusal of the PROPOSAL, not of the food. Never re-offered,
    // and the search is still one deliberate act away.
    const cleared = withPairing(accepted, PAIRING_CLEARED);
    expect(cleared.attributes[FOOD_PAIRING_ATTR]).toBe(PAIRING_CLEARED);
    expect(offered(cleared)).toBeNull();
  });
});

describe("the Declared state a row asserts (§§11, 14)", () => {
  it("reads the state off `set`, which is written and never derived", () => {
    expect(declaredStateOf(COOKED)).toBe("cooked");
    expect(declaredStateOf(AS_BOUGHT)).toBe("as-bought");
  });

  it("names it in the words the question itself is asked in", () => {
    // One list of two values, in `pairing-targets.ts`. A screen spelling the
    // state out again would be a third place for a value to be coined, which is
    // what §11 refuses.
    for (const { value, label } of DECLARED_STATES)
      expect(declaredStateLabel(value)).toBe(label);
  });
});

describe("when the row is pickable, and what it is (§§9, 11, 14)", () => {
  const NAME = "Oil, olive, salad or cooking";

  it("is pickable under the state it asserts, as the id and the description", () => {
    // The two things §14 will not let a curated row imply, and the two a pick
    // needs: the `fdc:` id the act writes, and the USDA row's own words.
    expect(curatedPick(AS_BOUGHT, NAME, "as-bought")).toEqual({
      entity: curatedReference(AS_BOUGHT),
      name: NAME,
    });
  });

  it("is withdrawn under the other state, and restored on the way back", () => {
    // §11's partition binds a prior exactly as it binds a typed query: a cooked
    // claim left standing under a person who has just said their pack is as they
    // bought it is one tap from the pairing the partition exists to refuse.
    // Withdrawing records nothing, so moving back brings it back.
    expect(curatedPick(COOKED, NAME, "as-bought")).toBeUndefined();
    expect(curatedPick(COOKED, NAME, "cooked")).toBeDefined();
    expect(curatedPick(AS_BOUGHT, NAME, "cooked")).toBeUndefined();
  });

  it("is not pickable at all until the set can describe it", () => {
    // §9's condition: the description is the whole of what makes a pairing
    // rejectable, so a row that cannot show one has nothing a person could
    // check. That covers a stale id, and on a device with no network it covers
    // every cooked row too — §11 has neither Facet precaching the Pairing index,
    // so the pack falls back to the search it would have had.
    expect(curatedPick(AS_BOUGHT, undefined, "as-bought")).toBeUndefined();
    expect(curatedPick(undefined, NAME, "as-bought")).toBeUndefined();
  });
});

describe("what arming the button may and may not do (§2)", () => {
  const OFFER: PairingPick = { entity: "fdc:171413", name: "Oil, olive" };
  const OWN: PairingPick = { entity: "fdc:173740", name: "Beans, kidney" };

  it("pre-selects onto an empty screen", () => {
    expect(preselect(undefined, OFFER)).toBe(OFFER);
  });

  it("never overrules a pick the person made themselves", () => {
    // The description is resolved out of an artifact, so the offer can appear a
    // fetch after the sheet opened — long after somebody typed a query and
    // tapped a row. Moving what the accept button would write, under a person
    // who has already chosen, is §2's collapse in a smaller window.
    expect(preselect(OWN, OFFER)).toBe(OWN);
  });

  it("leaves an empty screen empty where there is nothing to offer", () => {
    expect(preselect(undefined, undefined)).toBeUndefined();
    expect(preselect(OWN, undefined)).toBe(OWN);
  });
});

describe("the USDA row's own description, which is §9's condition", () => {
  it("names a Reference food out of the shipped corpus, and fetches nothing else", async () => {
    const name = await curatedPairingName(
      AS_BOUGHT,
      async () =>
        corpusOf(row(AS_BOUGHT.fdcId, "Oil, olive, salad or cooking")),
      refused("the Pairing index")
    );
    expect(name).toBe("Oil, olive, salad or cooking");
  });

  it("names a Pairing target out of the Pairing index, and never the Search index", async () => {
    // The partition is symmetric (§11), and it binds a curated row exactly as it
    // binds a typed query: a row asserting the pack is cooked is named out of
    // the cooked set or not at all.
    const name = await curatedPairingName(
      COOKED,
      refused("the Search index"),
      async () => indexOf(row(COOKED.fdcId, "Beans, kidney, cooked, boiled"))
    );
    expect(name).toBe("Beans, kidney, cooked, boiled");
  });

  it("names nobody where the set it points at cannot answer", async () => {
    // A stale id is the standing hazard the quarterly job exists for, and what
    // it costs is the offer: `curatedPick` refuses a row it cannot describe.
    expect(
      await curatedPairingName(
        AS_BOUGHT,
        async () => corpusOf(row(1, "Something else")),
        refused("the Pairing index")
      )
    ).toBeUndefined();
  });

  it("never rejects, on either arm", async () => {
    // The sheet leans on this beside a search box that already works. An
    // artifact that would not load costs the offer and nothing else — which is
    // the state every unseeded pack is already in, and the state a cooked row
    // is in on a device with no network.
    const boom = async (): Promise<never> => {
      throw new Error("offline");
    };
    expect(await curatedPairingName(AS_BOUGHT, boom, boom)).toBeUndefined();
    expect(await curatedPairingName(COOKED, boom, boom)).toBeUndefined();
  });
});
