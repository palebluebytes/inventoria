import { describe, it, expect, beforeEach } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  appendDatoms,
  createLedgerSchema,
  type Datom,
  type LedgerDb,
} from "../../src/lib/db/db.core";
import { createHlc, type Hlc } from "../../src/lib/db/hlc";
import { projections } from "../../src/lib/db/projections";

// Each projection's WHERE clause, run against a jar holding one row of every
// shape the app writes. A fold cannot be trusted to keep another domain's rows
// out if the SELECT already handed them over, so this asserts the scope rather
// than the compute step: what a projection can see at all.
//
// ADR-0079 §1 makes this the difference between a scoped wipe that touches
// nothing else and one that visibly empties another Facet's screen, which is
// why it is pinned here rather than left to the Items tab to demonstrate.

let db: LedgerDb;
let clock: Hlc;

/** One row of every entity shape and every attribute namespace in the app. */
const JAR: Datom[] = [
  // food
  { entity: "fdc:171705", attribute: "food/name", value: "Butter", time: 1 },
  {
    entity: "gtin:3017620422003",
    attribute: "food/brand",
    value: "Ferrero",
    time: 1,
  },
  {
    entity: "gtin:3017620422003",
    attribute: "provenance/raw",
    value: "{}",
    time: 1,
  },
  {
    entity: "food:custom_abc_1",
    attribute: "food/name",
    value: "Plate",
    time: 1,
  },
  {
    entity: "food:custom_abc_1",
    attribute: "nutrition/info",
    value: "{}",
    time: 1,
  },
  { entity: "recipe:abc_1", attribute: "recipe/name", value: "Soup", time: 1 },
  {
    entity: "event:consume_abc_1",
    attribute: "event/type",
    value: "ConsumeAction",
    time: 1,
  },
  // media
  {
    entity: "tmdb:movie:550",
    attribute: "media/title",
    value: "Fight Club",
    time: 1,
  },
  {
    entity: "isbn:9780201379624",
    attribute: "media/title",
    value: "GoF",
    time: 1,
  },
  {
    entity: "event:engage_1_abc",
    attribute: "event/type",
    value: "WatchAction",
    time: 1,
  },
  // physical items
  {
    entity: "twin:manual_1_abc",
    attribute: "item/name",
    value: "Guitar",
    time: 1,
  },
  {
    entity: "twin:gtin_5000159407236",
    attribute: "item/name",
    value: "Snickers",
    time: 1,
  },
  {
    entity: "twin:gtin_5000159407236",
    attribute: "provenance/raw",
    value: "{}",
    time: 1,
  },
  {
    entity: "event:acquire_1_abc",
    attribute: "event/type",
    value: "AcquisitionAction",
    time: 1,
  },
  // habits, calendar, notes
  {
    entity: "habit:meditate_1",
    attribute: "habit/name",
    value: "Meditate",
    time: 1,
  },
  {
    entity: "event:execute_1_abc",
    attribute: "event/type",
    value: "ExecuteAction",
    time: 1,
  },
  {
    entity: "cal_event:dentist_1",
    attribute: "cal_event/name",
    value: "Dentist",
    time: 1,
  },
  {
    entity: "event:occur_1_abc",
    attribute: "event/type",
    value: "OccurAction",
    time: 1,
  },
  { entity: "notes:doc", attribute: "notes/op", value: "[]", time: 1 },
];

/** The entities one projection's SELECT can reach. */
function reaches(name: keyof typeof projections): Set<string> {
  const out = new Set<string>();
  (db as any).exec({
    sql: projections[name].sql,
    rowMode: "object",
    callback: (r: any) => out.add(r.entity),
  });
  return out;
}

beforeEach(async () => {
  const sqlite3 = await (sqlite3InitModule as any)();
  db = new sqlite3.oo1.DB();
  createLedgerSchema(db);
  clock = createHlc("dev-a", { wallClock: () => 1000 });
  appendDatoms(db, JAR, clock);
});

