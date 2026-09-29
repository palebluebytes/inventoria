/**
 * What the Curated pairing table is allowed to say about a pack in front of a
 * person (ADR-0113 §§2 and 14).
 *
 * `curated-pairings.test.ts` holds the table itself — that every row points at a
 * food this app ships, at a barcode that is a barcode, once. What is asserted
 * here is the other half: **when a row applies at all**, and what has to be true
 * before one reaches a pack.
 *
 * Since #552 a row APPLIES ITSELF rather than arming a button, so the sentence
 * these rules are all an application of has moved: the table is a prior a person
 * **refuses**, where it used to be one they accepted. Every guard is the same one,
 * because the gate is the same gate — what changed is what happens when it opens.
 */
import { describe, expect, it } from "vitest";
import {
  curatedAcceptance,
  curatedPairingApplied,
  curatedPairingOffer,
  curatedReference,
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

describe("what the acceptance writes, and when it says nothing (§2 as amended)", () => {
  it("accepts the row's reference on a pack that has said nothing", () => {
    // The whole of the change: a row no longer arms a button, it names the
    // reference the pack is about to carry.
    expect(curatedAcceptance(twin(AS_BOUGHT.gtin))).toBe(
      curatedReference(AS_BOUGHT)
    );
  });

  it("carries the Declared state with it, because the id IS the state", () => {
    // A row asserting a Pairing target is the assertion that the pack is cooked
    // (§11), and nothing separate records it: the `fdc:` id this writes is the
    // whole of the claim, so there is no second act and no second datom.
    expect(curatedAcceptance(twin(COOKED.gtin))).toBe(curatedReference(COOKED));
  });

  it("says nothing about a pack nobody adjudicated", () => {
    expect(curatedAcceptance(twin("0000000000000"))).toBeUndefined();
  });

  it("never speaks over a pairing the person made themselves", () => {
    const own = withPairing(twin(AS_BOUGHT.gtin), "fdc:999999");

    expect(curatedAcceptance(own)).toBeUndefined();
  });

  it("is refused for good by a clear, which is the whole opt-out", () => {
    // **The opt-out needed nothing built.** The `✕` on the card writes
    // PAIRING_CLEARED, the gate reads that as this proposal's refusal, and a
    // refusal re-offered is the nag §14 already forbade. So the opt-out is one
    // tap, it is durable, and it syncs between devices like any other datom.
    const refusedPack = withPairing(twin(AS_BOUGHT.gtin), PAIRING_CLEARED);

    expect(refusedPack.attributes[FOOD_PAIRING_ATTR]).toBe(PAIRING_CLEARED);
    expect(curatedAcceptance(refusedPack)).toBeUndefined();
  });

  it("is idempotent, because accepting closes the gate it read", () => {
    // Which is what lets the hosts apply it from an effect rather than from a
    // one-shot hook: it fires once per pack and never again.
    const fresh = twin(AS_BOUGHT.gtin);
    const reference = curatedAcceptance(fresh)!;

    expect(curatedAcceptance(withPairing(fresh, reference))).toBeUndefined();
  });
});

describe("where a pairing nobody chose came from (§14)", () => {
  it("names the row a live pairing came out of the table", () => {
    // §7 keeps `food/pairing` a bare id carrying no name and no field list, so the
    // datom cannot say who asserted it. What can be said is that the table would
    // have proposed exactly this — which is what a card needs in order to point a
    // reader at the `ground` and let them check it.
    const accepted = withPairing(
      twin(AS_BOUGHT.gtin),
      curatedReference(AS_BOUGHT)
    );

    expect(curatedPairingApplied(accepted)?.gtin).toBe(AS_BOUGHT.gtin);
    expect(curatedPairingApplied(accepted)?.ground).toBe(AS_BOUGHT.ground);
  });

  it("claims nothing about a pairing the person picked themselves", () => {
    const own = withPairing(twin(AS_BOUGHT.gtin), "fdc:999999");

    expect(curatedPairingApplied(own)).toBeUndefined();
  });

  it("claims nothing about an unpaired or a refused pack", () => {
    expect(curatedPairingApplied(twin(AS_BOUGHT.gtin))).toBeUndefined();
    expect(
      curatedPairingApplied(withPairing(twin(AS_BOUGHT.gtin), PAIRING_CLEARED))
    ).toBeUndefined();
  });

  it("does not credit the table for the same id on a different barcode", () => {
    // The row is keyed to one pack. Another pack paired with the same reference
    // food is somebody's own judgement and is not the table's to claim.
    const elsewhere = withPairing(
      twin("0000000000000"),
      curatedReference(AS_BOUGHT)
    );

    expect(curatedPairingApplied(elsewhere)).toBeUndefined();
  });
});
