import { describe, it, expect } from "vitest";
import {
  CURATED_PAIRINGS,
  CURATED_PAIRING_CEILING,
} from "../../src/lib/food/curated-pairings";
// The hand adjudication the seed is drawn from, and a plain-Node module too.
// @ts-ignore
import { ADJUDICATION, ACCEPTED } from "../../scripts/pairing-adjudication.mjs";
// A plain-Node gate script, deliberately outside the app's tsconfig: it reads
// files already in the repo and runs inside `pnpm check` (ADR-0113 §14).
// @ts-ignore
import {
  gtinFault,
  pairingFindings,
  readShipped,
} from "../../scripts/curated-pairing-check.mjs";

// The offline gate behind the Curated pairing table (ADR-0113 §14, #523).
//
// Nothing here can prove a row was hand-authored — the record says so itself.
// What these rules prove is narrower and checkable: that a row points at a food
// this app actually ships, at a barcode that is a barcode, once.

describe("gtinFault — is this string a barcode at all?", () => {
  it("accepts a real barcode out of the seed, check digit and all", () => {
    expect(gtinFault("8436578483167")).toBe(null);
  });

  it("refuses a digit string whose check digit does not close it", () => {
    // 8436578483167 with the last digit moved one on: the same length, the same
    // prefix, and not a barcode any pack carries.
    expect(gtinFault("8436578483168")).toContain("check digit");
  });

  it("refuses anything that is not digits", () => {
    expect(gtinFault("84365784831 67")).toContain("digits");
    expect(gtinFault("gtin:8436578483167")).toContain("digits");
  });

  it("refuses a length GS1 does not issue", () => {
    // Nine digits sits between UPC-A and EAN-13 and is no barcode at all. A
    // TWELVE-digit string is not this case: UPC-A is a length GS1 issues, so a
    // 13-digit code with a character dropped is caught by the check digit and
    // never by the length.
    expect(gtinFault("843657848")).toContain("length");
  });
});

describe("pairingFindings — does the table still hold?", () => {
  /** The two shipped sets, as the gate reads them: ids, and nothing else. */
  const holds = {
    idsBySet: {
      reference: new Set([171413, 174277]),
      "pairing-target": new Set([173740]),
    },
    standInGtins: new Set(["5010251341352"]),
  };

  /** A row of the shape ADR-0113 §14 fixes, with one field overridden. */
  const pairing = (over = {}) => ({
    gtin: "8436578483167",
    fdcId: 171413,
    set: "reference",
    product: "Aceite de oliva virgen extra",
    captured: "2026-09-17",
    ground: "Oil, olive. Same substance, no state change.",
    ...over,
  });

  it("passes a table whose every row resolves", () => {
    expect(
      pairingFindings(
        [pairing(), pairing({ gtin: "0078895126389", fdcId: 174277 })],
        holds
      )
    ).toEqual([]);
  });

  it("reports a row whose id is in the other set, and says which", () => {
    // The finding a derived `set` could never make: 173740 IS a food this app
    // ships, and the row calling it a Reference food is the whole error.
    const [finding] = pairingFindings([pairing({ fdcId: 173740 })], holds);
    expect(finding.kind).toBe("fdcId");
    expect(finding.detail).toContain("pairing-target");
  });

  it("reports a row whose id is in neither set", () => {
    const [finding] = pairingFindings([pairing({ fdcId: 999999 })], holds);
    expect(finding.kind).toBe("fdcId");
    expect(finding.detail).toContain("neither");
  });

  it("reports a barcode that is not one", () => {
    const [finding] = pairingFindings(
      [pairing({ gtin: "8436578483168" })],
      holds
    );
    expect(finding.kind).toBe("gtin");
  });

  it("reports a barcode the table names twice", () => {
    const twice = pairingFindings(
      [pairing(), pairing({ fdcId: 174277 })],
      holds
    );
    expect(twice).toHaveLength(1);
    expect(twice[0].kind).toBe("duplicate");
  });

  it("reports a row naming a set this app does not ship", () => {
    // Types erase. The gate loads the table through Node's type stripping, so
    // the union `set` declares is gone by the time these rules read the row, and
    // the generator ADR-0113 §14 says could write this file tomorrow is exactly
    // the writer that would put a third word here.
    const [finding] = pairingFindings([pairing({ set: "cooked" })], holds);
    expect(finding.kind).toBe("set");
    expect(finding.detail).toContain("cooked");
  });

  it("refuses a barcode that already carries a Curated stand-in", () => {
    // ADR-0113 §15: a stand-in is admitted on a proof that no reference table
    // carries that food, so pairing the same barcode to one asserts the
    // negation of the evidence that admitted it.
    const [finding] = pairingFindings(
      [pairing({ gtin: "5010251341352" })],
      holds
    );
    expect(finding.kind).toBe("stand-in");
  });
});

describe("the table as it ships", () => {
  it("stays under the ceiling that keeps it a table and not a store", () => {
    // ADR-0113 §14: reaching 100 means re-arguing the first reopening clause —
    // whether a shared pairing store is ours to hold — not raising the number.
    expect(CURATED_PAIRINGS.length).toBeLessThanOrEqual(
      CURATED_PAIRING_CEILING
    );
  });

  it("carries a ground a reviewer can read on every row", () => {
    // The one thing holding "curated only", and the reason it holds: a
    // submission path scales only by deleting this field, which a diff shows.
    for (const row of CURATED_PAIRINGS) {
      expect(row.ground.length).toBeGreaterThan(40);
      expect(row.captured).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.product.length).toBeGreaterThan(0);
    }
  });

  it("ships every pairing the hand adjudication made, and none it did not", () => {
    // ADR-0113 §14 ships the table SEEDED, because a table ratified and
    // delivering nothing is #62 in miniature. The seed is #243's 22 as-bought
    // pairings plus the 3 the Pairing target set closed — 25 of 35 twins.
    const seeded = new Set(CURATED_PAIRINGS.map((row) => row.gtin));
    const adjudicated = Object.entries(ADJUDICATION).filter(
      ([, verdict]: [string, any]) => verdict.verdict === "paired"
    );

    expect(adjudicated).toHaveLength(22);
    expect(Object.keys(ACCEPTED)).toHaveLength(3);
    for (const [gtin, verdict] of adjudicated as [string, any][]) {
      expect(seeded.has(gtin)).toBe(true);
      const row = CURATED_PAIRINGS.find((r) => r.gtin === gtin)!;
      expect(row.fdcId).toBe(verdict.fdcId);
      expect(row.set).toBe("reference");
    }
    for (const [gtin, accepted] of Object.entries(ACCEPTED) as [
      string,
      any,
    ][]) {
      const row = CURATED_PAIRINGS.find((r) => r.gtin === gtin)!;
      expect(row.fdcId).toBe(accepted.fdcId);
      expect(row.set).toBe("pairing-target");
    }
    expect(seeded.size).toBe(25);
  });

  it("clears the gate against the artifacts this repo ships", async () => {
    // The same three rules `pnpm check` runs, over the committed files rather
    // than fixtures, and through the gate's own wiring rather than a second
    // copy of it: every id resolves in the set its row names, every barcode is
    // one and appears once, and no barcode carries a Curated stand-in.
    const { pairings, ...shipped } = await readShipped(process.cwd());
    expect(pairings).toEqual(CURATED_PAIRINGS);
    expect(pairingFindings(pairings, shipped)).toEqual([]);
  });
});
