/**
 * A lane's scope, and the intersection that agrees one (ADR-0105 §1–§3).
 *
 * Everything here is pure: what a Facet's pairing act scopes its lane to, what
 * two such statements agree on, and what an older peer's silence is read as.
 * What that scope does to a real ledger is `first-sync.test.ts`', because the
 * claim is about rows and a claim about rows is proved against `datoms`.
 */
import { describe, it, expect } from "vitest";
import {
  laneScope,
  LaneScopeRefusedError,
  readLaneScope,
  scopeOfFacet,
  WHOLE_JAR,
} from "../../src/lib/p2p/lane-scope";
import {
  entityPrefixesOf,
  entityPrefixesOfDomains,
  TRACKED_DOMAINS,
} from "../../src/lib/facets/registry";

describe("a Facet's pairing act scopes its lane (ADR-0105 §1)", () => {
  it("gives the root the whole Jar, the Jar domain included", () => {
    // §1: *the root Facet's scope is the whole Jar*. The Jar domain is in no
    // Facet's `domains`, so a scope that were merely the Facet's own list would
    // leave a root-to-root lane unable to carry a Carried deletion.
    expect(scopeOfFacet("root")).toEqual(TRACKED_DOMAINS.map((d) => d.id));
    expect(scopeOfFacet("root")).toContain("jar");
  });

  it("gives Rations its one domain and nothing beside it", () => {
    expect(scopeOfFacet("food")).toEqual(["food"]);
  });

  it("derives the lane's prefixes the way a Facet-scoped wipe derives its own", () => {
    // §1: *derived and never authored* — one function turns domains into
    // prefixes, and `entityPrefixesOf` is that same function read through a
    // Facet's own list.
    expect(entityPrefixesOfDomains(scopeOfFacet("food"))).toEqual(
      entityPrefixesOf("food")
    );
  });

  it("carries every declared prefix on a whole-Jar lane, so the root's lane narrows nothing", () => {
    expect(entityPrefixesOfDomains(WHOLE_JAR).sort()).toEqual(
      TRACKED_DOMAINS.flatMap((d) => [...d.entityPrefixes]).sort()
    );
  });

  it("gives a domain this build does not know no prefixes at all", () => {
    // A scope read off a later build's wire, or off a record one wrote. It is
    // inert rather than refused: no row here can belong to it.
    expect(entityPrefixesOfDomains(["food", "chores"])).toEqual(
      entityPrefixesOf("food")
    );
  });
});

describe("the two sides agree the scope by intersection (ADR-0105 §3)", () => {
  const root = scopeOfFacet("root");
  const rations = scopeOfFacet("food");

  it("makes root to root the whole Jar", () => {
    expect(laneScope(root, root)).toEqual(WHOLE_JAR);
  });

  it("makes Rations to Rations food", () => {
    expect(laneScope(rations, rations)).toEqual(["food"]);
  });

  it("makes Rations to root food, with nobody choosing", () => {
    expect(laneScope(rations, root)).toEqual(["food"]);
  });

  it("makes root to Rations food, which is the same lane read from the other end", () => {
    // §3's *intersection is the only rule that is symmetric*: a lane whose two
    // ends ran different predicates would filter `above` over different domain
    // sets, which is a silent divergence rather than an error.
    expect(laneScope(root, rations)).toEqual(laneScope(rations, root));
  });

  it("keeps the roster's own order, so both ends spell one scope one way", () => {
    expect(laneScope(["notes", "food"], ["food", "notes"])).toEqual([
      "food",
      "notes",
    ]);
  });

  it("drops a domain only one end knows", () => {
    expect(laneScope(rations, ["media"])).toEqual([]);
  });
});

describe("a scope arriving off the wire (ADR-0105 §3, §11)", () => {
  it("reads a peer that stated nothing as the whole Jar", () => {
    // The forward-compatibility argument §11 makes for a vector: a build that
    // states no domains predates this one, and before this one the pairing
    // surface was the root's alone — so its lane was jar-wide. Reading it as
    // anything narrower would withhold rows from a healthy peer.
    expect(readLaneScope(undefined)).toEqual(WHOLE_JAR);
  });

  it("takes a domain this build has never heard of, and leaves it inert", () => {
    expect(readLaneScope(["food", "chores"])).toEqual(["food", "chores"]);
  });

  it("refuses something that is not a list of domains", () => {
    expect(() => readLaneScope("food")).toThrow(LaneScopeRefusedError);
    expect(() => readLaneScope([1])).toThrow(LaneScopeRefusedError);
    expect(() => readLaneScope([""])).toThrow(LaneScopeRefusedError);
  });

  it("keeps an empty statement apart from an absent one", () => {
    // The peer roster's distinction, one field along: *nothing stated* is a
    // build that predates the statement and is read as the whole Jar, where a
    // stated nothing is a lane that carries nothing. They are opposite claims,
    // so they must not collapse into one.
    expect(readLaneScope([])).toEqual([]);
    expect(readLaneScope(undefined)).toEqual(WHOLE_JAR);
  });
});
