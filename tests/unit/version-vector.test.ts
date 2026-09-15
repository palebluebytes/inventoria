/**
 * The version vector, against the real sqlite-wasm build (ADR-0075 §6, re-keyed
 * by ADR-0105 §5 and §6).
 *
 * It is tested against the engine rather than a fake because the claims that
 * matter are SQL's: that the greatest `(hlc_ms, hlc_ctr)` per device and domain
 * comes off **one row**, that "above this vector" is a per-device *and
 * per-domain* comparison rather than a scalar one, and that the SQL's answer to
 * *which domains is this row about* is the same as `domainsOfRow`'s. A mock
 * would agree with whatever the query said.
 *
 * Two refutations the record turns on are written out as tests of their own. A
 * row stamped **below** this device's greatest stamp still crosses, because it
 * came from a device the peer has never heard of — the bug a scalar watermark
 * would make invisible and permanent. And a row of a domain the peer has never
 * heard from a device it *has* heard from still crosses — the same bug reached
 * along the second axis, which is the whole of ADR-0105 §5.
 */
import { describe, it, expect, beforeEach } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  createLedgerSchema,
  cursorOf,
  importLedgerRows,
  readLedgerPage,
  readLedgerVersionVector,
  type LedgerCursor,
  type LedgerDb,
  type LedgerRow,
} from "../../src/lib/db/db.core";
import { carriedDeletionRow } from "../../src/lib/db/carried-deletion";
import {
  domainsOfRow,
  EMPTY_VERSION_VECTOR,
  mergeVersionVectors,
  readVersionVector,
  vectorOfRows,
  vectorWith,
  VersionVectorRefusedError,
  type VersionVector,
} from "../../src/lib/db/version-vector";
import {
  CONTENT_DOMAINS,
  ENTITY_PREFIXES,
  entityPrefixesOf,
} from "../../src/lib/facets/registry";

let sqlite3: any;
let db: LedgerDb;

beforeEach(async () => {
  sqlite3 ??= await (sqlite3InitModule as any)();
  db = freshLedger();
});

function freshLedger(): LedgerDb {
  const fresh = new sqlite3.oo1.DB();
  createLedgerSchema(fresh);
  return fresh;
}

/** One row, stamped by hand: these tests are about stamps, not about writes. */
const row = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  entity: "habit:1",
  attribute: "habit/name",
  value: '"Meditate"',
  time: 1_000,
  hlc_ms: 1_000,
  hlc_ctr: 0,
  device_id: "device_a",
  ...over,
});

const hold = (rows: LedgerRow[]) => importLedgerRows(db, rows);

/** A mark on one domain, which is the shape one axis of a vector takes. */
const at = (
  domain_id: string,
  hlc_ms: number,
  hlc_ctr = 0
): Record<string, { hlc_ms: number; hlc_ctr: number }> => ({
  [domain_id]: { hlc_ms, hlc_ctr },
});

/** Every row a holder of `vector` lacks, walked the way a sync sends them. */
function rowsAbove(vector: VersionVector, budgetBytes = 64 * 1024) {
  const all: LedgerRow[] = [];
  let after: LedgerCursor | null = null;
  for (let guard = 0; guard < 1_000; guard++) {
    const page = readLedgerPage(db, after, budgetBytes, { above: vector });
    if (page.length === 0) return all;
    all.push(...page);
    after = cursorOf(page[page.length - 1]);
  }
  throw new Error("the walk above a vector did not terminate");
}

