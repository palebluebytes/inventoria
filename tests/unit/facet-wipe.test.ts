import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  appendDatoms,
  censusByEntityPrefix,
  countDatomsByEntityPrefix,
  createLedgerSchema,
  countDatoms,
  deleteDatomsByEntityPrefix,
  execRows,
  type LedgerDb,
} from "../../src/lib/db/db.core";
import { createHlc, type Hlc } from "../../src/lib/db/hlc";
import {
  TRACKED_DOMAINS,
  entityPrefixesOf,
  storagePrefixesOf,
} from "../../src/lib/facets/registry";
import {
  domainCensusGroups,
  facetStorageKeys,
  planFacetWipe,
  runFacetWipe,
  wipeFacetStorage,
} from "../../src/lib/facets/facet-wipe";

// The real sqlite-wasm Node build, as `db-append-only.test.ts` uses it: the
// claim under test is what one SQL predicate matches, so a fake would be
// asserting the fake.
let db: LedgerDb;
let clock: Hlc;

/** One entity per prefix the registry declares, so nothing here is hand-listed. */
function seedOnePerPrefix(): { entity: string; domain: string }[] {
  const seeded: { entity: string; domain: string }[] = [];
  for (const domain of TRACKED_DOMAINS) {
    for (const prefix of domain.entityPrefixes) {
      seeded.push({ entity: `${prefix}seed`, domain: domain.id });
    }
  }
  appendDatoms(
    db,
    seeded.map((s) => ({
      entity: s.entity,
      attribute: "twin/name",
      value: s.entity,
      time: 1000,
    })),
    clock
  );
  return seeded;
}

function entities(): string[] {
  return execRows<{ entity: string }>(
    db,
    "SELECT DISTINCT entity FROM datoms ORDER BY entity;"
  ).map((r) => r.entity);
}

beforeEach(async () => {
  const sqlite3 = await (sqlite3InitModule as any)();
  db = new sqlite3.oo1.DB();
  createLedgerSchema(db);
  let wall = 1000;
  clock = createHlc("dev-a", { wallClock: () => wall++ });
});

describe("the scoped wipe's ledger predicate", () => {
  it("takes food's rows and nothing else, in a jar holding every domain", () => {
    const seeded = seedOnePerPrefix();

    const taken = deleteDatomsByEntityPrefix(db, entityPrefixesOf("food"));

    const food = seeded.filter((s) => s.domain === "food");
    expect(taken).toBe(food.length);
    expect(entities()).toEqual(
      seeded
        .filter((s) => s.domain !== "food")
        .map((s) => s.entity)
        .sort()
    );
  });

  it("leaves rows no domain owns standing", () => {
    seedOnePerPrefix();
    appendDatoms(
      db,
      [
        {
          entity: "settings/legacy",
          attribute: "settings/nutrition_targets",
          value: {},
          time: 1000,
        },
      ],
      clock
    );

    deleteDatomsByEntityPrefix(db, entityPrefixesOf("food"));

    expect(entities()).toContain("settings/legacy");
  });

  // `food:custom_` and `event:consume_` both end in an underscore, which is a
  // single-character wildcard to SQL's LIKE. A predicate written with LIKE
  // takes `food:customer_1` as well, and says the right number while doing it.
  it("matches a prefix literally, so an underscore is not a wildcard", () => {
    appendDatoms(
      db,
      [
        {
          entity: "food:customer_1",
          attribute: "twin/name",
          value: "x",
          time: 1,
        },
        {
          entity: "event:consumed_1",
          attribute: "twin/name",
          value: "x",
          time: 1,
        },
        {
          entity: "food:custom_1",
          attribute: "twin/name",
          value: "x",
          time: 1,
        },
      ],
      clock
    );

    const taken = deleteDatomsByEntityPrefix(db, entityPrefixesOf("food"));

    expect(taken).toBe(1);
    expect(entities()).toEqual(["event:consumed_1", "food:customer_1"]);
  });

  it("counts exactly what it will take, before it takes it", () => {
    seedOnePerPrefix();
    const prefixes = entityPrefixesOf("food");

    const counted = countDatomsByEntityPrefix(db, prefixes);
    const taken = deleteDatomsByEntityPrefix(db, prefixes);

    expect(counted).toBe(taken);
    expect(countDatomsByEntityPrefix(db, prefixes)).toBe(0);
  });

  it("takes nothing when it is given nothing", () => {
    seedOnePerPrefix();
    const before = countDatoms(db);

    expect(deleteDatomsByEntityPrefix(db, [])).toBe(0);
    expect(countDatoms(db)).toBe(before);
  });

  it("censuses every domain in one pass, and the total over all of them", () => {
    const seeded = seedOnePerPrefix();

    const census = censusByEntityPrefix(db, domainCensusGroups());

    expect(census.total).toBe(seeded.length);
    for (const domain of TRACKED_DOMAINS) {
      expect(census.counts[domain.id]).toBe(
        seeded.filter((s) => s.domain === domain.id).length
      );
    }
  });
});

