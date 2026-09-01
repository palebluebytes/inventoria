import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  FACETS,
  TRACKED_DOMAINS,
  entityPrefixesOf,
  facetOf,
  type FacetId,
  nestedFacetsOf,
  ownerOfEntity,
  ownerOfViewModule,
  PRECACHE_BAND,
  precacheBandOf,
  screenOf,
  screensOf,
  storagePrefixesOf,
  VIEWS_ROOT,
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

  it("keeps the roster at two, both built", () => {
    // Installability is definitional (ADR-0076 §1), so Rations became `built`
    // when #305 gave it a manifest — not when #301 gave it a screen.
    expect(FACETS.map((f) => f.id)).toEqual(["root", "food"]);
    expect(FACETS.filter((f) => f.status === "built").map((f) => f.id)).toEqual(
      ["root", "food"]
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

  it("leads each Facet's icons with the mark it installs under", () => {
    // The field was absent for Rations until #302 minted one, because a path to
    // a file that is not there is the lie this module's header refuses. It
    // became a list in #305, which is the ticket that had to decide what a
    // manifest enumerates; the `any`-purpose mark still leads it, and every
    // entry being a real file is asserted in facet-manifest.test.ts against the
    // manifest that names them.
    const marks: [FacetId, string][] = [
      ["root", "/favicon.svg"],
      ["food", "/food/icons/rations-512.png"],
    ];
    for (const [id, path] of marks) {
      const [lead, ...rest] = facetOf(id).icons;
      expect(lead.src).toBe(path);
      expect(lead.purpose).toBeUndefined();
      const served = new URL(`../../public${path}`, import.meta.url);
      expect({ path, served: existsSync(fileURLToPath(served)) }).toEqual({
        path,
        served: true,
      });
      expect(rest.every((i) => i.src !== path)).toBe(true);
    }
  });
});

// #309. What the build-time gates read off this registry (ADR-0083 §4). The
// rules that consume these live in `src/lib/facets/checks.ts` and are tested
// beside it; what is here is the registry keeping its own promises, including
// the one its header makes about never naming a file that is not there.
describe("what the Facet gates read off the registry (ADR-0083 §4)", () => {
  const path = (relative: string) =>
    new URL(`../../${relative}`, import.meta.url);

  it("owns only paths that are there, for every Tracked Domain", () => {
    // The same rule as the icons above, and the registry header's own: a path to
    // a file that is not there is the lie this module refuses. A screen declared
    // at a module that has moved fails the containment check as a *missing*
    // screen, which reads as a broken build rather than as a stale registry.
    for (const domain of TRACKED_DOMAINS) {
      for (const owned of domain.views) {
        expect({
          owned,
          exists: existsSync(fileURLToPath(path(owned))),
        }).toEqual({ owned, exists: true });
      }
      expect(screenOf(domain)).toBe(domain.views[0]);
      expect(screenOf(domain).startsWith(VIEWS_ROOT)).toBe(true);
      expect(screenOf(domain).endsWith("/")).toBe(false);
    }
  });

  it("counts two domains sharing one screen once", () => {
    // The root has six tabs and six domains and they are not the same six:
    // habits and calendar events both draw through AgendaView. A gate that
    // expected one screen per domain would never be satisfiable.
    expect(screensOf("root")).toEqual([
      "src/lib/views/AgendaView.svelte",
      "src/lib/views/FoodView.svelte",
      "src/lib/views/ItemsView.svelte",
      "src/lib/views/MediaView.svelte",
      "src/lib/views/NotesView.svelte",
    ]);
    expect(screensOf("food")).toEqual(["src/lib/views/FoodView.svelte"]);
    expect(screensOf("nothing-on-the-roster")).toEqual([]);
  });

  it("owns a screen's components as well as its screen", () => {
    // The half that makes ADR-0078 §8's claim worth checking: the six screens
    // are six of the ninety modules under src/lib/views/, so an ItemCard reached
    // from a food component is the crossing one file below a screen.
    expect(ownerOfViewModule("src/lib/views/items/ItemCard.svelte")?.id).toBe(
      "items"
    );
    expect(ownerOfViewModule("src/lib/views/FoodView.svelte")?.id).toBe("food");
    // Only habits owns `views/habits/`, though calendar shares the screen: a
    // shared directory would be two owners for one path.
    expect(
      ownerOfViewModule("src/lib/views/habits/HabitsSection.svelte")?.id
    ).toBe("habits");
  });

  it("leaves the jar-wide surface unowned, on purpose", () => {
    // `SettingsView` and the blocks under it are nobody's domain screen, and
    // which Facet carries one is the judgement ADR-0083 §10 declined to gate.
    // The containment check counts these rather than passing them in silence.
    // Real modules, all of them — `HabitsView.svelte` included, which is named
    // by nothing in `src/` and is in neither build.
    for (const unowned of [
      "src/lib/views/SettingsView.svelte",
      "src/lib/views/ledger/LedgerExport.svelte",
      "src/lib/views/logs/LogReviewSheet.svelte",
      "src/lib/views/storage/StorageStatus.svelte",
      "src/lib/views/HabitsView.svelte",
    ]) {
      expect({
        unowned,
        owner: ownerOfViewModule(unowned),
        exists: existsSync(fileURLToPath(path(unowned))),
      }).toEqual({ unowned, owner: null, exists: true });
    }
  });

  it("derives a Facet's band from the one figure it declares", () => {
    for (const facet of FACETS) {
      const { floor, ceiling } = precacheBandOf(facet);
      expect(floor).toBeLessThan(facet.precacheBytes);
      expect(ceiling).toBeGreaterThan(facet.precacheBytes);
      expect(ceiling - facet.precacheBytes).toBe(
        Math.round(facet.precacheBytes * PRECACHE_BAND)
      );
    }
  });

  it("knows which Facet has another inside its scope", () => {
    // The asymmetry every nesting consequence turns on, and the reason neither
    // the cleanup rule nor the navigation denylist is written against `root`.
    expect(nestedFacetsOf("root").map((f) => f.id)).toEqual(["food"]);
    expect(nestedFacetsOf("food")).toEqual([]);
  });
});
