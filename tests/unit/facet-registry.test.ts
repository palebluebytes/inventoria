import { describe, it, expect } from "vitest";
import {
  FACETS,
  TRACKED_DOMAINS,
  entityPrefixesOf,
  facetOf,
  ownerOfEntity,
  storagePrefixesOf,
} from "../../src/lib/facets/registry";
import { isDeclaredEntity, mintEntity } from "../../src/lib/facets/entity-id";

// The registry's *shape* invariants — one owner per prefix, no cross-owner
// containment — are asserted by scripts/entity-ownership-check.mjs, which also
// reads src/ and is therefore the only place that can catch the defect that
// actually happened (ADR-0086 §7). What is left for a unit test is the derived
// reads, which is where a Facet-scoped wipe gets its predicate.

describe("the Facet registry (ADR-0076 §6, ADR-0086 §1)", () => {
  it("derives a Facet's prefixes from its domains rather than storing them", () => {
    // ADR-0080 §8's surviving rule: no field re-recording a conclusion whose
    // reason is discarded. Rations owns exactly what the food domain owns.
    expect(entityPrefixesOf("food").sort()).toEqual(
      [...TRACKED_DOMAINS.find((d) => d.id === "food")!.entityPrefixes].sort()
    );
  });

  it("gives the root every prefix, because Facets overlap rather than partition", () => {
    // ADR-0076 §3. This is also why the owner cannot be a Facet: under
    // Facet-ownership every prefix below would have two owners.
    const root = entityPrefixesOf("root");
    for (const domain of TRACKED_DOMAINS) {
      for (const prefix of domain.entityPrefixes) {
        expect(root).toContain(prefix);
      }
    }
    expect(entityPrefixesOf("food").every((p) => root.includes(p))).toBe(true);
  });

  it("names one owner for every entity the app can mint", () => {
    const minted = [
      ["fdc:171705", "food"],
      ["gtin:3017620422003", "food"],
      ["food:custom_abc_1", "food"],
      ["recipe:abc_1", "food"],
      ["event:consume_abc_1", "food"],
      ["tmdb:movie:550", "media"],
      ["tmdb:tv:1396", "media"],
      ["isbn:9780201379624", "media"],
      ["olid:OL1M", "media"],
      ["event:engage_1_abc", "media"],
      ["twin:manual_1_abc", "items"],
      ["twin:gtin_5000159407236", "items"],
      ["twin:dpp_did:dpp:eu:1", "items"],
      ["event:acquire_1_abc", "items"],
      ["habit:meditate_1", "habits"],
      ["event:execute_1_abc", "habits"],
      ["cal_event:dentist_1", "calendar"],
      ["event:occur_1_abc", "calendar"],
      ["notes:doc", "notes"],
    ] as const;
    for (const [entity, owner] of minted) {
      expect([entity, ownerOfEntity(entity)?.id]).toEqual([entity, owner]);
    }
  });

  it("owns nothing it did not declare", () => {
    // `event:` bare and `consent:` are nobody's — the first because five
    // domains write beneath it, the second because ADR-0086 §2 deleted it.
    for (const stray of [
      "event:",
      "consent:log_export",
      "settings:global",
      "x:1",
    ]) {
      expect(ownerOfEntity(stray)).toBeNull();
      expect(isDeclaredEntity(stray)).toBe(false);
    }
  });

  it("resolves a nested prefix to the same owner from either end", () => {
    // ADR-0086 §8: same-owner containment is legal and expected. `twin:gtin_1`
    // is matched by `twin:` and by `twin:gtin_`, and both are items'.
    expect(ownerOfEntity("twin:gtin_1")?.id).toBe("items");
    expect(ownerOfEntity("twin:1")?.id).toBe("items");
  });

  it("gives Rations food's localStorage keys and none of the root's", () => {
    // ADR-0079 §2: the wipe takes what the Facet owns, in whatever store it
    // sits. The scraper proxy is the physical-item domain's and must survive.
    const food = storagePrefixesOf("food");
    expect(food).toContain("inventoria_pref_food_");
    expect(food).not.toContain("inventoria_device_scraper_proxy_url");
    expect(storagePrefixesOf("root")).toContain(
      "inventoria_device_scraper_proxy_url"
    );
  });

  it("keeps the roster at two, with one built", () => {
    expect(FACETS.map((f) => f.id)).toEqual(["root", "food"]);
    expect(FACETS.filter((f) => f.status === "built").map((f) => f.id)).toEqual(
      ["root"]
    );
  });
});

describe("mintEntity (ADR-0086 §7)", () => {
  it("is the whole of the construction, so a caller cannot drift from it", () => {
    expect(mintEntity("gtin:", "3017620422003")).toBe("gtin:3017620422003");
    expect(mintEntity("tmdb:movie:", 550)).toBe("tmdb:movie:550");
    expect(mintEntity("twin:gtin_", "5000159407236")).toBe(
      "twin:gtin_5000159407236"
    );
  });

  it("mints only ids the registry accounts for", () => {
    for (const domain of TRACKED_DOMAINS) {
      for (const prefix of domain.entityPrefixes) {
        expect(isDeclaredEntity(mintEntity(prefix, "1"))).toBe(true);
        expect(ownerOfEntity(mintEntity(prefix, "1"))?.id).toBe(domain.id);
      }
    }
  });
});

// The half ADR-0076 §6 declared and deliberately did not write, because "an
// entry pointing at an entry point that has not been built would be a lie in
// code". #301 builds Rations' entry point, so scope, name and start URL become
// true and are asserted here.
describe("what a Facet says about its entry point (ADR-0076 §6)", () => {
  it("gives every Facet a scope that contains its own start URL", () => {
    for (const facet of FACETS) {
      expect([facet.id, facet.startUrl.startsWith(facet.scope)]).toEqual([
        facet.id,
        true,
      ]);
    }
  });

  it("puts Rations inside the root, which is why only one of them can eject a user", () => {
    // ADR-0078 §3. `/food/` is inside `/`, so the root links to Rations without
    // leaving its own scope — the asymmetry of the no-way-out rule falls out of
    // the scopes rather than being written down as an exception.
    const root = facetOf("root");
    const rations = facetOf("food");
    expect(rations.scope.startsWith(root.scope)).toBe(true);
    expect(root.scope.startsWith(rations.scope)).toBe(false);
  });

  it("names Rations, so its entry point reads its title off the registry", () => {
    expect(facetOf("food").name).toBe("Rations");
    expect(facetOf("food").scope).toBe("/food/");
    expect(facetOf("food").startUrl).toBe("/food/");
  });

  it("leaves Rations' icon absent rather than stubbed", () => {
    // The root's is a file that exists. Rations' is #302's to mint, and a path
    // to a file that is not there would be exactly the lie this module's header
    // refuses — so the field is absent until it is true.
    expect(facetOf("root").icon).toBe("/favicon.svg");
    expect(facetOf("food").icon).toBeUndefined();
  });
});