describe("projection scopes (ADR-0076 §4, ADR-0086 §5)", () => {
  it("keeps food out of the Items tab (#280)", () => {
    // The defect this replaced: ACQUISITION_LIBRARY selected `attribute LIKE
    // 'twin/%'`, and every food twin writes into that shell, so every logged
    // food was listed as a nameless "wanted" item. It is the reason ADR-0079 §1
    // made this a prerequisite of the Facet-scoped wipe.
    const seen = reaches("ACQUISITION_LIBRARY");
    expect(seen.has("twin:manual_1_abc")).toBe(true);
    expect(seen.has("event:acquire_1_abc")).toBe(true);
    for (const foodEntity of [
      "fdc:171705",
      "gtin:3017620422003",
      "food:custom_abc_1",
      "recipe:abc_1",
      "event:consume_abc_1",
    ]) {
      expect(seen.has(foodEntity)).toBe(false);
    }
  });

  it("still reaches a scraped item, whose provenance blob is shared with food", () => {
    // `provenance/raw` is written by the ingestion registry for every domain and
    // is deliberately owned by nobody (ADR-0086 §5). It is safe precisely
    // because nothing scopes by it: the scraped item arrives on its entity.
    expect(reaches("ACQUISITION_LIBRARY").has("twin:gtin_5000159407236")).toBe(
      true
    );
  });

  it("gives each projection only its own domain's events", () => {
    const eventsOf = (name: keyof typeof projections) =>
      [...reaches(name)].filter((e) => e.startsWith("event:")).sort();
    expect(eventsOf("ACQUISITION_LIBRARY")).toEqual(["event:acquire_1_abc"]);
    expect(eventsOf("MEDIA_LIBRARY")).toEqual(["event:engage_1_abc"]);
    expect(eventsOf("HABITS_LINEAGES")).toEqual(["event:execute_1_abc"]);
    expect(eventsOf("CAL_EVENTS")).toEqual(["event:occur_1_abc"]);
    expect(eventsOf("CONSUMPTION")).toEqual(["event:consume_abc_1"]);
  });

  it("leaves the notes op-log to its own direct SELECT", () => {
    // ADR-0018: notes is the one Tracked Domain with no Projection. No
    // projection may reach it, or a wipe derived from one would take it.
    for (const name of Object.keys(
      projections
    ) as (keyof typeof projections)[]) {
      expect(reaches(name).has("notes:doc")).toBe(false);
    }
  });

  it("scopes by attribute only where the namespace has one writer", () => {
    // ADR-0076 §4 sanctions an attribute-scoped twin arm as a read convenience
    // for heterogeneously-named entities, and forbids a *Facet-scoped
    // operation* from copying it. The line between the two is whether the
    // namespace has one writer: `media/`, `food/` and `recipe/` do, and `twin/`
    // did not, which is the whole of #280.
    const attributeArms = Object.values(projections)
      .flatMap((p) => p.sql.match(/attribute LIKE '([a-z_]+\/)%'/g) ?? [])
      .map((m) => m.replace(/.*'(.+)%'.*/, "$1"));
    expect(attributeArms.sort()).toEqual(["food/", "media/", "recipe/"]);
    // The two shells every domain writes into. Neither may ever appear above.
    expect(attributeArms).not.toContain("twin/");
    expect(attributeArms).not.toContain("event/");
    expect(attributeArms).not.toContain("provenance/");
  });

  it("reaches every food entity from the food projection, and nothing else's twins", () => {
    // ADR-0076's Consequences name this as clause 4's weak joint: a scoped wipe
    // is only correct if the prefixes listed for a domain are all of them.
    const seen = reaches("CONSUMPTION");
    for (const foodEntity of [
      "fdc:171705",
      "gtin:3017620422003",
      "food:custom_abc_1",
      "recipe:abc_1",
      "event:consume_abc_1",
    ]) {
      expect(seen.has(foodEntity)).toBe(true);
    }
    expect(seen.has("twin:manual_1_abc")).toBe(false);
    expect(seen.has("tmdb:movie:550")).toBe(false);
    expect(seen.has("habit:meditate_1")).toBe(false);
  });
});
