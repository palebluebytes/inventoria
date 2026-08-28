import { describe, it, expect, vi, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import {
  lookupBarcode,
  ProductNotFoundError,
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
} from "../../scripts/curated-drift.mjs";

// The drift rules behind the quarterly curated-snapshot check (#117). ADR-0046
// §4 pins each curated stand-in to a snapshot of its OFF record and accepts
// silent staleness as the cost, on the grounds that a snapshot which drifts is
// "wrong slowly and visibly at review" — which only holds while something looks.
// This is the something. What it must tell apart is what these tests fix: a
// panel that moved, a product that is gone, and a record that stopped being the
// single-ingredient one ADR-0046 §2 admitted.

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

describe("productFromResponse — is the pinned record still there?", () => {
  it("reads a successful v3 response as found", () => {
    const read = productFromResponse(200, unchanged());
    expect(read.found).toBe(true);
    expect(read.product?.product_name).toBe("Cacao Nibs");
  });

  it("reads a 404 as gone", () => {
    expect(productFromResponse(404, null).found).toBe(false);
  });

  it("reads v3's string failure status as gone", () => {
    expect(productFromResponse(200, { status: "failure" }).found).toBe(false);
  });

  it("reads v2's integer failure status as gone", () => {
    // The app's own lookup handles both; a check that disagreed with it would
    // report drift the app never sees, or miss what the app would.
    expect(productFromResponse(200, { status: 0 }).found).toBe(false);
  });

  it("reads a success with no product body as gone", () => {
    expect(productFromResponse(200, { status: "success" }).found).toBe(false);
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
});

describe("the check and the app agree on what 'gone' means", () => {
  // `productFromResponse` restates `lookupBarcode`'s gone-ness rules, because
  // the check runs where the app's module cannot be imported. Nothing but this
  // test keeps the two in step, and a disagreement is invisible either way: the
  // check would report a delisting the app never sees, or miss one it does.
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
    expect(productFromResponse(status, body).found).toBe(false);
  });

  it("both read a real product as present", async () => {
    const body = { code: "5400706613279", status: "success", product: {} };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
    } as Response);
    await expect(lookupBarcode("5400706613279")).resolves.toBeTruthy();
    expect(productFromResponse(200, body).found).toBe(true);
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