describe("the vector is a read of the ledger", () => {
  it("is empty for an empty ledger, which is what a first sync sends", () => {
    expect(readLedgerVersionVector(db)).toEqual({});
  });

  it("names the greatest stamp this device holds from each device", () => {
    hold([
      row({ attribute: "a/1", hlc_ms: 1_000, hlc_ctr: 0 }),
      row({ attribute: "a/2", hlc_ms: 3_000, hlc_ctr: 0 }),
      row({ attribute: "b/1", hlc_ms: 2_000, hlc_ctr: 7, device_id: "dev_b" }),
    ]);
    expect(readLedgerVersionVector(db)).toEqual({
      device_a: at("habits", 3_000),
      dev_b: at("habits", 2_000, 7),
    });
  });

  it("keeps one device's domains apart, which is the second axis", () => {
    hold([
      row({ entity: "habit:1", hlc_ms: 5_000 }),
      row({ entity: "fdc:1", attribute: "food/name", hlc_ms: 2_000 }),
    ]);
    expect(readLedgerVersionVector(db)).toEqual({
      device_a: { ...at("habits", 5_000), ...at("food", 2_000) },
    });
  });

  it("takes both halves of the stamp off one row", () => {
    // `MAX(hlc_ms), MAX(hlc_ctr)` would report (3000, 9) here, and the peer
    // would be told to withhold a row nobody holds.
    hold([
      row({ attribute: "a/1", hlc_ms: 1_000, hlc_ctr: 9 }),
      row({ attribute: "a/2", hlc_ms: 3_000, hlc_ctr: 0 }),
    ]);
    expect(readLedgerVersionVector(db)).toEqual({
      device_a: at("habits", 3_000),
    });
  });

  it("breaks a same-millisecond tie on the counter", () => {
    hold([
      row({ attribute: "a/1", hlc_ms: 1_000, hlc_ctr: 4 }),
      row({ attribute: "a/2", hlc_ms: 1_000, hlc_ctr: 11 }),
    ]);
    expect(readLedgerVersionVector(db)).toEqual({
      device_a: at("habits", 1_000, 11),
    });
  });

  // ADR-0105 §5's *an entity with no owning domain has no vector entry*, which
  // `pnpm check:entities` is what keeps hypothetical.
  it("gives an entity no domain owns no entry at all", () => {
    hold([row({ entity: "nobody:1", attribute: "x/1" })]);
    expect(readLedgerVersionVector(db)).toEqual({});
  });
});

// ---------------------------------------------------------------------------

describe("a Carried deletion is about what it deletes", () => {
  const wipe = (
    prefixes: readonly string[],
    over: Partial<LedgerRow> = {}
  ) => ({
    ...carriedDeletionRow(
      { hlc_ms: 4_000, hlc_ctr: 0, device_id: "device_a" },
      prefixes
    ),
    ...over,
  });

  it("marks a food wipe under food, and never under the Jar domain", () => {
    hold([wipe(entityPrefixesOf("food"))]);
    expect(readLedgerVersionVector(db)).toEqual({
      device_a: at("food", 4_000),
    });
  });

  it("marks a wipe under every domain its prefix list names", () => {
    hold([wipe(["fdc:", "notes:"])]);
    expect(readLedgerVersionVector(db)).toEqual({
      device_a: { ...at("food", 4_000), ...at("notes", 4_000) },
    });
  });

  it("marks a prefix this build does not know under nothing", () => {
    hold([wipe(["dreams:"])]);
    expect(readLedgerVersionVector(db)).toEqual({});
  });

  // The frozen list is quoted in the value, so a domain's prefix that merely
  // nests inside another's is not a match: `twin:` is not `"twin:gtin_"`.
  it("reads the frozen list whole rather than as loose text", () => {
    expect(domainsOfRow(wipe(["twin:gtin_"]))).toEqual(["items"]);
    expect(domainsOfRow(wipe(["twin:"]))).toEqual(["items"]);
    expect(domainsOfRow(wipe(["habit"]))).toEqual([]);
  });

  it("does not read an ordinary row's value as a prefix list", () => {
    expect(domainsOfRow(row({ value: '["fdc:"]' }))).toEqual(["habits"]);
  });
});

// ---------------------------------------------------------------------------

