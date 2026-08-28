import { describe, it, expect, vi, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import {
  lookupBarcode,
  ProductNotFoundError,
  OffUnreachableError,
} from "../../src/lib/food/open-food-facts";
// A plain-Node ops script, deliberately outside the app's tsconfig: the
// staleness check runs on a bare GitHub runner with no install step.
// @ts-ignore
import {
  countIngredients,
  productFromResponse,
  driftFindings,
  checkStandIns,
  formatReport,
  needsReVetting,
} from "../../scripts/curated-drift.mjs";

// The drift rules behind the quarterly curated-snapshot check (#117). ADR-0046
// §4 pins each curated stand-in to a snapshot of its OFF record and accepts
// silent staleness as the cost, on the grounds that a snapshot which drifts is
// "wrong slowly and visibly at review" — which only holds while something looks.
// This is the something. What it must tell apart is what these tests fix: a
// panel that moved, a product that is gone, a record that stopped being the
// single-ingredient one ADR-0046 §2 admitted — and, since #205, an entry the run
// never managed to read, which is evidence of none of the three.

/**
 * The product half of an OFF record, trimmed to the fields the drift rules
 * read. `nutriments` is spelled rather than left to `Record<string, unknown>`,
 * because the fixtures below spread it to move one value.
 */
interface OffProduct extends Record<string, unknown> {
  nutriments: Record<string, unknown>;
}

/** A pinned entry, trimmed to the fields the drift rules read. */
interface CuratedEntry {
  food: string;
  captured: string;
  snapshot: {
    code: string;
    status: string;
    product: OffProduct;
  };
}

// `overrides` is a partial of what `entry` builds rather than a bag of
// unknowns: a `Record<string, unknown>` spread widens `snapshot` itself to
// `unknown`, so the fixtures below could no longer read their own product.
const entry = (overrides: Partial<CuratedEntry> = {}): CuratedEntry => ({
  food: "cacao nibs",
  captured: "2026-08-18",
  snapshot: {
    code: "5400706613279",
    status: "success",
    product: {
      product_name: "Cacao Nibs",
      nutriments: {
        "energy-kcal_100g": 652,
        fat_100g: 55,
        sodium_100g: 0,
      },
      serving_quantity: 100,
      serving_size: "100 g",
      ingredients_text: "100% organic cacao nibs",
    },
  },
  ...overrides,
});

/** The product half of an OFF response, as the fetcher hands it over. */
const fetched = (product: OffProduct) => ({
  code: "5400706613279",
  status: "success",
  product,
});

const unchanged = () => fetched(entry().snapshot.product);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("countIngredients", () => {
  it("reads a single-ingredient text as one ingredient", () => {
    expect(countIngredients("100% organic cacao nibs")).toBe(1);
  });

  it("counts a comma-separated list", () => {
    expect(countIngredients("cocoa mass, sugar, soy lecithin")).toBe(3);
  });

  it("counts a text joined by 'and'", () => {
    expect(countIngredients("cocoa mass and sugar")).toBe(2);
  });

  it("counts a semicolon- or ampersand-separated list", () => {
    expect(countIngredients("sugar; cocoa butter")).toBe(2);
    expect(countIngredients("cocoa nibs & cane sugar")).toBe(2);
  });

  it("ignores trailing punctuation and empty segments", () => {
    expect(countIngredients("cacao nibs.")).toBe(1);
    expect(countIngredients("cocoa mass, sugar,")).toBe(2);
  });

  it("does not read an annotation as a second ingredient", () => {
    // "cacao nibs, 100%" still names one food. A segment has to carry a letter
    // to be an ingredient, which keeps the commonest false positive out.
    expect(countIngredients("cacao nibs, 100%")).toBe(1);
    expect(countIngredients("cocoa beans (100%)")).toBe(1);
  });

  it("reads an absent or blank text as no ingredients at all", () => {
    expect(countIngredients("")).toBe(0);
    expect(countIngredients(undefined)).toBe(0);
    expect(countIngredients("   ")).toBe(0);
  });
});

/**
 * The reason a read gives for not handing over a product. A guard rather than a
 * cast, because the two answers that carry one are exactly the two that are not
 * the product, and reaching for the field is how a caller says which it expects.
 */
const reasonFor = (status: number): string => {
  const read = productFromResponse(status, null);
  if (read.kind === "product")
    throw new Error(`expected no product for HTTP ${status}`);
  return read.reason;
};

describe("productFromResponse — is the pinned record still there?", () => {
  it("reads a successful v3 response as the product", () => {
    const read = productFromResponse(200, unchanged());
    if (read.kind !== "product")
      throw new Error(`expected the product, got ${read.kind}`);
    expect(read.product.product_name).toBe("Cacao Nibs");
  });

  it("reads a 404 as gone", () => {
    expect(productFromResponse(404, null).kind).toBe("delisted");
  });

  it("reads v3's string failure status as gone", () => {
    expect(productFromResponse(200, { status: "failure" }).kind).toBe(
      "delisted"
    );
  });

  it("reads v2's integer failure status as gone", () => {
    // The app's own lookup handles both; a check that disagreed with it would
    // report drift the app never sees, or miss what the app would.
    expect(productFromResponse(200, { status: 0 }).kind).toBe("delisted");
  });

  it("reads a success with no product body as gone", () => {
    expect(productFromResponse(200, { status: "success" }).kind).toBe(
      "delisted"
    );
  });

  it.each([429, 500, 502, 503, 504])(
    "reads HTTP %i as OFF failing to answer, never as gone",
    (status) => {
      // The defect this ticket fixes (#205): every non-200 used to fold into
      // "gone", so an outage during the quarterly run named a stand-in
      // delisted. Asserted for what it is NOT as well, because conflation is
      // the defect and only the negative catches it coming back.
      const read = productFromResponse(status, null);
      expect(read.kind).toBe("unreachable");
      expect(read.kind).not.toBe("delisted");
    }
  );

  it.each([400, 403])(
    "reads HTTP %i as an entry it did not read, not as a delisting",
    (status) => {
      // The app gives this class a third name — a plain `Error`, neither the
      // missing door nor an outage (#204) — because its two branches lead to
      // two different things to offer a user. This check's branches lead to two
      // different things to ask a REVIEWER, and a refused request asks the same
      // one a 502 does: do not re-vet the food, nothing about it was read.
      const read = productFromResponse(status, null);
      expect(read.kind).toBe("unreachable");
      expect(read.kind).not.toBe("delisted");
    }
  );
});

describe("needsReVetting — which findings are about the food", () => {
  // The line both readers of a run draw: `formatReport`'s closing advice, and
  // the exit summary in `curated-snapshot-check.mjs`, which is not otherwise
  // exercised. Every kind is named here so a fifth one cannot be added without
  // someone deciding which side of the line it falls on.
  it.each(["panel", "ingredients", "delisted"] as const)(
    "sends a %s finding to a human to re-vet",
    (kind) => {
      expect(needsReVetting({ kind, message: "x" })).toBe(true);
    }
  );

  it("does not, for an entry the run never read", () => {
    expect(needsReVetting({ kind: "unreachable", message: "x" })).toBe(false);
  });
});

describe("driftFindings — has the pinned panel moved?", () => {
  it("finds nothing when the record is unchanged", () => {
    expect(
      driftFindings(entry().snapshot.product, unchanged().product)
    ).toEqual([]);
  });

  /** The same record with one nutriment moved, everything else held still. */
  const moved = (name: string, value: unknown) =>
    driftFindings(entry().snapshot.product, {
      ...unchanged().product,
      nutriments: { ...unchanged().product.nutriments, [name]: value },
    });

  it("ignores a change inside the epsilon", () => {
    // 55 -> 55.2 g fat is under half a percent, and OFF publishes at a tenth of
    // a gram: a value that moves this little says nothing about the food.
    expect(moved("fat_100g", 55.2)).toEqual([]);
  });

  it("reports a macro that moved beyond the epsilon", () => {
    const findings = moved("fat_100g", 58);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("panel");
    expect(findings[0].message).toContain("fat_100g");
    expect(findings[0].message).toContain("55");
    expect(findings[0].message).toContain("58");
  });

  it("measures the epsilon against the value, not as a flat number", () => {
    // The same 0.2 twice: noise on 55 g of fat, and the whole of a sodium
    // figure that was zero. One rule, two answers, which is why the epsilon is
    // relative with a floor rather than a single number.
    expect(moved("fat_100g", 55.2)).toEqual([]);
    expect(moved("sodium_100g", 0.2)).toHaveLength(1);
  });

  it("reports a nutriment OFF has stopped reporting", () => {
    const findings = driftFindings(entry().snapshot.product, {
      ...unchanged().product,
      nutriments: { "energy-kcal_100g": 652, sodium_100g: 0 },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("panel");
    expect(findings[0].message).toContain("no longer reported");
  });

  it("reports a nutriment that stopped being a number", () => {
    const findings = moved("fat_100g", "unknown");
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("panel");
  });

  it("stays quiet about a nutriment the snapshot never carried", () => {
    // The snapshot is a TRIMMED capture (ADR-0046 §4), so OFF reporting more
    // than it holds is the normal case, not staleness. A nutriment gained
    // upstream is an enrichment to pick up at the next re-vet.
    expect(moved("iron_100g", 0.004)).toEqual([]);
  });

  it("reports a serving size that has moved", () => {
    // The mapper turns the serving fields into a `food/portions` entry, so a
    // changed `serving_quantity` changes how many grams a logged serving
    // weighs. That is as much what the user eats off as a macro is.
    const findings = driftFindings(entry().snapshot.product, {
      ...unchanged().product,
      serving_quantity: 15,
      serving_size: "15 g",
    });
    expect(findings).toHaveLength(2);
    expect(findings.every((f: { kind: string }) => f.kind === "panel")).toBe(
      true
    );
    expect(
      findings.map((f: { message: string }) => f.message).join(" ")
    ).toMatch(/serving_quantity.*serving_size/s);
  });

  it("reports serving data OFF has dropped", () => {
    const {
      serving_quantity: _q,
      serving_size: _s,
      ...withoutServing
    } = unchanged().product;
    expect(
      driftFindings(entry().snapshot.product, withoutServing)
    ).toHaveLength(2);
  });

  it("stays quiet about serving data the snapshot never carried", () => {
    const {
      serving_quantity: _q,
      serving_size: _s,
      ...pinnedWithout
    } = entry().snapshot.product;
    expect(driftFindings(pinnedWithout, unchanged().product)).toEqual([]);
  });

  it("reports a record that is no longer single-ingredient", () => {
    const findings = driftFindings(entry().snapshot.product, {
      ...unchanged().product,
      ingredients_text: "cocoa nibs, cane sugar",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("ingredients");
    expect(findings[0].message).toContain("cane sugar");
  });

  it("reports a record that has lost its ingredients text", () => {
    // Not compound, but no longer able to SHOW that it is not: ADR-0046 §2's
    // second admission reads the ingredients text, so a record without one
    // cannot evidence it any more.
    const { ingredients_text: _dropped, ...withoutText } = unchanged().product;
    const findings = driftFindings(entry().snapshot.product, withoutText);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("ingredients");
  });

  it("stays quiet when the text is reworded but still names one food", () => {
    expect(
      driftFindings(entry().snapshot.product, {
        ...unchanged().product,
        ingredients_text: "organic cacao nibs",
      })
    ).toEqual([]);
  });
});

describe("checkStandIns — the run across every pinned entry", () => {
  /** A fetcher that answers each barcode from a table, and counts its calls. */
  const fetcherFor = (answers: Record<string, unknown>) => {
    const calls: string[] = [];
    const fetchProduct = async (code: string) => {
      calls.push(code);
      const answer = answers[code];
      if (answer instanceof Error) throw answer;
      return answer;
    };
    return { fetchProduct, calls };
  };

  it("passes a run in which nothing has moved", async () => {
    const { fetchProduct } = fetcherFor({
      "5400706613279": { status: 200, body: unchanged() },
    });
    const results = await checkStandIns([entry()], { fetchProduct });
    expect(results).toHaveLength(1);
    expect(results[0].findings).toEqual([]);
  });

  it("reports a delisted product as its own kind", async () => {
    const { fetchProduct } = fetcherFor({
      "5400706613279": { status: 404, body: null },
    });
    const [result] = await checkStandIns([entry()], { fetchProduct });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].kind).toBe("delisted");
  });

  it.each([429, 502])(
    "reports HTTP %i as unchecked, and never as a delisting",
    async (status) => {
      // A stand-in that OFF was too busy to serve has not been shown to have
      // moved OR to have held still, and a `delisted` finding here would send a
      // human to re-run ADR-0046 §2's four admissions against a record nothing
      // happened to.
      const { fetchProduct } = fetcherFor({
        "5400706613279": { status, body: null },
      });
      const [result] = await checkStandIns([entry()], { fetchProduct });
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].kind).toBe("unreachable");
      expect(result.findings[0].message).toContain(String(status));
    }
  );

  it("still reports a 404 as a delisting, and says the snapshot answers on", async () => {
    const { fetchProduct } = fetcherFor({
      "5400706613279": { status: 404, body: null },
    });
    const [result] = await checkStandIns([entry()], { fetchProduct });
    expect(result.findings[0].kind).toBe("delisted");
    expect(result.findings[0].message).toContain("snapshot");
  });

  it("reports a request that failed rather than passing the entry", async () => {
    // A check that cannot reach OFF has not established that the snapshot is
    // sound; reporting "nothing has moved" would be a lie the quarterly cadence
    // makes expensive.
    const { fetchProduct } = fetcherFor({
      "5400706613279": new Error("getaddrinfo ENOTFOUND"),
    });
    const [result] = await checkStandIns([entry()], { fetchProduct });
    expect(result.findings[0].kind).toBe("unreachable");
    expect(result.findings[0].message).toContain("ENOTFOUND");
  });

  it("checks every entry, and keeps a clean one clean", async () => {
    const second = entry({
      food: "wattleseed",
      snapshot: {
        code: "9999999999999",
        status: "success",
        product: {
          product_name: "Wattleseed",
          nutriments: { fat_100g: 5 },
          ingredients_text: "wattleseed",
        },
      },
    });
    const { fetchProduct, calls } = fetcherFor({
      "5400706613279": { status: 200, body: unchanged() },
      "9999999999999": { status: 404, body: null },
    });
    const results = await checkStandIns([entry(), second], { fetchProduct });
    expect(calls).toEqual(["5400706613279", "9999999999999"]);
    expect(results[0].findings).toEqual([]);
    expect(results[1].findings[0].kind).toBe("delisted");
  });

  it("pauses between requests, and not before the first", async () => {
    // OFF asks callers to rate-limit; one request per second is well inside
    // their guidance and costs a list this short a few seconds a quarter.
    const paused: number[] = [];
    const { fetchProduct } = fetcherFor({
      "5400706613279": { status: 200, body: unchanged() },
      "9999999999999": { status: 200, body: unchanged() },
    });
    await checkStandIns([entry(), entry({ food: "second" })], {
      fetchProduct,
      pause: async (ms: number) => {
        paused.push(ms);
      },
    });
    expect(paused).toHaveLength(1);
    expect(paused[0]).toBeGreaterThanOrEqual(1000);
  });
});

describe("formatReport", () => {
  const report = (findings: { kind: string; message: string }[]) =>
    formatReport([
      {
        food: "cacao nibs",
        code: "5400706613279",
        captured: "2026-08-18",
        findings,
      },
    ]);

  it("names a clean entry, with the date its snapshot was captured", () => {
    const text = report([]);
    expect(text).toContain("cacao nibs");
    expect(text).toContain("2026-08-18");
    expect(text).toContain("ok");
  });

  it("carries each finding's own wording", () => {
    const text = report([
      { kind: "panel", message: "fat_100g: 55 -> 58" },
      { kind: "ingredients", message: "no longer single-ingredient" },
    ]);
    expect(text).toContain("fat_100g: 55 -> 58");
    expect(text).toContain("no longer single-ingredient");
  });

  it("says the snapshot is never rewritten by the check", () => {
    // ADR-0046 §4 snapshots values so an editable third-party number cannot
    // change the panel unseen; a job that quietly pulled the new one would undo
    // exactly that. The report has to say so, because it is the only place a
    // reader learns what to do next.
    expect(report([{ kind: "panel", message: "x" }])).toMatch(/re-vet/i);
  });

  it("does not ask for a re-vet on the strength of an entry it never read", () => {
    // The whole point of #205: an unreachable entry is not evidence about the
    // food. The closing advice has to say "run it again", and must not say the
    // thing that sends a human back through ADR-0046 §2's admissions.
    const text = report([
      { kind: "unreachable", message: "OFF did not answer (HTTP 502)" },
    ]);
    expect(text).toContain("UNCHECKED");
    expect(text).toMatch(/again/i);
    expect(text).not.toMatch(/re-vet/i);
  });

  it("says both things when a run has something read and something not", () => {
    const text = report([
      { kind: "panel", message: "fat_100g: 55 pinned, 58 on OFF today" },
      { kind: "unreachable", message: "OFF did not answer (HTTP 502)" },
    ]);
    expect(text).toMatch(/re-vet/i);
    expect(text).toMatch(/again/i);
  });

  it("labels a delisting and an unreachable entry differently", () => {
    // The two used to print the same word for a reader, because the same
    // finding kind carried both.
    expect(report([{ kind: "delisted", message: "x" }])).toContain("GONE");
    expect(report([{ kind: "unreachable", message: "x" }])).not.toContain(
      "GONE"
    );
  });
});

describe("the check and the app agree on what an OFF answer means", () => {
  // `productFromResponse` restates `lookupBarcode`'s rules by hand, because the
  // check runs on a bare GitHub runner where the app's module cannot be
  // imported. Nothing but this test keeps the two in step, and a disagreement is
  // invisible either way: the check would report a delisting the app never sees,
  // or miss one it does.
  //
  // It covers the WHOLE matrix, not just the shapes that mean gone (#205). The
  // three gone shapes were all it listed, and the two sides drifted apart in the
  // gap: #204 taught the app that a 429 or a 5xx is OFF failing to answer, while
  // the check went on folding every non-200 into gone, and this lock could not
  // see it. Every row below asserts what a status is AND what it is not, because
  // the defect on both sides was conflation, and only the negative catches it.
  //
  // What it cannot catch is a status ADDED to one side's rules and not the
  // other's, since both sides are read against the list written here. Every row
  // is therefore a status either side has to keep answering for, and the run of
  // them is what an edit to either copy has to survive.

  /** OFF answering with a failing status and no product body. */
  const offFailsWith = (status: number) =>
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status,
      json: async () => ({}),
    } as Response);

  const goneShapes: [string, number, unknown][] = [
    ["a 404", 404, null],
    ["v3's string failure", 200, { status: "failure" }],
    ["v2's integer failure", 200, { status: 0 }],
  ];

  it.each(goneShapes)("both read %s as gone", async (_name, status, body) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: status === 200,
      status,
      json: async () => body,
    } as Response);
    await expect(lookupBarcode("5400706613279")).rejects.toBeInstanceOf(
      ProductNotFoundError
    );
    expect(productFromResponse(status, body).kind).toBe("delisted");
  });

  it.each([429, 500, 502, 503, 504])(
    "both read HTTP %i as OFF failing to answer, and neither as gone",
    async (status) => {
      offFailsWith(status);
      await expect(lookupBarcode("5400706613279")).rejects.toBeInstanceOf(
        OffUnreachableError
      );
      await expect(lookupBarcode("5400706613279")).rejects.not.toBeInstanceOf(
        ProductNotFoundError
      );
      const read = productFromResponse(status, null);
      expect(read.kind).toBe("unreachable");
      expect(read.kind).not.toBe("delisted");
      // The check's own copy of `serviceDidNotAnswer` decides only the wording
      // of a reason it shares a kind with the row below, so the wording is what
      // pins it. Without this, that copy could be narrowed — or deleted — with
      // every other assertion in this file still green.
      expect(reasonFor(status)).toContain("did not answer");
    }
  );

  it.each([400, 403])(
    "neither reads HTTP %i as gone, and the two name it differently on purpose",
    async (status) => {
      offFailsWith(status);
      // The app has a third answer for this class and the check has two, which
      // is a deliberate divergence rather than drift. The app's two branches end
      // in two things to OFFER A USER — a capture form, or a retry — and a fault
      // it cannot name earns neither, so it gets a plain `Error` and the generic
      // banner. The check's two branches end in two things to ASK A REVIEWER,
      // and there a refused request asks exactly what a 502 asks: do not re-vet
      // this food, the run never read it.
      //
      // What the two sides must agree on is the negative, and that is what this
      // row locks: a status neither can explain is never evidence of a delisting.
      await expect(lookupBarcode("5400706613279")).rejects.not.toBeInstanceOf(
        ProductNotFoundError
      );
      await expect(lookupBarcode("5400706613279")).rejects.not.toBeInstanceOf(
        OffUnreachableError
      );
      const read = productFromResponse(status, null);
      expect(read.kind).not.toBe("delisted");
      expect(read.kind).toBe("unreachable");
      // Same kind as an outage, different sentence — a 403 arriving run after
      // run is OFF turning this caller away, which is worth a reader being able
      // to see. The two wordings are asserted apart so the statuses that pick
      // between them stay where the app put them.
      expect(reasonFor(status)).toContain("refused");
    }
  );

  it("both read a real product as present", async () => {
    const body = { code: "5400706613279", status: "success", product: {} };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
    } as Response);
    await expect(lookupBarcode("5400706613279")).resolves.toBeTruthy();
    expect(productFromResponse(200, body).kind).toBe("product");
  });
});

describe("the curated table under a bare Node", () => {
  it("loads with no bundler and no install step", () => {
    // The check reads `curated-stand-ins.ts` directly on a GitHub runner. A
    // runtime import added to that module would break this without breaking
    // anything a normal test run touches, so the guard belongs here rather than
    // in a quarterly job nobody watches.
    const load = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        'const m = await import("./src/lib/food/curated-stand-ins.ts");' +
          "process.stdout.write(String(m.CURATED_STAND_INS.length));",
      ],
      { encoding: "utf8" }
    );
    expect(load.stderr).toBe("");
    expect(load.status).toBe(0);
    expect(Number(load.stdout)).toBeGreaterThan(0);
  });
});
