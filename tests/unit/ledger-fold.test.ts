/**
 * The one fold five census scripts now share, and the statement none of their
 * five copies carried: that the order is the app's own.
 *
 * Each copy compared `hlc_ms` then `hlc_ctr` and stopped, so ADR-0020's device-id
 * tiebreak was missing and two devices writing one attribute at the same stamp
 * decided a census by which line the export happened to hold first.
 * CODING_STANDARDS §2.2 names the canonical function; these are the assertions
 * that keep this module standing on it.
 *
 * `ledger-export.test.ts` next door is the other end of the same file format —
 * `src/lib/db/ledger-export.ts` WRITES an export, and this reads one back.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// A plain-Node ops library, deliberately outside the app's tsconfig, like the
// bundle and backup scripts beside it.
// @ts-ignore
import {
  foldLedgerExport,
  packQueries,
  readPackTwins,
} from "../../scripts/ledger-fold.mjs";

/** One export line. `device_id` is part of the key, which is the point below. */
const datom = (
  entity: string,
  attribute: string,
  value: unknown,
  hlc_ms: number,
  hlc_ctr = 0,
  device_id = "device-a"
) =>
  JSON.stringify({
    entity,
    attribute,
    value: JSON.stringify(value),
    time: hlc_ms,
    hlc_ms,
    hlc_ctr,
    device_id,
  });

/** The export's own first line: a header carrying no entity (ADR-0064 §1). */
const HEADER = JSON.stringify({
  artifact: "inventoria-ledger",
  schema_version: 1,
  exported_at: 1789457391902,
  device_id: "device-a",
  row_count: 9,
  scope: { facet_id: "food", entity_prefixes: ["gtin:", "recipe:"] },
});

let dir: string;
let written = 0;
const exportOf = (...lines: string[]) => {
  const path = join(dir, `${(written += 1)}.jsonl`);
  writeFileSync(path, [HEADER, ...lines].join("\n") + "\n");
  return path;
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "inventoria-ledger-fold-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("folding an export to current state", () => {
  it("keeps the latest datom per (entity, attribute)", () => {
    const ledger = foldLedgerExport(
      exportOf(
        datom("gtin:1", "food/name", "as captured", 1000),
        datom("gtin:1", "food/name", "as corrected", 2000),
        datom("gtin:1", "nutrition/info", { calories: 116 }, 1000)
      )
    );

    // A twin edited after capture has to read as it stands now, or a census
    // measures a product that was superseded.
    expect(ledger.get("gtin:1")).toEqual({
      "food/name": "as corrected",
      "nutrition/info": { calories: 116 },
    });
  });

  it("orders by the counter where the millisecond ties", () => {
    const ledger = foldLedgerExport(
      exportOf(
        datom("gtin:1", "food/name", "second", 1000, 1),
        datom("gtin:1", "food/name", "first", 1000, 0)
      )
    );

    expect(ledger.get("gtin:1")["food/name"]).toBe("second");
  });

  it("breaks a tie on the device id, which no hand-rolled copy did", () => {
    // ADR-0020's total order is ms, then counter, then device. Without the third
    // key these two rows are incomparable and the winner was whichever the file
    // happened to hold first — so one export could answer a census two ways.
    const ordered = foldLedgerExport(
      exportOf(
        datom("gtin:1", "food/name", "from a", 1000, 0, "device-a"),
        datom("gtin:1", "food/name", "from b", 1000, 0, "device-b")
      )
    );
    const reversed = foldLedgerExport(
      exportOf(
        datom("gtin:1", "food/name", "from b", 1000, 0, "device-b"),
        datom("gtin:1", "food/name", "from a", 1000, 0, "device-a")
      )
    );

    expect(ordered.get("gtin:1")["food/name"]).toBe("from b");
    expect(reversed.get("gtin:1")["food/name"]).toBe("from b");
  });

  it("skips the export's header line rather than folding it as an entity", () => {
    const ledger = foldLedgerExport(
      exportOf(datom("gtin:1", "food/name", "x", 1))
    );

    expect([...ledger.keys()]).toEqual(["gtin:1"]);
  });

  it("narrows to one entity prefix where a caller asks for one", () => {
    const lines = [
      datom("gtin:1", "food/name", "a pack", 1),
      datom("recipe:1", "recipe/name", "a dish", 1),
    ];

    expect([...foldLedgerExport(exportOf(...lines)).keys()]).toEqual([
      "gtin:1",
      "recipe:1",
    ]);
    expect([
      ...foldLedgerExport(exportOf(...lines), {
        entityPrefix: "recipe:",
      }).keys(),
    ]).toEqual(["recipe:1"]);
  });
});

describe("reading the pack twins a census measures", () => {
  const OFF = {
    raw_data: {
      product: {
        product_name: "Alubia roja cocida",
        categories_tags: ["en:legumes", "en:kidney-beans", "es:alubias"],
      },
    },
  };

  it("reports when the pack was first seen, not when it was last edited", () => {
    const [twin] = readPackTwins(
      exportOf(
        datom("gtin:5010251341352", "food/name", "as captured", 1000),
        datom("gtin:5010251341352", "food/name", "as corrected", 9000),
        datom("gtin:5010251341352", "provenance/raw", OFF, 9000)
      )
    );

    expect(twin.captured).toBe(1000);
    expect(twin.name).toBe("as corrected");
    expect(twin.gtin).toBe("5010251341352");
  });

  it("finds the OFF record under either spelling of the attribute", () => {
    // ADR-0086 §5 renamed `twin/raw_provenance` to `provenance/raw` and accepted
    // that datoms already written stay under the old name, so a real ledger
    // carries both and a census of the POPULATION wants whichever is there.
    const under = (attribute: string) =>
      readPackTwins(exportOf(datom("gtin:1", attribute, OFF, 1)))[0];

    expect(under("provenance/raw").productName).toBe("Alubia roja cocida");
    expect(under("twin/raw_provenance").productName).toBe("Alubia roja cocida");
    expect(under("provenance/raw").hasOffRecord).toBe(true);
  });

  it("says so plainly for a pack with no OFF record behind it", () => {
    const [twin] = readPackTwins(
      exportOf(datom("gtin:1", "food/name", "hand entered", 1))
    );

    expect(twin.hasOffRecord).toBe(false);
    expect(twin.productName).toBeNull();
    expect(twin.categoriesTags).toEqual([]);
  });
});

describe("#243's query construction", () => {
  it("keeps the English tags only, most specific first", () => {
    // OFF's taxonomy is canonically English however the pack is written, and it
    // orders a tag list broad to specific — so it is read backwards, and a
    // language-local leaf is one the corpus cannot answer.
    const { tags, name } = packQueries({
      productName: "Alubia roja cocida",
      name: "Alubia roja",
      categoriesTags: ["en:legumes", "en:kidney-beans", "es:alubias"],
    });

    expect(tags).toEqual(["kidney beans", "legumes"]);
    expect(name).toBe("Alubia roja cocida");
  });

  it("falls back to the twin's own name where OFF named nothing", () => {
    const { name } = packQueries({
      productName: null,
      name: "Alubia roja",
      categoriesTags: [],
    });

    expect(name).toBe("Alubia roja");
  });
});