describe("what crosses is what the peer lacks", () => {
  it("sends the whole ledger to a peer holding nothing", () => {
    hold([row({ attribute: "a/1" }), row({ attribute: "a/2" })]);
    expect(rowsAbove(EMPTY_VERSION_VECTOR)).toHaveLength(2);
  });

  it("sends nothing to a peer whose vector matches this ledger's", () => {
    hold([row({ attribute: "a/1" }), row({ attribute: "a/2", hlc_ms: 2_000 })]);
    expect(rowsAbove(readLedgerVersionVector(db))).toEqual([]);
  });

  it("sends only what is past the peer's stamp for that device", () => {
    hold([
      row({ attribute: "a/1", hlc_ms: 1_000 }),
      row({ attribute: "a/2", hlc_ms: 2_000 }),
      row({ attribute: "a/3", hlc_ms: 3_000 }),
    ]);
    const sent = rowsAbove({ device_a: at("habits", 1_000) });
    expect(sent.map((r) => r.hlc_ms)).toEqual([2_000, 3_000]);
  });

  it("sends the counter's successors at the same millisecond", () => {
    hold([
      row({ attribute: "a/1", hlc_ms: 1_000, hlc_ctr: 0 }),
      row({ attribute: "a/2", hlc_ms: 1_000, hlc_ctr: 1 }),
    ]);
    const sent = rowsAbove({ device_a: at("habits", 1_000) });
    expect(sent.map((r) => r.hlc_ctr)).toEqual([1]);
  });

  // The refutation of the scalar watermark, stated as a row rather than as an
  // argument: this row is below the greatest stamp in the ledger and still has
  // to cross, because the peer has never heard of the device that minted it.
  it("sends a row stamped below this ledger's maximum, from a device the peer lacks", () => {
    hold([
      row({ attribute: "a/1", hlc_ms: 9_000 }),
      row({ attribute: "b/1", hlc_ms: 40, device_id: "dev_b" }),
    ]);
    const sent = rowsAbove({ device_a: at("habits", 9_000) });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ device_id: "dev_b", hlc_ms: 40 });
  });

  // The same refutation along the second axis, which is ADR-0105 §5's whole
  // argument: the peer took this device's food up to 9,000 over a food lane and
  // has never held a Media row from it. A per-device mark of 9,000 would
  // withhold the Media row at 40 permanently and silently.
  it("sends a row of a domain the peer has never heard from a device it has", () => {
    hold([
      row({ entity: "fdc:1", attribute: "food/name", hlc_ms: 9_000 }),
      row({ entity: "isbn:1", attribute: "media/title", hlc_ms: 40 }),
    ]);
    const sent = rowsAbove({ device_a: at("food", 9_000) });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ entity: "isbn:1", hlc_ms: 40 });
  });

  it("holds each domain of one device to its own mark", () => {
    hold([
      row({ entity: "fdc:1", attribute: "food/name", hlc_ms: 1_000 }),
      row({ entity: "fdc:2", attribute: "food/name", hlc_ms: 3_000 }),
      row({ entity: "isbn:1", attribute: "media/title", hlc_ms: 2_000 }),
    ]);
    const sent = rowsAbove({
      device_a: { ...at("food", 1_000), ...at("media", 5_000) },
    });
    expect(sent.map((r) => r.entity)).toEqual(["fdc:2"]);
  });

  // A deletion stands on one axis per domain it names, so the peer holds it
  // only where every one of them is up to date.
  it("sends a Carried deletion while any domain it names is behind", () => {
    hold([
      carriedDeletionRow({ hlc_ms: 4_000, hlc_ctr: 0, device_id: "device_a" }, [
        "fdc:",
        "notes:",
      ]),
    ]);
    const caughtUp = { ...at("food", 9_000), ...at("notes", 9_000) };
    expect(rowsAbove({ device_a: caughtUp })).toEqual([]);
    expect(
      rowsAbove({ device_a: { ...at("food", 9_000), ...at("notes", 40) } })
    ).toHaveLength(1);
  });

  it("sends nothing an entity no domain owns, even on a first sync", () => {
    hold([row({ entity: "nobody:1", attribute: "x/1" })]);
    expect(rowsAbove(EMPTY_VERSION_VECTOR)).toEqual([]);
  });

  it("narrows with a Facet's prefixes at the same time", () => {
    hold([
      row({ entity: "habit:1", attribute: "a/1" }),
      row({ entity: "fdc:1", attribute: "a/1" }),
    ]);
    const page = readLedgerPage(db, null, 64 * 1024, {
      above: EMPTY_VERSION_VECTOR,
      entityPrefixes: ["fdc:"],
    });
    expect(page.map((r) => r.entity)).toEqual(["fdc:1"]);
  });

  it("keeps paging under the byte budget, so a photo crosses on its own", () => {
    hold([
      row({ attribute: "a/1", value: JSON.stringify("x".repeat(4_000)) }),
      row({ attribute: "a/2", value: JSON.stringify("y".repeat(4_000)) }),
    ]);
    const page = readLedgerPage(db, null, 4_100, {
      above: EMPTY_VERSION_VECTOR,
    });
    expect(page).toHaveLength(1);
    expect(rowsAbove(EMPTY_VERSION_VECTOR, 4_100)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------

/**
 * The one rule this module writes twice — once in JavaScript for the rows a
 * deposit carries, once in SQL for the query and the `WHERE` — held to itself
 * one row at a time, through the engine that runs the second copy.
 *
 * A row alone in a ledger makes the vector say exactly which axes that row
 * stands on, so the comparison is per row rather than per maximum.
 */
describe("the SQL and the fold attribute a row the same way", () => {
  const stamp = { hlc_ms: 7_000, hlc_ctr: 0, device_id: "device_a" };
  const corpus: LedgerRow[] = [
    // Every declared prefix, so the corpus cannot fall behind the roster: a
    // prefix added tomorrow is compared tomorrow without anyone listing it
    // here. `deletion:` comes with them, under an attribute that is not the
    // Carried deletion's — the Jar domain's own rows stand on no axis.
    ...ENTITY_PREFIXES.map((prefix) => row({ entity: `${prefix}1` })),
    // An entity no domain owns, which the roster cannot supply.
    row({ entity: "nobody:1" }),
    // A value that looks like a frozen prefix list on a row that is not one.
    row({ entity: "habit:1", value: '["fdc:","notes:"]' }),
    carriedDeletionRow(stamp, entityPrefixesOf("food")),
    carriedDeletionRow(stamp, ["fdc:", "notes:"]),
    carriedDeletionRow(stamp, ["dreams:"]),
    carriedDeletionRow(stamp, []),
    // A frozen list that will not parse: both copies read it as text, so both
    // find the one prefix it does contain.
    { ...carriedDeletionRow(stamp, ["fdc:"]), value: '["fdc:"' },
  ];

  // A corpus nobody can see the holes in reads like a corpus with none, so the
  // one property it is for is asserted rather than left to the spread above.
  it("compares every prefix the registry declares", () => {
    const stood = corpus.map((one) => one.entity);
    expect(
      ENTITY_PREFIXES.filter(
        (prefix) => !stood.some((entity) => entity.startsWith(prefix))
      )
    ).toEqual([]);
  });

  it.each(
    corpus.map((one, place) => [`${place}: ${one.entity}`, one] as const)
  )("agrees about %s", (_what, one) => {
    const alone = freshLedger();
    importLedgerRows(alone, [one]);
    expect(readLedgerVersionVector(alone)).toEqual(vectorOfRows([one]));
  });
});

// ---------------------------------------------------------------------------

describe("two sound statements about one peer are merged, not replaced", () => {
  it("takes the greater mark on each axis of each device", () => {
    expect(
      mergeVersionVectors(
        { device_a: { ...at("food", 5_000), ...at("media", 1_000) } },
        { device_a: { ...at("food", 2_000), ...at("notes", 3_000) } }
      )
    ).toEqual({
      device_a: {
        ...at("food", 5_000),
        ...at("media", 1_000),
        ...at("notes", 3_000),
      },
    });
  });

  // ADR-0105 §9: a Rations wake deposits food and leaves the other five to the
  // root's. The marks it raises are the domains it carried and no others, which
  // is the statement a per-device scalar could not make.
  it("raises only the domains a partial deposit carried", () => {
    const carried = [
      row({ entity: "fdc:1", hlc_ms: 6_000 }),
      row({ entity: "event:consume_1", hlc_ms: 8_000 }),
    ];
    expect(vectorWith({ device_a: at("media", 2_000) }, carried)).toEqual({
      device_a: { ...at("media", 2_000), ...at("food", 8_000) },
    });
  });
});

// ---------------------------------------------------------------------------

describe("a vector that arrived from somewhere else is checked", () => {
  it("reads the shape a peer sends", () => {
    expect(readVersionVector({ dev_b: at("food", 2, 1) })).toEqual({
      dev_b: at("food", 2, 1),
    });
  });

  it("reads an empty object as the empty vector", () => {
    expect(readVersionVector({})).toEqual({});
  });

  // The older reader refused this as *not a whole stamp*, because there was
  // nothing below a device but the stamp itself. A device with no axes is now a
  // sayable thing, and it says the same as the device being absent: the peer
  // holds nothing from it, so every one of its rows crosses.
  it("reads a device with no domains as a device it holds nothing from", () => {
    expect(readVersionVector({ dev_b: {} })).toEqual({ dev_b: {} });
    hold([row({ device_id: "dev_b" })]);
    expect(rowsAbove({ dev_b: {} })).toHaveLength(1);
  });

  // A domain this build has never heard of is inert rather than a refusal: no
  // row here can be attributed to it, so it matches nothing and withholds
  // nothing, and refusing would break an older device against a newer one for
  // no gain.
  it("carries a domain this build does not know rather than refusing it", () => {
    expect(readVersionVector({ dev_b: at("dreams", 2) })).toEqual({
      dev_b: at("dreams", 2),
    });
  });

  it.each([
    ["an array", []],
    ["null", null],
    ["a number", 7],
  ])("refuses %s, which is not a vector at all", (_what, raw) => {
    expect(() => readVersionVector(raw)).toThrow(VersionVectorRefusedError);
  });

  it.each([
    ["half a stamp", { dev_b: { hlc_ms: 2 } }],
    ["a stamp that is not whole", { dev_b: { hlc_ms: 2.5, hlc_ctr: 0 } }],
    ["a negative stamp", { dev_b: { hlc_ms: -1, hlc_ctr: 0 } }],
    ["a stamp that is text", { dev_b: { hlc_ms: "2", hlc_ctr: 0 } }],
    ["no stamp at all", { dev_b: null }],
    ["half a stamp on a domain", { dev_b: { food: { hlc_ms: 2 } } }],
    ["a domain marked with text", { dev_b: { food: "tomorrow" } }],
    ["a domain with no name", { dev_b: { "": { hlc_ms: 2, hlc_ctr: 0 } } }],
  ])("refuses %s rather than syncing off it", (_what, raw) => {
    expect(() => readVersionVector(raw)).toThrow(VersionVectorRefusedError);
  });

  it("names the device whose entry is broken, and never what it said", () => {
    try {
      readVersionVector({ dev_b: { hlc_ms: "tomorrow", hlc_ctr: 0 } });
      expect.unreachable("a broken entry was accepted");
    } catch (refusal) {
      expect(String(refusal)).toContain("dev_b");
      expect(String(refusal)).not.toContain("tomorrow");
    }
  });

  // The id arrives off a wire and the refusal is rendered, so it is quoted back
  // only while it is label-sized (#227).
  it("describes an oversized device id rather than echoing it", () => {
    const shouting = "z".repeat(500);
    try {
      readVersionVector({ [shouting]: { hlc_ms: -1, hlc_ctr: 0 } });
      expect.unreachable("a broken entry was accepted");
    } catch (refusal) {
      expect(String(refusal)).not.toContain(shouting);
      expect(String(refusal)).toContain("500 characters");
    }
  });
});

// ---------------------------------------------------------------------------

/**
 * ADR-0105 §11, both directions, and the second one is why the first is safe.
 *
 * The older build is quoted rather than described: `oldBuildRead` is the body
 * `readVersionVector` had before #419, copied verbatim, so what the reverse
 * direction does on a device that has not updated is a fact this suite runs
 * rather than a claim it makes.
 */
describe("an older device's vector reads as this one", () => {
  it("assigns an old flat mark to every content domain", () => {
    const read = readVersionVector({ dev_b: { hlc_ms: 2, hlc_ctr: 1 } });
    expect(Object.keys(read.dev_b).sort()).toEqual(
      CONTENT_DOMAINS.map((domain) => domain.id).sort()
    );
    expect(read.dev_b.food).toEqual({ hlc_ms: 2, hlc_ctr: 1 });
  });

  // Sound because an old-shape vector can only have come from an unfiltered
  // lane, so the peer genuinely holds every domain below that mark: nothing
  // below it crosses, whichever domain it belongs to.
  it("withholds every domain below the mark it was given", () => {
    hold([
      row({ entity: "fdc:1", hlc_ms: 1_000 }),
      row({ entity: "isbn:1", hlc_ms: 1_000 }),
      row({ entity: "habit:1", hlc_ms: 3_000 }),
    ]);
    const sent = rowsAbove(
      readVersionVector({ device_a: { hlc_ms: 2_000, hlc_ctr: 0 } })
    );
    expect(sent.map((r) => r.entity)).toEqual(["habit:1"]);
  });

  it("fails loudly on a build that expects the old shape", () => {
    expect(() => oldBuildRead({ dev_b: at("food", 2, 1) })).toThrow(
      "is not a whole stamp"
    );
  });
});

/** `readVersionVector` as it stood before #419, verbatim (ADR-0075 §6). */
function oldBuildRead(raw: unknown): Record<string, unknown> {
  const isStampPart = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  const isMark = (
    value: unknown
  ): value is { hlc_ms: number; hlc_ctr: number } =>
    value !== null &&
    typeof value === "object" &&
    "hlc_ms" in value &&
    "hlc_ctr" in value &&
    isStampPart(value.hlc_ms) &&
    isStampPart(value.hlc_ctr);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new VersionVectorRefusedError("a version vector is a JSON object.");
  }
  const vector: Record<string, { hlc_ms: number; hlc_ctr: number }> = {};
  for (const device_id of Object.keys(raw)) {
    if (device_id.length === 0) {
      throw new VersionVectorRefusedError(
        "a version vector is keyed by device, and one of its keys is empty."
      );
    }
    const mark: unknown = Reflect.get(raw, device_id);
    if (!isMark(mark)) {
      throw new VersionVectorRefusedError(
        `the entry for ${JSON.stringify(device_id)} is not a whole stamp.`
      );
    }
    vector[device_id] = { hlc_ms: mark.hlc_ms, hlc_ctr: mark.hlc_ctr };
  }
  return vector;
}