// ---------------------------------------------------------------------------
// The `localStorage` half
// ---------------------------------------------------------------------------

/** A store with the two members key enumeration needs, which a Map alone lacks. */
function makeFakeLocalStorage(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    store,
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

/** What stays is the interesting half, so the fake jar holds one of each. */
const OTHER_KEYS = {
  inventoria_pref_log_export: "true",
  inventoria_logs_paused: "[]",
  inventoria_secret_off_password: "hunter2",
  inventoria_secret_tmdb_api_key: "k",
  inventoria_device_scraper_proxy_url: "https://example.invalid/",
  inventoria_habit_categories: "[]",
  inventoria_test_state: "{}",
};

const FOOD_KEYS = {
  inventoria_pref_food_targets: "{}",
  inventoria_pref_food_log_export: "true",
  inventoria_pref_visible_nutrients: "[]",
  inventoria_pref_round_nutrition: "true",
  // The search channel's records. Its key follows the channel's name, not
  // food's `pref` namespace, which is why the derivation reads the facility
  // rather than the registry's prefixes alone.
  inventoria_log_search: "[]",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the scoped wipe's storage predicate", () => {
  beforeEach(async () => {
    vi.stubGlobal(
      "localStorage",
      makeFakeLocalStorage({ ...OTHER_KEYS, ...FOOD_KEYS })
    );
    // Registering the search channel is what puts its key in food's set.
    await import("../../src/lib/logs/search-log");
  });

  it("names food's declared keys and its own log channel's", () => {
    expect(facetStorageKeys("food").sort()).toEqual(
      Object.keys(FOOD_KEYS).sort()
    );
  });

  it("removes exactly those, and leaves every other key standing", () => {
    const removed = wipeFacetStorage("food");

    expect(removed).toBe(Object.keys(FOOD_KEYS).length);
    expect([...(localStorage as any).store.keys()].sort()).toEqual(
      Object.keys(OTHER_KEYS).sort()
    );
  });

  it("names no key it was not given a prefix for", () => {
    // Every key it takes is under one of food's declared prefixes or is one of
    // its channels' — the derivation, restated as a property.
    const prefixes = storagePrefixesOf("food");
    for (const key of facetStorageKeys("food")) {
      const declared = prefixes.some((p) => key.startsWith(p));
      const channel = key === "inventoria_log_search";
      expect(declared || channel).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// What the dialog is told
// ---------------------------------------------------------------------------

describe("the wipe's plan", () => {
  const census = (counts: Record<string, number>) => ({
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    counts,
  });

  it("counts what goes, what stays, and names only the domains holding rows", () => {
    const plan = planFacetWipe(
      "food",
      census({
        food: 120,
        media: 9,
        items: 0,
        habits: 4,
        calendar: 0,
        notes: 0,
      }),
      ["inventoria_pref_food_targets"]
    );

    expect(plan.datomsGoing).toBe(120);
    expect(plan.datomsStaying).toBe(13);
    expect(plan.stayingDomains.map((d) => d.name)).toEqual(["Media", "Habits"]);
    expect(plan.storageGoing).toBe(1);
  });

  it("names nothing when the jar holds nothing but food", () => {
    const plan = planFacetWipe("food", census({ food: 40 }), []);

    expect(plan.datomsStaying).toBe(0);
    expect(plan.stayingDomains).toEqual([]);
  });

  // Rows under no domain's prefix are still rows that survive, and the figure
  // has to say so — but there is no name to give them, so they are counted and
  // not listed.
  it("counts rows no domain owns among what stays, without naming them", () => {
    const plan = planFacetWipe("food", { total: 50, counts: { food: 40 } }, []);

    expect(plan.datomsStaying).toBe(10);
    expect(plan.stayingDomains).toEqual([]);
  });

  it("takes the whole of the Facet's registered prefix set", () => {
    const plan = planFacetWipe("food", census({ food: 1 }), []);
    expect(plan.entityPrefixes).toEqual(entityPrefixesOf("food"));
  });
});

// ---------------------------------------------------------------------------
// One run
// ---------------------------------------------------------------------------

describe("one run of the wipe", () => {
  beforeEach(async () => {
    vi.stubGlobal(
      "localStorage",
      makeFakeLocalStorage({ ...OTHER_KEYS, ...FOOD_KEYS })
    );
    // Registered here as well as above, so these cases hold when this describe
    // is the only one that runs: `FOOD_KEYS` counts the channel's key, and the
    // channel is in the registry only because some module imported it.
    await import("../../src/lib/logs/search-log");
  });

  const seams = (over: Partial<Parameters<typeof runFacetWipe>[2]> = {}) => ({
    deleteDatoms: async () => 120,
    reclaimSpace: async () => {},
    ...over,
  });

  it("deletes, takes the keys, reclaims, and reports all three", async () => {
    const ended = await runFacetWipe("food", ["fdc:"], seams());

    expect(ended.kind).toBe("wiped");
    if (ended.kind !== "wiped") return;
    expect(ended.datomsDeleted).toBe(120);
    expect(ended.storageRemoved).toBe(Object.keys(FOOD_KEYS).length);
    expect(ended.reclaimed).toBe(true);
    expect(ended.message).toContain("handed back");
  });

  // The reclaim is best-effort and separate from the delete (ADR-0079 §4). The
  // rows are gone either way, and the sentence must not claim the space back.
  it("keeps the rows gone when the reclaim fails, and says the space is not free", async () => {
    const ended = await runFacetWipe(
      "food",
      ["fdc:"],
      seams({
        reclaimSpace: async () => {
          throw new Error("database or disk is full");
        },
      })
    );

    expect(ended.kind).toBe("wiped");
    if (ended.kind !== "wiped") return;
    expect(ended.reclaimed).toBe(false);
    expect(ended.message).toContain("could not be handed back");
  });

  // The ledger goes first because it holds the substance: a failure there has
  // to leave the keys standing too, since they have no transaction to roll back.
  it("takes no key at all when the ledger delete fails", async () => {
    const ended = await runFacetWipe(
      "food",
      ["fdc:"],
      seams({
        deleteDatoms: async () => {
          throw new Error("worker is gone");
        },
      })
    );

    expect(ended.kind).toBe("failed");
    expect(ended.message).toContain("Nothing was deleted");
    expect([...(localStorage as any).store.keys()].sort()).toEqual(
      [...Object.keys(OTHER_KEYS), ...Object.keys(FOOD_KEYS)].sort()
    );
  });

  it("does not attempt a reclaim after a delete that failed", async () => {
    let reclaims = 0;
    await runFacetWipe(
      "food",
      ["fdc:"],
      seams({
        deleteDatoms: async () => {
          throw new Error("worker is gone");
        },
        reclaimSpace: async () => {
          reclaims += 1;
        },
      })
    );
    expect(reclaims).toBe(0);
  });
});
